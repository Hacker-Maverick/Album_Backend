import express from "express";
import Razorpay from "razorpay";
import crypto from "crypto";
import { Payment } from "../models/paymentschema.js";
import User from "../models/userschema.js";
import { authMiddleware } from "../middlewares/auth.js";
import dotenv from "dotenv";
import { updateServerLogs } from "../utils/serverLogs.js";


const router = express.Router();

dotenv.config();

// 🔑 Razorpay setup
const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// Your plan pricing (in paise)
const plans = {
    Basic: { amount: 39900, space: 25 * 1024 * 1024 * 1024, months: 6 },
    Standard: { amount: 79900, space: 100 * 1024 * 1024 * 1024, months: 12 },
    Premium: { amount: 149900, space: 250 * 1024 * 1024 * 1024, months: 24 },
};

// 1️⃣ Create Order
router.post("/create-order", authMiddleware, async (req, res) => {
    try {
        const { plan } = req.body;
        const userId = req.user.id; // assuming you use auth middleware

        if (!plans[plan]) return res.status(400).json({ error: "Invalid plan" });

        const options = {
            amount: plans[plan].amount,
            currency: "INR",
            receipt: `rcpt_${Date.now()}`,
        };

        const order = await razorpay.orders.create(options);

        const payment = await Payment.create({
            user: userId,
            plan,
            orderId: order.id,
            amount: options.amount,
            currency: options.currency,
            description: `${plan} Subscription`,
            receipt: options.receipt,
        });

        res.json({
            orderId: order.id,
            amount: order.amount,
            currency: order.currency,
            key: process.env.RAZORPAY_KEY_ID,
            plan,
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to create order" });
    }
});

// 2️⃣ Verify Payment
router.post("/verify", authMiddleware, async (req, res) => {
    try {
        const { orderId, paymentId, signature } = req.body;
        const userId = req.user.id;

        const body = orderId + "|" + paymentId;
        const expectedSignature = crypto
            .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
            .update(body.toString())
            .digest("hex");

        if (expectedSignature !== signature) {
            return res.status(400).json({ success: false, message: "Invalid signature" });
        }

        // 🔍 Find payment record by orderId (since we saved it earlier)
        const payment = await Payment.findOne({ orderId });
        if (!payment)
            return res.status(404).json({ success: false, message: "Payment record not found" });

        // ✅ Update DB with final details
        payment.paymentId = paymentId;
        payment.signature = signature;
        payment.status = "captured";
        await payment.save();

        // Update user plan
        const planInfo = plans[payment.plan];
        const validTill = new Date();
        validTill.setMonth(validTill.getMonth() + planInfo.months);

        await User.findByIdAndUpdate(
            userId,
            {
                $set: {
                    "plan.totalSpace": planInfo.space,
                    "plan.valid_from": Date.now(),
                    "plan.valid_till": validTill,
                    "plan.plan": payment.plan,
                    "plan.paymentId": payment._id,
                }
            },
            { new: true }
        );

        // 🆕 Update server logs for payment made
        // 💾 Fetch amount from DB and store in ServerLogs
        const amountPaid = payment.amount / 100; // convert from paise → rupees
        await updateServerLogs("paymentMade", { amount: amountPaid });


        res.json({
            success: true,
            message: "Payment verified successfully",
            plan: {
                plan: payment.plan,
                totalSpace: planInfo.space,
                valid_till: validTill,
            },
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Verification failed" });
    }
});

export default router;
