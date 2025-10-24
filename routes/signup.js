import express from "express";
import User from "../models/userschema.js";
import ServerLogs from "../models/serverlogschema.js";
import { hashPassword } from "../utils/bcrypt.js";
import { generateToken } from "../utils/jwt.js";
import { createEmptyAlbum } from "../utils/createAlbum.js";
import { checkEmailInServerLogs } from "../utils/checkRegMail.js";

const router = express.Router();

// Helper: generate random 8-char referral code
const generateReferralCode = () => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
};

// 🟢 Manual Signup with Referral
router.post("/signup", async (req, res) => {
  try {
    const { username, email, password, phone, referalCode } = req.body;

    // ✅ Step 1: Check if user already exists in Users collection
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }

    // ✅ Step 2: Check if this email ever existed in ServerLogs
    const emailExistsInServerLog = await checkEmailInServerLogs(email);

    // ✅ Step 3: Prepare referral & credit logic
    let credits = 0;
    let message = "Signup successful.";

    if (referalCode && !emailExistsInServerLog) {
      // Valid referral & new email → give credits
      const referrer = await User.findOne({ referalCode });
      if (referrer) {
        referrer.credits += 20;
        await referrer.save();
        credits = 20;
        message = "Signup successful via referral! Both got 20 credits.";
      } else {
        message = "Invalid referral code. Signup successful without credits.";
      }
    } else if (referalCode && emailExistsInServerLog) {
      // Referral ignored for old email
      message = "Signup successful, but no credits rewarded — email was previously registered.";
    } else if (!referalCode && emailExistsInServerLog) {
      message = "Signup successful — returning user (no referral).";
    }

    // ✅ Step 4: Hash password and create main album
    const hashedPassword = await hashPassword(password);
    const main_album_id = await createEmptyAlbum("main");

    // ✅ Step 5: Generate new referral code for this user
    const newReferralCode = generateReferralCode();

    // ✅ Step 6: Create the new user
    const user = new User({
      username,
      email,
      password: hashedPassword,
      phone,
      credits,
      referalCode: newReferralCode,
      authProvider: "manual",
      plan: {
        plan: "Free",
        totalSpace: 2048 * 1024 * 1024, // 2GB
        spaceUsed: 0,
        valid_from: new Date(),
        valid_till: null,
        paymentId: null,
      },
      main_album: main_album_id,
    });

    await user.save();

    // ✅ Step 7: Update ServerLogs
    await ServerLogs.updateOne(
      {},
      {
        $push: { "lifetime.allUserEmails": email },
        $inc: { "lifetime.totalUsers": 1 },
      },
      { upsert: true }
    );

    // ✅ Step 8: Generate JWT
    const token = generateToken({ id: user._id });

    // ✅ Step 9: Respond
    res.status(201).json({
      message,
      token,
      email: user.email,
      credits: user.credits,
      referalCode: user.referalCode,
    });
  } catch (err) {
    console.error("Signup error:", err);
    res.status(500).json({ message: err.message || "Internal Server Error" });
  }
});

export default router;
