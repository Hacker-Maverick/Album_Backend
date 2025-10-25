// routes/user.js
import express from "express";
import User from "../models/userschema.js";
import {authMiddleware} from "../middlewares/auth.js";

const router = express.Router();

// GET /api/user/me
router.get("/me", authMiddleware, async (req, res) => {
  try {
    // req.user is set by authMiddleware
    const user = await User.findOne({ _id: req.user.id }).select("-password -requests"); // exclude password
    if (!user) return res.status(404).json({ message: "User not found" });
    if (!user.emailVerified) return res.status(403).json({ message: "Email not verified" });
    res.json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

export default router;
