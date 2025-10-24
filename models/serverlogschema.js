import mongoose from "mongoose";

const monthlyStatsSchema = new mongoose.Schema({
  month: { type: String, required: true }, // e.g., "2025-10"
  totalImagesUploaded: { type: Number, default: 0 },
  totalAlbumsCreated: { type: Number, default: 0 },
  totalPaymentsCollected: { type: Number, default: 0 },
  newUsers: [{ type: String }], // emails of users who signed up this month
  createdAt: { type: Date, default: Date.now },
});

const lifetimeStatsSchema = new mongoose.Schema({
  totalImagesUploaded: { type: Number, default: 0 },
  totalAlbumsCreated: { type: Number, default: 0 },
  totalPaymentsCollected: { type: Number, default: 0 },
  totalUsers: { type: Number, default: 0 },
  allUserEmails: [{ type: String }], // every email ever signed up
});

const serverLogsSchema = new mongoose.Schema(
  {
    lifetime: { type: lifetimeStatsSchema, default: () => ({}) },
    monthly: [monthlyStatsSchema],
    lastUpdated: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export default mongoose.model("ServerLogs", serverLogsSchema);
