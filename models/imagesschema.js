import mongoose from "mongoose";

const imageSchema = new mongoose.Schema(
  {
    images:
    {
      key: {
        type: String, // name or key in S3
        required: true,
      },
      uploadedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User", // who uploaded
      },
      uploadedAt: {
        type: Date,
        default: Date.now,
      },
      ref: {
        type: mongoose.Schema.Types.Number,
        default: 0,
      },
      size: {
        type: mongoose.Schema.Types.Number,
        default: 0,
        required: true,
      },
      thumbnailKey:{
        type: String, // name or key in S3
      }
    }
  },
  { timestamps: true }
);

export const Image = mongoose.model("Image", imageSchema);
