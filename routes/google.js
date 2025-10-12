import express from "express";
import { OAuth2Client } from "google-auth-library";
import User from "../models/userschema.js";
import { generateToken } from "../utils/jwt.js";
import { createEmptyAlbum } from "../utils/createAlbum.js";

const router = express.Router();
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

router.post("/auth/google", async (req, res) => {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({ message: "No idToken provided" });
    }

    // ✅ Verify token with Google
    const ticket = await client.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const email = payload.email; // 🎯 Only taking email

    if (!email) {
      return res.status(400).json({ message: "No email found in Google token" });
    }

    // ✅ Check if user already exists
    let user = await User.findOne({ email });
    var statuscode=200;

    if (!user) {
      // If not, create new user with default free plan
          const main_album_id = await createEmptyAlbum("main");
      user = await User.create({
        username: email.split("@")[0], // Use part of email as username
        email,
        authProvider: "google",
        emailVerified: true,
        plan: {
          totalSpace: 2 * 1024 * 1024 * 1024, // 2GB in bytes
          spaceUsed: 0,
          valid_from: new Date(),
          valid_till: null, // free forever until upgraded
          plan: "free",
          paymentId: null,
        },
        main_album: main_album_id,
      });
      statuscode=201
    }
    

    // ✅ Generate JWT for app authentication
    const token = generateToken({ id: user._id });

    res.status(statuscode).json({
      message: "Google login success",
      token,
      email: user.email,
    });

  } catch (error) {
    console.error("Google login error:", error);
    res.status(500).json({ message: "Google login failed", error: error.message });
  }
});

export default router;
