import express from "express";
import  User  from "../models/userschema.js";
import { hashPassword } from "../utils/bcrypt.js";
import { sendMail } from "../utils/nodemailer.js";
import { sendOtpSms } from "../utils/messager.js";
import { generateOtp } from "../utils/otp.js";

const router = express.Router();

// ===================================
// 🕒 TEMP IN-MEMORY STORE
// ===================================
// Key: identifier, Value: { otp, expiresAt, verified }
const otpStore = new Map();

function setOtp(identifier, otp, minutes = 5) {
  const expiresAt = Date.now() + minutes * 60 * 1000;
  otpStore.set(identifier, { otp, expiresAt, verified: false });
}

function verifyOtp(identifier, inputOtp) {
  const record = otpStore.get(identifier);
  if (!record) return { valid: false, reason: "No OTP found" };
  if (Date.now() > record.expiresAt) {
    otpStore.delete(identifier);
    return { valid: false, reason: "OTP expired" };
  }
  if (record.otp !== inputOtp) return { valid: false, reason: "Invalid OTP" };
  // Mark verified but keep record for reset route
  record.verified = true;
  otpStore.set(identifier, record);
  return { valid: true };
}

/* ============================================
   🔹 ROUTE 1 — SEND OTP
   ============================================ */
router.post("/send", async (req, res) => {
  try {
    const { identifier } = req.body;
    if (!identifier)
      return res.status(400).json({ error: "Email or phone number required" });

    const otp = generateOtp();
    const isPhone = /^\d{10}$/.test(identifier);

    // 🔍 Check if user exists
    const user = await User.findOne(isPhone ? { phone: identifier } : { email: identifier });
    if (!user) return res.status(404).json({ error: "User not found" });

    // 🕒 Store OTP
    setOtp(identifier, otp, 5);

    // ✉️ Send OTP
    if (isPhone) {
      const result = await sendOtpSms(identifier, otp);
      if (!result?.success) return res.status(500).json({ error: "Failed to send SMS" });
    } else {
      const subject = "Password Reset OTP";
      const html = `<p>Your OTP for password reset is <strong>${otp}</strong>. It is valid for 5 minutes.</p>`;
      const result = await sendMail(identifier, subject, null, html);
      if (!result?.success) return res.status(500).json({ error: "Failed to send email" });
    }

    res.status(200).json({ message: "OTP sent successfully (valid for 5 minutes)" });
  } catch (err) {
    console.error("Error sending forgot-password OTP:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ============================================
   🔹 ROUTE 2 — VERIFY OTP
   ============================================ */
router.post("/verify", async (req, res) => {
  try {
    const { identifier, otp } = req.body;
    if (!identifier || !otp)
      return res.status(400).json({ error: "Identifier and OTP are required" });

    const check = verifyOtp(identifier, otp);
    if (!check.valid) return res.status(400).json({ error: check.reason });

    res.status(200).json({ message: "OTP verified successfully", verified: true });
  } catch (err) {
    console.error("Error verifying OTP:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ============================================
   🔹 ROUTE 3 — RESET PASSWORD
   ============================================ */
router.post("/reset", async (req, res) => {
  try {
    const { identifier, newPassword } = req.body;
    if (!identifier || !newPassword)
      return res.status(400).json({ error: "Identifier and new password required" });

    const record = otpStore.get(identifier);
    if (!record)
      return res.status(400).json({ error: "No OTP verification found" });

    if (!record.verified)
      return res.status(401).json({ error: "OTP not verified or expired" });

    const isPhone = /^\d{10}$/.test(identifier);
    const user = await User.findOne(isPhone ? { phone: identifier } : { email: identifier });
    if (!user) return res.status(404).json({ error: "User not found" });

    // 🔒 Update password
    user.password = await hashPassword(newPassword);
    await user.save();

    // 🧼 Remove record from store
    otpStore.delete(identifier);

    res.status(200).json({ message: "Password reset successful" });
  } catch (err) {
    console.error("Error resetting password:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
