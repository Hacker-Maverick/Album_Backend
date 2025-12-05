import { Router } from "express";
import User from "../models/userschema.js";
import { comparePassword, hashPassword } from "../utils/bcrypt.js";
import { authMiddleware } from "../middlewares/auth.js";
import { validateChangePassword } from "../middlewares/validations.js";

const router = Router();

/**
 * @route   POST /password/change
 * @desc    Change password (requires old password verification)
 * @access  Private (JWT)
 */
router.post("/password/change", authMiddleware, validateChangePassword, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const userId = req.user.id;

    if (!oldPassword || !newPassword)
      return res.status(400).json({ error: "Both old and new passwords are required" });

    if (oldPassword === newPassword)
      return res.status(400).json({ error: "New password cannot be the same as the old password" });

    const user = await User.findById(userId).select("+password");
    if (!user)
      return res.status(404).json({ error: "User not found" });

    if (user.password) {
      const isMatch = await comparePassword(oldPassword, user.password);
      if (!isMatch)
        return res.status(401).json({ error: "Incorrect old password" });
    }

    const hashedNew = await hashPassword(newPassword);
    user.password = hashedNew;
    await user.save();

    res.json({ message: "Password changed successfully" });
  } catch (err) {
    console.error("Change password error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
