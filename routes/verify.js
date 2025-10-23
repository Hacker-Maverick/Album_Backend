import express from "express";
import User from "../models/userschema.js";
import { sendOtpSms } from "../utils/messager.js";
import { sendMail } from "../utils/nodemailer.js";
import { generateOtp } from "../utils/otp.js";
import { authMiddleware } from "../middlewares/auth.js";

const router = express.Router();

// ============================
// 🔹 In-Memory OTP Store
// ============================
const otpStore = new Map();

// Save OTP with 5-min expiry
function setOtp(key, otp, minutes = 5) {
  const expiresAt = Date.now() + minutes * 60 * 1000;
  otpStore.set(key, { otp, expiresAt });
}

// Validate OTP
function verifyOtp(key, inputOtp) {
  const record = otpStore.get(key);
  if (!record) return { valid: false, reason: "No OTP found" };
  if (Date.now() > record.expiresAt) {
    otpStore.delete(key);
    return { valid: false, reason: "OTP expired" };
  }
  if (record.otp !== inputOtp) return { valid: false, reason: "Invalid OTP" };
  otpStore.delete(key);
  return { valid: true };
}

// ============================
// 📱 SEND MOBILE OTP
// ============================
router.get("/mobile/send", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const phone = await User.findById(userId).select("phone").then(u => u?.phone);

    if (!phone)
      return res.status(400).json({ success: false, error: "User has no phone registered" });

    const otp = generateOtp();
    setOtp(`phone-${phone}`, otp, 5);

    const smsResult = await sendOtpSms(phone, otp);
    if (!smsResult?.success)
      return res.status(500).json({ success: false, error: "Failed to send OTP" });

    res.json({
      success: true,
      message: "OTP sent to your mobile (valid for 5 minutes)",
    });
  } catch (err) {
    console.error("Mobile OTP send error:", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// ============================
// 📱 VERIFY MOBILE OTP
// ============================
router.post("/mobile/verify", authMiddleware, async (req, res) => {
  try {
    const { otp } = req.body;
    const userId = req.user.id;
    const phone = await User.findById(userId).select("phone").then(u => u?.phone);
    if (!otp || !phone)
      return res.status(400).json({ success: false, error: "OTP or phone missing" });

    const check = verifyOtp(`phone-${phone}`, otp);
    if (!check.valid)
      return res.status(400).json({ success: false, error: check.reason });

    const user = await User.findOneAndUpdate(
      { phone },
      { phoneVerified: true },
      { new: true }
    );

    if (!user)
      return res.status(404).json({ success: false, error: "User not found" });

    res.json({
      success: true,
      message: "Phone verified successfully",
      phoneVerified: true,
    });
  } catch (err) {
    console.error("Mobile OTP verify error:", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// ============================
// ✉️ SEND EMAIL OTP
// ============================
router.get("/email/send", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const email = await User.findById(userId).select("email").then(u => u?.email);
    if (!email)
      return res.status(400).json({ success: false, error: "User has no email registered" });

    const otp = generateOtp();
    setOtp(`email-${email.toLowerCase()}`, otp, 5);

    const subject = "Your OTP for Email Verification";
    const html = `<p>Your OTP is <strong>${otp}</strong>. It is valid for 5 minutes.</p>`;

    const result = await sendMail(email, subject, null, html);
    if (!result?.success)
      return res.status(500).json({ success: false, error: "Failed to send email" });

    res.json({
      success: true,
      message: "OTP sent to your email (valid for 5 minutes)",
    });
  } catch (err) {
    console.error("Email OTP send error:", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// ============================
// ✉️ VERIFY EMAIL OTP
// ============================
router.post("/email/verify", authMiddleware, async (req, res) => {
  try {
    const { otp } = req.body;
    const userId = req.user.id;
    const email = await User.findById(userId).select("email").then(u => u?.email);
    if (!otp || !email)
      return res.status(400).json({ success: false, error: "OTP or email missing" });

    const check = verifyOtp(`email-${email.toLowerCase()}`, otp);
    if (!check.valid)
      return res.status(400).json({ success: false, error: check.reason });

    const user = await User.findOneAndUpdate(
      { email: email.toLowerCase() },
      { emailVerified: true },
      { new: true }
    );

    if (!user)
      return res.status(404).json({ success: false, error: "User not found" });

    res.json({
      success: true,
      message: "Email verified successfully",
      emailVerified: true,
    });
  } catch (err) {
    console.error("Email OTP verify error:", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

export default router;
