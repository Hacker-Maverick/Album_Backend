// src/services/s3Delete.js
import { S3Client, DeleteObjectCommand, DeleteObjectsCommand } from "@aws-sdk/client-s3";

const s3 = new S3Client({ region: process.env.AWS_REGION });
const BUCKET = process.env.S3_BUCKET;

export async function deleteS3Object(key) {
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

export async function deleteS3Objects(keys = []) {
  if (!keys.length) return;
  const Objects = keys.map(Key => ({ Key }));
  await s3.send(new DeleteObjectsCommand({ Bucket: BUCKET, Delete: { Objects, Quiet: true } }));
}
