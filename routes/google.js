import express from "express";
import { OAuth2Client } from "google-auth-library";
import User from "../models/userschema.js";
import ServerLogs from "../models/serverlogschema.js";
import { generateToken } from "../utils/jwt.js";
import { createEmptyAlbum } from "../utils/createAlbum.js";
import { checkEmailInServerLogs } from "../utils/checkRegMail.js";

const router = express.Router();
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Helper: Generate random 8-character referral code
const generateReferralCode = () => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
};

router.post("/auth/google", async (req, res) => {
  try {
    const { idToken, referalCode } = req.body;

    if (!idToken) return res.status(400).json({ message: "No idToken provided" });

    // ✅ Verify token with Google
    const ticket = await client.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const email = payload.email;
    if (!email) return res.status(400).json({ message: "No email found in Google token" });

    // ✅ Check if user already exists
    let user = await User.findOne({ email });
    let statuscode = 200;

    if (!user) {
      // 🟡 Step 1: Check if email exists in lifetime logs
      const emailExistsInServerLog = await checkEmailInServerLogs(email);
      let referralMessage = "Google signup successful.";
      let credits = 0;

      if (emailExistsInServerLog) {
        referralMessage = "Email previously registered. Referral won't work.";
      } else {
        // 🟢 Step 2: Handle referral reward
        if (referalCode) {
          const referrer = await User.findOne({ referalCode });
          if (referrer) {
            referrer.credits += 20;
            await referrer.save();
            credits = 20;
            referralMessage = "Signup successful via referral! Both got 20 credits.";
          }
        }
      }

      // 🟢 Step 3: Create a new Google user
      const main_album_id = await createEmptyAlbum("main");
      const newReferralCode = generateReferralCode();

      user = await User.create({
        username: email.split("@")[0],
        email,
        authProvider: "google",
        emailVerified: true,
        credits,
        referalCode: newReferralCode,
        plan: {
          totalSpace: 2 * 1024 * 1024 * 1024,
          spaceUsed: 0,
          valid_from: new Date(),
          valid_till: null,
          plan: "Free",
          paymentId: null,
        },
        main_album: main_album_id,
      });

      // 🟢 Step 4: Update ServerLogs
      await ServerLogs.updateOne(
        {},
        {
          $push: { "lifetime.allUserEmails": email },
          $inc: { "lifetime.totalUsers": 1 },
        },
        { upsert: true }
      );

      statuscode = 201;
    }

    // ✅ Step 5: Generate JWT
    const token = generateToken({ id: user._id });

    res.status(statuscode).json({
      message: "Google login success",
      token,
      email: user.email,
      credits: user.credits,
      referalCode: user.referalCode,
    });
  } catch (error) {
    console.error("Google login error:", error);
    res.status(500).json({ message: "Google login failed", error: error.message });
  }
});

export default router;
