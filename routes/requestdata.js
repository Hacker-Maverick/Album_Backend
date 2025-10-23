// routes/requests.js
import express from "express";
import User from "../models/userschema.js";
import { authMiddleware } from "../middlewares/auth.js";
import { getPresignedUrl } from "../services/getPresignedUrl.js";

const router = express.Router();

/**
 * GET /requests
 * Authenticated → returns user's requests populated with from.username
 * Response shape:
 * {
 *   requests: [
 *     {
 *       from: "alice",
 *       date: "...",
 *       imageIds: ["...", "..."],   // raw ids for viewer
 *       images: [{ id, thumbnailUrl }]
 *     }, ...
 *   ]
 * }
 */
router.get("/requests", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .populate("requests.from", "username")
      .populate("requests.images", "images.thumbnailKey");

    if (!user) return res.status(404).json({ message: "User not found" });

    const requests = await Promise.all(
      user.requests.map(async (r) => {
        const imageThumbs = await Promise.all(
          r.images.map(async (imgDoc) => ({
            id: imgDoc._id,
            thumbnailUrl: await getPresignedUrl(
              imgDoc.images.thumbnailKey,
              process.env.THUMB_BUCKET
            ),
          }))
        );
        return {
          from: r.from?.username || "Unknown",
          date: r.date,
          imageIds: r.images.map((imgDoc) => String(imgDoc._id)),
          images: imageThumbs,
        };
      })
    );

    res.json({ requests });
  } catch (err) {
    console.error("Error fetching requests:", err);
    res.status(500).json({ message: "Server error" });
  }
});

export default router;
