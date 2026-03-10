import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
// import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigw from "aws-cdk-lib/aws-apigateway";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as rds from "aws-cdk-lib/aws-rds";
import * as dotenv from "dotenv";
import path = require("path");
import * as fs from "fs";
import * as cr from "aws-cdk-lib/custom-resources";

// 環境変数の読み込み
dotenv.config();

// 必須の環境変数をチェックする関数
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Environment variable ${name} is required`);
  }
  return value;
}


export class HonoPrismaSampleStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // 環境変数から値を取得
    const databaseName = requireEnv("RDS_DATABASE_NAME");
    const username = requireEnv("RDS_USERNAME");
    const password = requireEnv("RDS_PASSWORD");

    // VPCの作成
    const vpc = new ec2.Vpc(this, "TodoAppVpc", {
      maxAzs: 2,
      natGateways: 0,
    });

    // RDSのセキュリティグループ
    const dbSecurityGroup = new ec2.SecurityGroup(this, "DbSecurityGroup", {
      vpc,
      description: "Security group for Aurora database",
      allowAllOutbound: true,
    });

    // Aurora MySQL クラスターの作成
    const cluster = new rds.DatabaseCluster(this, "TodoDatabase", {
      engine: rds.DatabaseClusterEngine.auroraMysql({
        version: rds.AuroraMysqlEngineVersion.VER_3_07_1,
      }),
      serverlessV2MinCapacity: 0.5,
      serverlessV2MaxCapacity: 1,
      credentials: {
        username: username,
        password: cdk.SecretValue.unsafePlainText(password),
      },
      writer: rds.ClusterInstance.serverlessV2("writer", {
        autoMinorVersionUpgrade: false,
        instanceIdentifier: "hono-db-writer",
        publiclyAccessible: false,
      }),
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
      },
      securityGroups: [dbSecurityGroup],
      defaultDatabaseName: databaseName,
      // バックアップ保持期間（日数）
      backup: {
        retention: cdk.Duration.days(7),
      },
      // 削除保護（本番環境では true にすることを推奨）
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      enableDataApi: true,
    });

    // Lambda関数のセキュリティグループ
    const lambdaSecurityGroup = new ec2.SecurityGroup(
      this,
      "LambdaSecurityGroup",
      {
        vpc,
        description: "Security group for Lambda function",
        allowAllOutbound: true,
      }
    );

    // セキュリティグループ間の通信許可
    dbSecurityGroup.addIngressRule(
      lambdaSecurityGroup,
      ec2.Port.tcp(3306),
      "Allow Lambda to access Aurora MySQL"
    );

    // Lambda関数の作成
    const honoLambda = new NodejsFunction(this, "lambda", {
      entry: "lambda/index.ts",
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_20_X,
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
      },
      securityGroups: [lambdaSecurityGroup],
      environment: {
        BASIC_USERNAME: requireEnv("BASIC_USERNAME"),
        BASIC_PASSWORD: requireEnv("BASIC_PASSWORD"),
        DATABASE_URL: `mysql://${username}:${password}@${cluster.clusterEndpoint.hostname}:${cluster.clusterEndpoint.port}/${databaseName}`,
      },
      timeout: cdk.Duration.seconds(30),
      memorySize: 1024,
      architecture: lambda.Architecture.X86_64,
      bundling: {
        // commandHooksでインストール前、バンドル前、後にコマンドを組み込める
        commandHooks: {
          beforeInstall(inputDir: string, outputDir: string): string[] {
            return [``];
          },
          beforeBundling(inputDir: string, outputDir: string): string[] {
            return [``];
          },
          afterBundling(inputDir: string, outputDir: string): string[] {
            return [
              // クエリエンジンを追加
              `cp ${inputDir}/node_modules/.prisma/client/libquery_engine-debian-openssl-3.0.x.so.node ${outputDir}`,
              // スキーマ定義を追加
              `cp ${inputDir}/lambda/src/prisma/schema.prisma ${outputDir}`,
            ];
          },
        },
      },
    });

    // API Gatewayの作成
    const apiGw = new apigw.LambdaRestApi(this, "honoApi", {
      handler: honoLambda,
      proxy: true,
    });

    // マイグレーション用のLambda関数
    const migrationLambda = new lambda.DockerImageFunction(
      this,
      "MigrationLambda",
      {
        code: lambda.DockerImageCode.fromImageAsset("lambda/src", {
          file: "Dockerfile",
          cmd: ["migration.handler"],
        }),
        vpc,
        vpcSubnets: {
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
        securityGroups: [lambdaSecurityGroup],
        environment: {
          DATABASE_URL: `mysql://${username}:${password}@${cluster.clusterEndpoint.hostname}:${cluster.clusterEndpoint.port}/${databaseName}`,
        },
        timeout: cdk.Duration.minutes(15),
        memorySize: 1024,
        architecture: lambda.Architecture.ARM_64,
      }
    );

    // 最新のマイグレーションファイル名を取得
    const migrationsDir = path.join(
      __dirname,
      "../lambda/src/prisma/migrations"
    );
    const latestMigration = fs
      .readdirSync(migrationsDir)
      .filter((file) => file !== "migration_lock.toml")
      .sort((a, b) => b.localeCompare(a))[0];

    console.log(latestMigration);

    // カスタムリソースプロバイダーの作成
    const provider = new cr.Provider(this, "MigrationProvider", {
      onEventHandler: migrationLambda,
    });

    // カスタムリソースの作成
    const migrationCustomResource = new cdk.CustomResource(
      this,
      "MigrationCustomResource",
      {
        serviceToken: provider.serviceToken,
        properties: {
          latestMigration: latestMigration,
        },
      }
    );

    // 明示的な依存関係の追加
    migrationCustomResource.node.addDependency(cluster);

    // 出力の設定
    new cdk.CfnOutput(this, "ApiEndpoint", {
      value: apiGw.url,
      description: "API Gateway endpoint URL",
    });
  }
}
