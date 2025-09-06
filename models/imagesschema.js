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
        ref:{
          type: mongoose.Schema.Types.Number,
          default: 0,
        },
      },
    ],
  },
  { timestamps: true }
);

export const Image = mongoose.model("Image", imageSchema);
