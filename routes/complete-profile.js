import express from "express";
import User from "../models/userschema.js";
import { authMiddleware } from "../middlewares/auth.js";
import { hashPassword } from "../utils/bcrypt.js";

const router = express.Router();

// ✅ Route: Update remaining details for logged-in user
router.post("/complete-profile", authMiddleware, async (req, res) => {
    try {
        const { username, password } = req.body;

        // Find user by id from JWT payload
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        // Update fields
        if (username) user.username = username;
        if (password) {
            const hashedPassword = await hashPassword(password);
            user.password = hashedPassword;
        }
        await user.save();

        res.status(200).json({
            success: true,
            message: "Profile updated successfully",
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

export default router;
