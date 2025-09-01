import mongoose from "mongoose";

const imageSchema = new mongoose.Schema(
  {
    album: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Album", // links back to the album
      required: true,
    },
    images: [
      {
        filename: {
          type: String, // name or key in S3
          required: true,
        },
        url: {
          type: String, // full S3 URL (optional but useful)
        },
        uploadedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User", // who uploaded
        },
        uploadedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  { timestamps: true }
);

export const Image = mongoose.model("Image", imageSchema);
