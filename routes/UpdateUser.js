import express from "express";
import  User  from "../models/userschema.js";
import { authMiddleware } from "../middlewares/auth.js";

const router = express.Router();

/* =====================================
   🔹 Route 1 — Change Email
   ===================================== */
router.patch("/email/change", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { email } = req.body;

    if (!email) return res.status(400).json({ error: "Email is required" });

    // 🔍 Check if email already exists for another user
    const existingEmail = await User.findOne({ email, _id: { $ne: userId } });
    if (existingEmail)
      return res.status(400).json({ error: "Email already in use" });

    // ✅ Update email and reset verification
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { email, emailVerified: false },
      { new: true, select: "-password" }
    );

    res.status(200).json({
      message: "Email updated successfully. Please verify your new email.",
      user: updatedUser,
    });
  } catch (err) {
    console.error("Error changing email:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/* =====================================
   🔹 Route 2 — Change Phone
   ===================================== */
router.patch("/phone/change", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { phone } = req.body;

    if (!phone) return res.status(400).json({ error: "Phone number is required" });
    if (!/^\d{10}$/.test(phone))
      return res.status(400).json({ error: "Invalid phone number format" });

    // 🔍 Check if phone already exists
    const existingPhone = await User.findOne({ phone, _id: { $ne: userId } });
    if (existingPhone)
      return res.status(400).json({ error: "Phone number already in use" });

    // ✅ Update phone and reset verification
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { phone, phoneVerified: false },
      { new: true, select: "-password" }
    );

    res.status(200).json({
      message: "Phone number updated successfully. Please verify your new number.",
      user: updatedUser,
    });
  } catch (err) {
    console.error("Error changing phone:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
