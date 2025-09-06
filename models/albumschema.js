import mongoose from "mongoose";

const albumSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["main", "group"], // only main or group
      required: true,
    },
    data: [{
      event: {
        type: String, // e.g. "Goa Trip 2025"
        required: true,
      },
      date: {
        type: Date,
        required: true,
      },
      images: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Image", // one document in Images collection per album
        required: true,
      },
      _id: false, // prevent automatic _id generation for subdocuments
    }]
  },
  { timestamps: true }
);

export const Album = mongoose.model("Album", albumSchema);
