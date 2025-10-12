import express from "express";
import mongoose from "mongoose";
import { Image } from "../models/imagesschema.js";
import { getPresignedUrl } from "../services/getPresignedUrl.js";
import { authMiddleware } from "../middlewares/auth.js";

const router = express.Router();

// POST /api/images/view-urls
// Body: { imageIds: [array of image ObjectIds as strings] }
router.post("/view",authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id; // assumed set by auth middleware
    const { imageIds } = req.body;

    if (!Array.isArray(imageIds) || imageIds.length === 0) {
      return res.status(400).json({ error: "imageIds array is required" });
    }

    const validImageIds = imageIds.filter((id) => mongoose.Types.ObjectId.isValid(id));
    if (validImageIds.length === 0) {
      return res.status(400).json({ error: "No valid imageIds provided" });
    }

    // Find images owned by user
    const images = await Image.find({
      _id: { $in: validImageIds },
      "images.uploadedBy": userId,
    }).select("images.key _id").lean();

    if (images.length === 0) {
      return res.status(404).json({ error: "No images found for user" });
    }

    // Generate presigned URLs for viewing (no forced download)
    const urls = await Promise.all(
      images.map(async (img) => {
        const key = img.images.key;
        const url = await getPresignedUrl(key);
        return {
          imageId: img._id,
          viewUrl: url,
        };
      })
    );

    return res.json({ urls });
  } catch (err) {
    console.error("Error generating view URLs:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
