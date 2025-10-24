import express from "express";
import fetch from "node-fetch";
import User from "../models/userschema.js";
import { authMiddleware } from "../middlewares/auth.js";

const router = express.Router();
const API_URL = process.env.API_BASE_URL || "http://localhost:3000"; // your backend URL

/**
 * DELETE /account
 * Deletes user account, all albums (including main), and user data.
 */
router.delete("/account", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    // 🔍 Step 1: Fetch the user
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    // 🧩 Step 2: Collect all album IDs (main + group albums)
    const albumIds = [];

    if (user.main_album) albumIds.push(String(user.main_album));

    if (user.groups && user.groups.length > 0) {
      for (const g of user.groups) {
        if (g.albumId) albumIds.push(String(g.albumId));
      }
    }

    if (!albumIds.length) {
      console.log("⚠️ No albums found for user, proceeding with account deletion.");
    }

    // 🔁 Step 3: Delete each album using the backend /album/delete route
    for (const albumId of albumIds) {
      try {
        const response = await fetch(`${API_URL}/album/delete`, {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            Authorization: req.headers.authorization, // reuse user's token
          },
          body: JSON.stringify({
            albumId,
            deleteMain: true, // ✅ allow main album deletion
          }),
        });

        if (!response.ok) {
          const errText = await response.text();
          console.error(`Failed to delete album ${albumId}:`, errText);
        }
      } catch (err) {
        console.error(`Error deleting album ${albumId}:`, err.message);
      }
    }

    // 🧹 Step 4: Delete user record itself
    await User.findByIdAndDelete(userId);

    res.json({
      success: true,
      message: "Account and all associated albums deleted successfully.",
    });
  } catch (err) {
    console.error("Delete account error:", err);
    res.status(500).json({
      success: false,
      message: err.message || "Server error deleting account.",
    });
  }
});

export default router;
