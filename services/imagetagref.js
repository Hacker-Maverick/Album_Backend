// src/modules/images/image.service.js
import { Image } from "../models/imagesschema.js";

// +1 to ref for the first images[] element that matches uploadedBy + key
export async function incRefByUploaderAndKey({ uploadedBy, key }) {
  const res = await Image.updateOne(
    { "images.uploadedBy": uploadedBy, "images.key": key },
    { $inc: { "images.$.ref": 1 } }
  );
  // matchedCount > 0 means an element existed; modifiedCount > 0 means it was incremented
  return { matched: res.matchedCount > 0, modified: res.modifiedCount > 0 };
}

// -1 to ref for the first images[] element that matches uploadedBy + key
// Returns the new ref value when available, or null if not found.
export async function decRefByUploaderAndKey({ uploadedBy, key }) {
  const doc = await Image.findOneAndUpdate(
    { "images.uploadedBy": uploadedBy, "images.key": key },
    { $inc: { "images.$.ref": -1 } },
    { new: true, projection: { images: 1 } }
  );
  if (!doc) return { matched: false, modified: false, ref: null };

  const entry = doc.images.find(i => String(i.uploadedBy) === String(uploadedBy) && i.key === key);
  const ref = entry?.ref ?? null;

  return { matched: true, modified: true, ref };
}
