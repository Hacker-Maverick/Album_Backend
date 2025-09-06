import { S3Client } from "@aws-sdk/client-s3";

// Credentials are resolved by the default provider chain (env, shared config, IAM role)
// REGION must be set via AWS_REGION
export const s3 = new S3Client({}); // rely on environment / IAM role
