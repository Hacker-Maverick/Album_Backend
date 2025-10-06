// src/routes/tag.js
import express from "express";
import dayjs from "dayjs";
import mongoose from "mongoose";
import User from "../models/userschema.js";
import { Album } from "../models/albumschema.js";
import { Image } from "../models/imagesschema.js";
import { authMiddleware } from "../middlewares/auth.js";

const router = express.Router();

const e400 = (res, m) => res.status(400).json({ code: "VALIDATION_ERROR", message: m });
const e402 = (res, m) => res.status(402).json({ code: "QUOTA_EXCEEDED", message: m });
const e404 = (res, m) => res.status(404).json({ code: "NOT_FOUND", message: m });
const e500 = (res, m) => res.status(500).json({ code: "SERVER_ERROR", message: m });

const isValidId = id =>
  mongoose.Types.ObjectId.isValid(id) &&
  String(new mongoose.Types.ObjectId(id)) === String(id);

// Accept a tag request: attach images to event/date rows in multiple albums and clean up requests
router.post("/requests/accept", authMiddleware, async (req, res) => {
  try {
    const { imageIds = [], event, date, albumIds = [], taggeesUsernames = [], requestIndex } = req.body;

    // Validate inputs
    if (!Array.isArray(imageIds) || imageIds.length === 0) return e400(res, "imageIds required");
    if (!Array.isArray(albumIds) || albumIds.length === 0) return e400(res, "albumIds required");
    if (!event || !date) return e400(res, "event and date required");
    for (const id of imageIds) if (!isValidId(id)) return e400(res, "invalid image id");
    for (const id of albumIds) if (!isValidId(id)) return e400(res, "invalid album id");

    // Validate requestIndex if provided
    if (requestIndex !== undefined) {
      if (typeof requestIndex !== "number" || requestIndex < 0) {
        return e400(res, "requestIndex must be a non-negative number");
      }
    }

    const me = await User.findById(req.user.id);
    if (!me) return e404(res, "user not found");

    // Quota check
    const imgs = await Image.find(
      { _id: { $in: imageIds.map(x => new mongoose.Types.ObjectId(x)) } },
      { "images.size": 1 }
    ).lean();
    if (imgs.length !== imageIds.length) return e404(res, "some images not found");

    const totalBytes = imgs.reduce((sum, d) => sum + Number(d?.images?.size || 0), 0);
    const remaining = Number(me?.plan?.totalSpace || 0) - Number(me?.plan?.spaceUsed || 0);
    if (totalBytes > remaining) return e402(res, "storage quota exceeded");

    const normalizedDate = new Date(date);
    const sameDay = (d1, d2) => dayjs(d1).startOf("day").isSame(dayjs(d2).startOf("day"));
    const objIds = imageIds.map(id => new mongoose.Types.ObjectId(id));

    let totalAdded = 0;
    for (const albumId of albumIds) {
      const album = await Album.findById(albumId);
      if (!album) continue;

      album.data = Array.isArray(album.data) ? album.data : [];
      let rowIdx = album.data.findIndex(
        r => r?.event === event && r?.date && sameDay(r.date, normalizedDate)
      );
      if (rowIdx === -1) {
        album.data.push({ event, date: normalizedDate, images: [] });
        rowIdx = album.data.length - 1;
      }

      const upd = await Album.updateOne(
        { _id: album._id, [`data.${rowIdx}.event`]: event, [`data.${rowIdx}.date`]: album.data[rowIdx].date },
        { $addToSet: { [`data.${rowIdx}.images`]: { $each: objIds } } }
      );

      if (!upd.matchedCount) {
        const have = new Set(album.data[rowIdx].images.map(x => String(x)));
        for (const oid of objIds) if (!have.has(String(oid))) album.data[rowIdx].images.push(oid);
        await album.save();
      }

      const fresh = await Album.findById(album._id, { data: 1 });
      const row = fresh?.data?.[rowIdx];
      if (row?.images?.length) {
        const present = new Set(row.images.map(x => String(x)));
        const actuallyAdded = imageIds.filter(id => present.has(String(id)));
        totalAdded += actuallyAdded.length;

        if (actuallyAdded.length) {
          await Image.updateMany(
            { _id: { $in: actuallyAdded.map(id => new mongoose.Types.ObjectId(id)) } },
            { $inc: { "images.ref": 1 } }
          );
        }
      }
    }

    if (totalBytes > 0) {
      me.plan.spaceUsed = Number(me.plan?.spaceUsed || 0) + totalBytes;
      await me.save();
    }

    if (Array.isArray(taggeesUsernames) && taggeesUsernames.length && imageIds.length) {
      const users = await User.find(
        { username: { $in: taggeesUsernames.map(String) } },
        { _id: 1, username: 1 }
      ).lean();
      const found = new Set(users.map(u => u.username));
      const missing = taggeesUsernames.filter(u => !found.has(String(u)));
      if (missing.length) return e404(res, "username not found");

      const taggeeIds = users.map(u => u._id);
      const requestDoc = { from: me._id, date: new Date(), images: imageIds };
      await User.updateMany({ _id: { $in: taggeeIds } }, { $push: { requests: requestDoc } });
    }

    // Instead of removing by matching imageIds, remove request by requestIndex if provided
    if (typeof requestIndex === "number") {
      await User.updateOne(
        { _id: me._id },
        { $unset: { [`requests.${requestIndex}`]: 1 } }
      );
      await User.updateOne(
        { _id: me._id },
        { $pull: { requests: null } }
      );
    }

    return res.json({ added: totalAdded, imageIds });
  } catch (err) {
    return e500(res, "server error");
  }
});

// Reject a request by array index, compacting the requests array
router.post("/requests/reject", authMiddleware, async (req, res) => {
  try {
    const { requestIndex } = req.body;
    if (typeof requestIndex !== "number" || requestIndex < 0) {
      return e400(res, "requestIndex must be a non-negative number");
    }

    const me = await User.findById(req.user.id, { requests: 1 });
    if (!me) return e404(res, "user not found");

    if (!Array.isArray(me.requests) || requestIndex >= me.requests.length) {
      return e404(res, "request index out of range");
    }

    await User.updateOne(
      { _id: me._id },
      { $unset: { [`requests.${requestIndex}`]: 1 } }
    );

    const upd = await User.updateOne(
      { _id: me._id },
      { $pull: { requests: null } }
    );

    return res.json({ removed: upd.modifiedCount > 0, index: requestIndex });
  } catch (err) {
    return e500(res, "server error");
  }
});

export default router;
