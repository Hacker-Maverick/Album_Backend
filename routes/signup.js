import express from "express";
import User from "../models/userschema.js";
import { hashPassword } from "../utils/bcrypt.js";
import { generateToken } from "../utils/jwt.js";

const router = express.Router();

// Manual Signup
router.post("/signup", async (req, res) => {
  try {
    const { username, email, password, phone } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }

    const hashedPassword = await hashPassword(password);

    const user = new User({
      username,
      email,
      password: hashedPassword,
      phone,
      authProvider: "manual",
      plan: {
        plan: "Free",
        totalSpace: 2048 * 1024 * 1024, // 2GB
        spaceUsed: 0,
        valid_rom: new Date(),
        valid_till: null, // Free plan has no expiry
        paymentId: null,
      },
      main_album: null,
    });

    await user.save();
    const token = generateToken({ id: user._id });

    res.status(201).json({ token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

export default router;
