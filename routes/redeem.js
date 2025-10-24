import express from "express";
import { authMiddleware } from "../middlewares/auth.js";
import User from "../models/userschema.js";
import { Payment } from "../models/paymentschema.js";

const router = express.Router();

// 🧩 Plan details (price in ₹, space in GB, duration in months)
const PLAN_DETAILS = {
  Free: { price: 0, spaceGB: 2, durationMonths: 0 },
  Basic: { price: 399, spaceGB: 25, durationMonths: 6 },
  Standard: { price: 799, spaceGB: 100, durationMonths: 12 },
  Premium: { price: 1499, spaceGB: 250, durationMonths: 24 },
};

// 🪙 Redeem credits for plan
router.post("/redeem-credits", authMiddleware, async (req, res) => {
  try {
    const { plan } = req.body;
    const userId = req.user.id;

    if (!PLAN_DETAILS[plan]) {
      return res.status(400).json({ message: "Invalid plan selected." });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found." });

    const { price, spaceGB, durationMonths } = PLAN_DETAILS[plan];

    if (user.credits < price) {
      return res
        .status(400)
        .json({ message: "Insufficient credits to redeem this plan." });
    }

    // ✅ Deduct credits
    user.credits -= price;

    // ✅ Calculate plan validity
    const now = new Date();
    const validTill =
      durationMonths > 0
        ? new Date(now.setMonth(now.getMonth() + durationMonths))
        : null;

    // ✅ Update user's plan
    user.plan = {
      plan,
      totalSpace: spaceGB * 1024 * 1024 * 1024, // convert GB → bytes
      spaceUsed: 0,
      valid_from: new Date(),
      valid_till: validTill,
      paymentId: null,
    };

    // ✅ Record this as a "credit payment"
    const payment = await Payment.create({
      user: user._id,
      plan,
      orderId: `CREDIT-${Date.now()}-${user._id}`,
      amount: price * 100,
      method: "credits",
      status: "captured",
      description: `${plan} plan redeemed via credits`,
      currency: "INR",
    });

    user.plan.paymentId = payment._id;
    await user.save();

    res.status(200).json({
      message: `Successfully redeemed ${plan} plan using credits.`,
      remainingCredits: user.credits,
      plan: user.plan,
    });
  } catch (error) {
    console.error("Redeem credits error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

export default router;
