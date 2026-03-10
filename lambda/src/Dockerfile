FROM node:20 AS builder

WORKDIR /app
RUN npm init -y
RUN npm install -g typescript
RUN npm install --save-dev @types/node @types/aws-lambda
COPY migration.ts ./
RUN tsc migration.ts

FROM public.ecr.aws/lambda/nodejs:20

COPY --from=builder /app/migration.js ${LAMBDA_TASK_ROOT}/
COPY ./prisma ${LAMBDA_TASK_ROOT}/
RUN npm i -g prisma

CMD [ "migration.handler" ]
