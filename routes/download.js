import express from "express";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import mongoose from "mongoose";
import { Image } from "../models/imagesschema.js";
import { authMiddleware } from "../middlewares/auth.js";

const router = express.Router();

const s3Client = new S3Client({ region: process.env.AWS_REGION });
const BUCKET_NAME = process.env.S3_BUCKET;

// POST /api/images/download-urls
// Body: { imageIds: [array of image ObjectIds as strings] }
router.post("/download", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id; // assume populated by auth middleware
    const { imageIds } = req.body;

    if (!Array.isArray(imageIds) || imageIds.length === 0) {
      return res.status(400).json({ error: "imageIds array is required" });
    }

    const validImageIds = imageIds.filter((id) => mongoose.Types.ObjectId.isValid(id));
    if (validImageIds.length === 0) {
      return res.status(400).json({ error: "No valid imageIds provided" });
    }

    // Find images owned by this user matching IDs
    const images = await Image.find({
      _id: { $in: validImageIds },
    }).select("images.key _id").lean();

    if (images.length === 0) {
      return res.status(404).json({ error: "No images found for user" });
    }

    // Generate pre-signed URLs with attachment disposition
    const urls = await Promise.all(
      images.map(async (img) => {
        const key = img.images.key;
        const command = new GetObjectCommand({
          Bucket: BUCKET_NAME,
          Key: key,
          ResponseContentDisposition: `attachment; filename="${key.split("/").pop()}"`,
        });
        const url = await getSignedUrl(s3Client, command, { expiresIn: 600 }); // 600s = 10 mins
        return {
          imageId: img._id,
          downloadUrl: url,
        };
      })
    );

    return res.json({ urls });
  } catch (err) {
    console.error("Error generating download URLs:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
