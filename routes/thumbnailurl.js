// routes/images.js
import express from "express";
import { Image } from "../models/imagesschema.js";
import { authMiddleware } from "../middlewares/auth.js";
import { getPresignedUrl } from "../services/getPresignedUrl.js";

const router = express.Router();

/**
 * POST /images/thumbnails
 * Fetch presigned thumbnail URLs by image IDs.
 * Body: { imageIds: [] }
 * Returns: [{ id, thumbnailUrl }]
 */
router.post("/thumbnails", authMiddleware, async (req, res) => {
  try {
    const { imageIds } = req.body;
    if (!imageIds || !Array.isArray(imageIds))
      return res.status(400).json({ message: "imageIds must be an array" });

    const images = await Image.find({ _id: { $in: imageIds } }).lean();

    const urls = await Promise.all(
      images.map(async (img) => ({
        id: img._id,
        thumbnailUrl: await getPresignedUrl(
          img.images.thumbnailKey,
          process.env.THUMB_BUCKET
        ),
      }))
    );

    res.json({ urls });
  } catch (err) {
    console.error("Error fetching thumbnails:", err);
    res.status(500).json({ message: "Server error" });
  }
});

export default router;
