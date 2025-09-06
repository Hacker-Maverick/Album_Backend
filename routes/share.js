// src/routes/share.js
import express from "express";
import mongoose from "mongoose";
import User from "../models/userschema.js";
import { authMiddleware } from "../middlewares/auth.js";

const router = express.Router();

const e400 = (res, m) => res.status(400).json({ code: "VALIDATION_ERROR", message: m });
const e404 = (res, m) => res.status(404).json({ code: "NOT_FOUND", message: m });
const e500 = (res, m) => res.status(500).json({ code: "SERVER_ERROR", message: m });

const isValidId = id => mongoose.Types.ObjectId.isValid(id) && String(new mongoose.Types.ObjectId(id)) === String(id);

// POST /share
// body: { imageIds: [subImageId], taggeesUsernames: [string] }
router.post("/share", authMiddleware, async (req, res) => {
  try {
    const { imageIds, taggeesUsernames } = req.body;

    if (!Array.isArray(imageIds) || imageIds.length === 0) {
      return e400(res, "imageIds required");
    }
    if (!Array.isArray(taggeesUsernames) || taggeesUsernames.length === 0) {
      return e400(res, "taggeesUsernames required");
    }
    for (const id of imageIds) {
      if (!isValidId(id)) return e400(res, "invalid image id");
    }

    const me = await User.findById(req.user.id, { _id: 1 });
    if (!me) return e404(res, "user not found"); // tagger must exist

    // Resolve usernames -> user ids
    const users = await User.find(
      { username: { $in: taggeesUsernames.map(String) } },
      { _id: 1, username: 1 }
    ).lean();

    const foundUsernames = new Set(users.map(u => u.username));
    const missing = taggeesUsernames.filter(u => !foundUsernames.has(String(u)));
    if (missing.length) return e404(res, "one or more usernames not found");

    const taggeeIds = users.map(u => String(u._id));

    const requestDoc = {
      from: me._id,
      date: new Date(),
      images: imageIds.map(String) // sub-image ObjectIds as strings, per current requests schema
    };

    const upd = await User.updateMany(
      { _id: { $in: taggeeIds } },
      { $push: { requests: requestDoc } }
    ); // append request to each taggee

    return res.json({
      taggedCount: upd.modifiedCount || 0,
      taggees: taggeeIds,
      imagesShared: imageIds.length
    });
  } catch (err) {
    return e500(res, "server error");
  }
});

export default router;
