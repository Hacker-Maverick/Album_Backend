// src/services/s3Presign.js
import { PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3 } from "../config/aws.js";

const DEFAULT_EXPIRES = 900; // 15 minutes

export async function presignPutUrl({ bucket, key, contentType, expiresIn = DEFAULT_EXPIRES }) {
  const cmd = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
    ACL: "private"
  });
  const url = await getSignedUrl(s3, cmd, { expiresIn });
  return url;
}

export async function headObject({ bucket, key }) {
  const cmd = new HeadObjectCommand({ Bucket: bucket, Key: key });
  return s3.send(cmd);
}
