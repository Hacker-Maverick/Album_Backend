// routes/albums.js
import express from "express";
import { Album } from "../models/albumschema.js";
import { authMiddleware } from "../middlewares/auth.js";
import { getPresignedUrl } from "../services/getPresignedUrl.js";

const router = express.Router();

/**
 * GET /albums/:albumId/images?loaded=<loaded>&n=<n>
 * Returns next `n` images with presigned URLs for thumbnails
 */
router.get("/:albumId/images", authMiddleware, async (req, res) => {
  try {
    const { albumId } = req.params;
    const loaded = parseInt(req.query.loaded) || 0;
    const n = parseInt(req.query.n) || 10;

    const album = await Album.findById(albumId).populate("data.images");
    if (!album) return res.status(404).json({ message: "Album not found" });

    const events = album.data;

    let result = [];
    let remaining = n;
    let countLoaded = 0;

    for (const ev of events) {
      const totalImages = ev.images.length;

      if (countLoaded + totalImages <= loaded) {
        countLoaded += totalImages;
        continue;
      }

      const startIdx = Math.max(0, loaded - countLoaded);
      const endIdx = Math.min(totalImages, startIdx + remaining);

      // Use Promise.all to generate all presigned URLs concurrently
      const imagesToSend = await Promise.all(
        ev.images.slice(startIdx, endIdx).map(async (img) => ({
          id: img._id,
          key: img.images.key, // original (unexposed) S3 key
          thumbnailUrl: await getPresignedUrl(img.images.thumbnailKey), // presigned URL for frontend
        }))
      );

      result.push({
        event: ev.event,
        date: ev.date,
        images: imagesToSend,
        total: totalImages,
      });

      remaining -= imagesToSend.length;
      countLoaded += totalImages;
      if (remaining <= 0) break;
    }

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

export default router;
