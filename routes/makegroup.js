// src/routes/makegroup.js
import express from "express";
import mongoose from "mongoose";
import { authMiddleware } from "../middlewares/auth.js";
import User from "../models/userschema.js";
import { createEmptyAlbum } from "../utils/createAlbum.js";

const router = express.Router();

const e400 = (res, m) => res.status(400).json({ code: "VALIDATION_ERROR", message: m });
const e404 = (res, m) => res.status(404).json({ code: "NOT_FOUND", message: m });
const e500 = (res, m) => res.status(500).json({ code: "SERVER_ERROR", message: m });

// ==========================================================
// 🆕 POST /makegroup
// Create a new album and add it to user's "groups" array
// ==========================================================
router.post("/makegroup", authMiddleware, async (req, res) => {
  try {
    const { albumType, albumName } = req.body;

    // Validate inputs
    if (!albumType || typeof albumType !== "string") return e400(res, "albumType is required and must be a string");
    if (!albumName || typeof albumName !== "string") return e400(res, "albumName is required and must be a string");

    const user = await User.findById(req.user.id);
    if (!user) return e404(res, "user not found");

    const lowerName=albumName.toLowerCase();
    
    if (lowerName == "main" || lowerName == "main album" || lowerName == "main_album") {
      return e400(res, "albumName cannot be 'Main' or 'Main Album'");
    }

    if (lowerName == "hidden" || lowerName == "hidden album" || lowerName == "hidden_album") {
      return e400(res, "albumName cannot be 'Main' or 'Main Album'");
    }

    // 1️⃣ Create a new empty album
    const newAlbumId = await createEmptyAlbum(albumType);

    // 2️⃣ Add to user's groups array
    user.groups.push({
      groupName: albumName,
      albumId: new mongoose.Types.ObjectId(newAlbumId)
    });

    await user.save();

    // 3️⃣ Send response
    res.json({
      message: "Group album created successfully",
      albumId: newAlbumId,
      groupName: albumName,
      albumType
    });
  } catch (err) {
    console.error("Error in /makegroup:", err);
    return e500(res, "server error");
  }
});

export default router;
