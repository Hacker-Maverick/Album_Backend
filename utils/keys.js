// src/utils/keys.js
import { randomUUID } from "crypto";

export function mediaKey({ userId, ext, y, m }) {
  // s3://{BUCKET}/users/{userId}/{yyyy}/{mm}/{uuid}.{ext}
  return `users/${userId}/${y}/${m}/${randomUUID()}.${ext}`;
}

export function detectExt(mime) {
  if (!mime) return "bin";
  const map = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/heic": "heic",
    "image/heif": "heif",
    "video/mp4": "mp4",
    "video/quicktime": "mov",
    "video/webm": "webm"
  };
  return map[mime] || "bin";
}
