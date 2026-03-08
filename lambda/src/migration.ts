import { execSync } from "child_process";
import {
  CdkCustomResourceHandler,
  CdkCustomResourceResponse,
} from "aws-lambda";
import { v4 as uuidv4 } from 'uuid';

export const handler: CdkCustomResourceHandler = async (event) => {
  const physicalResourceId = event.ResourceProperties.physicalResourceId ?? uuidv4();
  if (event.RequestType === "Delete") {
    return {
      PhysicalResourceId: physicalResourceId,
    };
  }
  if (!process.env.DATABASE_URL) {
    throw new Error("DB_CONNECTION is not set");
  }

  return new Promise<CdkCustomResourceResponse>((resolve) => {
    setInterval(() => {
      try {

        const stdout = execSync(`prisma migrate deploy`, {
          env: {
            ...process.env,
            DATABASE_URL: process.env.DATABASE_URL,
          }
        });
        console.log(stdout.toString());
        resolve({
          PhysicalResourceId: physicalResourceId,
        });
      } catch (error) {
        console.error("Migration is failed %s, will be retry...", error);
      }
    }, 10 * 1000);
  });
};
