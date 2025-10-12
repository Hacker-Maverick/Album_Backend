// src/services/s3Delete.js
import { S3Client, DeleteObjectCommand, DeleteObjectsCommand } from "@aws-sdk/client-s3";

const s3 = new S3Client({ region: process.env.AWS_REGION });
const BUCKET = process.env.S3_BUCKET;
const THUMB_BUCKET = process.env.THUMB_BUCKET; // make sure this exists in your .env

/**
 * Delete a single object from main and thumbnail buckets
 * @param {string} key - The S3 object key (same key for thumbnail)
 */
export async function deleteS3Object(key) {
  if (!key) return;

  // Delete from main bucket
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
  } catch (err) {
    console.log(`Main delete failed for ${key}:`, err.message);
  }

  // Delete from thumbnail bucket
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: THUMB_BUCKET, Key: key }));
  } catch (err) {
    console.log(`Thumbnail delete failed for ${key}:`, err.message);
  }
}

/**
 * Delete multiple objects from main and thumbnail buckets
 * @param {string[]} keys - Array of S3 object keys
 */
export async function deleteS3Objects(keys = []) {
  if (!keys.length) return;

  const Objects = keys.map(Key => ({ Key }));

  // Delete from main bucket
  try {
    await s3.send(
      new DeleteObjectsCommand({
        Bucket: BUCKET,
        Delete: { Objects, Quiet: true },
      })
    );
  } catch (err) {
    console.log("Batch delete failed (main bucket):", err.message);
  }

  // Delete from thumbnail bucket
  try {
    await s3.send(
      new DeleteObjectsCommand({
        Bucket: THUMB_BUCKET,
        Delete: { Objects, Quiet: true },
      })
    );
  } catch (err) {
    console.log("Batch delete failed (thumbnail bucket):", err.message);
  }
}
