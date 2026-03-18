import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigw from "aws-cdk-lib/aws-apigateway";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as dotenv from "dotenv";
import path = require("path");
import * as cognito from "aws-cdk-lib/aws-cognito";

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

    // UserPool
    const userPool = new cognito.UserPool(this, "UserPool", {
      signInAliases: {
        email: true,
      }
    });
    const userPoolClient = new cognito.UserPoolClient(this, "UserPoolClient", {
  userPool,
  generateSecret: false,
  authFlows: {
    userPassword: true,
    userSrp: true,
  },
});

    // Authorizor
    const authorizer = new apigw.CognitoUserPoolsAuthorizer(this, "Authorizer", {
      cognitoUserPools: [userPool],
    })

    // VPCの作成
    const vpc = new ec2.Vpc(this, "TodoAppVpc", {
      maxAzs: 2,
      natGateways: 0,
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
      },
      timeout: cdk.Duration.seconds(30),
    });

    // API Gatewayの作成
    const apiGw = new apigw.LambdaRestApi(this, "honoApi", {
      handler: honoLambda,
      proxy: true,
      defaultMethodOptions: {
        authorizer,
        authorizationType: apigw.AuthorizationType.COGNITO,
      }
    });

    // 出力の設定
    new cdk.CfnOutput(this, "ApiEndpoint", {
      value: apiGw.url,
      description: "API Gateway endpoint URL",
    });
  }
}
