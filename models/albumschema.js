import mongoose from "mongoose";

const albumSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["main", "group"], // only main or group
      required: true,
    },
    event: {
      type: String, // e.g. "Goa Trip 2025"
      required: true,
    },
    date: {
      type: Date,
      required: true,
    },
    tags: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User", // tagged users
      },
    ],
    images: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Image", // one document in Images collection per album
      required: true,
    },
  },
  { timestamps: true }
);

export const Album = mongoose.model("Album", albumSchema);
