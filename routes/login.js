import express from "express";
import User from "../models/userschema.js";
import { comparePassword } from "../utils/bcrypt.js";
import { generateToken } from "../utils/jwt.js";

const router = express.Router();

// Manual Login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: "User not found" });

    const isMatch = await comparePassword(password, user.password);
    if (!isMatch) return res.status(400).json({ message: "Invalid credentials" });

    const token = generateToken({ id: user._id });
    res.json({ token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

export default router;
