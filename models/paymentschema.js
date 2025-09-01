import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    plan: {
      type: String, // e.g. "Basic", "Premium", "Event Pack"
      required: true,
    },
    orderId: {
      type: String, // Razorpay order_id
      required: true,
      unique: true,
    },
    paymentId: {
      type: String, // Razorpay payment_id
    },
    signature: {
      type: String, // Razorpay signature for verification
    },
    amount: {
      type: Number, // in paise (e.g. ₹49 = 4900)
      required: true,
    },
    currency: {
      type: String,
      default: "INR",
    },
    status: {
      type: String,
      enum: ["created", "authorized", "captured", "failed", "refunded"],
      default: "created",
    },
    method: {
      type: String, // e.g. "card", "upi", "netbanking"
    },
    description: {
      type: String, // e.g. "Monthly Subscription - Premium"
    },
    receipt: {
      type: String, // your internal receipt number
    },
    refund: {
      refunded: { type: Boolean, default: false },
      refundId: { type: String }, // Razorpay refund_id
      refundAmount: { type: Number },
      refundDate: { type: Date },
    },
  },
  { timestamps: true }
);

export const Payment = mongoose.model("Payment", paymentSchema);
