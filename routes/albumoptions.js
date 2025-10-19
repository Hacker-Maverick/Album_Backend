import express from "express";
import mongoose from "mongoose";
import { authMiddleware } from "../middlewares/auth.js"; // same as images-delete.js
import User from "../models/userschema.js";
import { Album } from "../models/albumschema.js";

const router = express.Router();
const API_URL = process.env.API_BASE_URL;

const isValidId = (id) =>
  mongoose.Types.ObjectId.isValid(id) &&
  String(new mongoose.Types.ObjectId(id)) === String(id);

/* ============================================================
   PUT /album/rename
   - Rename an album
   - Hidden album: CANNOT be renamed
   - Others: allowed (including main, per your latest instruction)
   Body: { albumId, newName }
============================================================ */
router.put("/album/rename", authMiddleware, async (req, res) => {
  try {
    const { albumId, newName } = req.body;
    if (!albumId || !isValidId(albumId) || !newName?.trim()) {
      return res.status(400).json({ message: "Valid albumId and newName required" });
    }

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    const hiddenGroup = user.groups?.find(
      (g) => g.groupName?.toLowerCase() === "hidden"
    );
    if (hiddenGroup && String(hiddenGroup.albumId) === String(albumId)) {
      return res.status(403).json({ message: "Hidden album cannot be renamed" });
    }

    if (user.main_album && String(user.main_album) === String(albumId)) {
        return res.status(403).json({ message: "Main album cannot be renamed" });
    }

    // Rename in user's groups if found there
    const group = user.groups?.find((g) => String(g.albumId) === String(albumId));
    if (group) {
      group.groupName = newName.trim();
      await user.save();
      return res.json({ message: "Album renamed", albumId, newName: group.groupName });
    }

    // If not in groups, optional: you can rename Album doc’s title field if you have one
    // But per your model, the display name for user albums comes from groupName.
    return res.status(404).json({ message: "Album not found in user's groups" });
  } catch (err) {
    console.error("Rename album error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/* ============================================================
   DELETE /album/delete
   - Deletes the album doc and removes it from user's groups
   - You said: Hidden CAN be deleted
   - This route does NOT delete images; the FE helper will call /delete first
   Body: { albumId }
============================================================ */
router.delete("/album/delete", authMiddleware, async (req, res) => {
  try {
    const { albumId } = req.body;

    if (!albumId || !isValidId(albumId))
      return res.status(400).json({ message: "Valid albumId required" });

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    // 🛑 Prevent deleting main album
    if (String(user.main_album) === String(albumId))
      return res.status(403).json({ message: "Main album cannot be deleted" });

    const album = await Album.findById(albumId);
    if (!album) return res.status(404).json({ message: "Album not found" });

    // Collect all image IDs
    const imageIds = [];
    for (const event of album.data || []) {
      for (const img of event.images || []) {
        imageIds.push(String(img));
      }
    }

    // If album has images → call /delete route to clean them up
    if (imageIds.length) {
      const response = await fetch(`${API_URL}/delete`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: req.headers.authorization,
        },
        body: JSON.stringify({
          albumId,
          albumIds: [albumId],
          imageIds,
          permanently: false,
        }),
      });

      const result = await response.json();
      if (!response.ok) {
        return res
          .status(response.status)
          .json({ message: result.message || "Failed to delete images." });
      }
    }

    // Remove from user's groups
    user.groups = (user.groups || []).filter(
      g => String(g.albumId) !== String(albumId)
    );
    await user.save();

    // Delete album document
    await Album.findByIdAndDelete(albumId);

    res.json({ message: "Album and its images deleted successfully", albumId });
  } catch (err) {
    console.error("Delete album error:", err);
    res.status(500).json({
      message: err.message || "Server error deleting album",
    });
  }
});

export default router;
