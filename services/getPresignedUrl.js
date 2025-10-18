// utils/getPresignedUrl.js
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import dotenv from "dotenv";
dotenv.config();

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

export const getPresignedUrl = async (key,Bucket) => {
  try {
    const command = new GetObjectCommand({
      Bucket,
      Key: key,
    });

    // Presigned URL valid for 15 minutes
    const url = await getSignedUrl(s3, command, { expiresIn: 900 });
    return url;
  } catch (err) {
    console.error("Error generating presigned URL:", err);
    return null;
  }
};
