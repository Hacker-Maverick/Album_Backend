// src/routes/uploads.js
import express from "express";
import dayjs from "dayjs";
import mongoose from "mongoose";
import { S3Client, HeadObjectCommand } from "@aws-sdk/client-s3";
import User from "../models/userschema.js";
import { Album } from "../models/albumschema.js";
import { Image } from "../models/imagesschema.js";
import { presignPutUrl } from "../services/s3Presign.js";
import { deleteS3Objects } from "../services/s3Delete.js";
import { mediaKey, detectExt } from "../utils/keys.js";
import { authMiddleware } from "../middlewares/auth.js";

const router = express.Router();
const s3 = new S3Client({ region: process.env.AWS_REGION });
const BUCKET = process.env.S3_BUCKET;
const THUMB_BUCKET = process.env.THUMB_BUCKET;

// ---------- Helper Functions ----------
const isValidId = id =>
  mongoose.Types.ObjectId.isValid(id) &&
  String(new mongoose.Types.ObjectId(id)) === String(id);

const e400 = (res, m) => res.status(400).json({ code: "VALIDATION_ERROR", message: m });
const e402 = (res, m) => res.status(402).json({ code: "QUOTA_EXCEEDED", message: m });
const e403 = (res, m) => res.status(403).json({ code: "FORBIDDEN", message: m });
const e404 = (res, m) => res.status(404).json({ code: "NOT_FOUND", message: m });
const e422 = (res, m) => res.status(422).json({ code: "UNPROCESSABLE", message: m });
const e500 = (res, m) => res.status(500).json({ code: "SERVER_ERROR", message: m });

// ===========================================================
// 1) INIT: return presigned PUT URLs
// ===========================================================
router.post("/upload-init", authMiddleware, async (req, res, next) => {
  try {
    const { files } = req.body;
    if (!Array.isArray(files) || files.length === 0) return e400(res, "files required");

    const user = await User.findById(req.user.id).lean();
    if (!user) return e404(res, "user not found");

    const remaining = Number(user?.plan?.totalSpace || 0) - Number(user?.plan?.spaceUsed || 0);
    if (!(remaining > 0)) return e402(res, "storage quota exceeded");

    const now = dayjs(), y = now.format("YYYY"), m = now.format("MM");
    const items = [];

    for (const f of files) {
      const mime = f?.mime || "application/octet-stream";
      const ext = detectExt(mime);
      const key = mediaKey({ userId: req.user.id, ext, y, m });

      // Remove the original extension
      const baseKey = key.replace(/\.[^/.]+$/, "");

      // Define which extensions are videos
      const videoExts = ["mp4", "mov", "avi", "mkv", "webm"];

      // If it's a video, make thumbnail .jpg; otherwise same as key
      const thumbnailKey = videoExts.includes(ext.toLowerCase())
        ? `${baseKey}.jpg`
        : key;

      const fileItem = {
        key,
        thumbnailKey,
        contentType: mime,
        url: await presignPutUrl({ bucket: BUCKET, key, contentType: mime }),
        thumbnailUrl: await presignPutUrl({ bucket: THUMB_BUCKET, key: thumbnailKey, contentType: "image/jpeg" }),
      };
      items.push(fileItem);
    }

    res.json({ bucket: BUCKET, items });
  } catch (err) { next(err); }
});

// ===========================================================
// 2) COMPLETE: verify, create Image docs, attach to albums, tag users
// ===========================================================
router.post("/upload-complete", authMiddleware, async (req, res) => {
  let uploadedKeys = [];
  try {
    const { keys, thumbnailKeys = [], event, date, taggeesUsernames = [] } = req.body;
    const albumIds = Array.isArray(req.body.albumIds) ? req.body.albumIds : [];

    if (!Array.isArray(keys) || keys.length === 0) return e400(res, "keys required");
    if (!albumIds.length) return e400(res, "albumIds required");
    if (!event || !date) return e400(res, "event and date required");
    for (const id of albumIds) if (!isValidId(id)) return e400(res, "invalid album id");

    const user = await User.findById(req.user.id);
    if (!user) return e404(res, "user not found");

    // ---------- Verify S3 and calculate size ----------
    const toCreate = [];
    let bytesAdded = 0;
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const thumbKey = thumbnailKeys[i] || null;
      uploadedKeys.push(key);
      if (thumbKey) uploadedKeys.push(thumbKey);

      try {
        const head = await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
        const size = Number(head?.ContentLength ?? 0);
        const remaining = Number(user?.plan?.totalSpace || 0) - Number(user?.plan?.spaceUsed || 0) - bytesAdded;
        if (size <= 0) throw new Error("empty object");
        if (size > remaining) throw new Error("quota exceeded");
        toCreate.push({ key, thumbnailKey: thumbKey, uploadedBy: user._id, size });
        bytesAdded += size;
      } catch (e) {
        console.error("S3 verification failed:", e.message);
        await deleteS3Objects(uploadedKeys);
        if (e.message === "empty object") return e422(res, "empty object not allowed");
        if (e.message === "quota exceeded") return e402(res, "quota exceeded");
        return e500(res, "s3 verification failed");
      }
    }

    // ---------- Create Image docs ----------
    const created = await Image.insertMany(
      toCreate.map(({ key, thumbnailKey, uploadedBy, size }) => ({
        images: { key, thumbnailKey, uploadedBy, size, ref: 0 },
      })),
      { ordered: true }
    );
    const createdIds = created.map(d => d._id);

    // ---------- Attach to albums ----------
    const normalizedDate = new Date(date);
    const sameDay = (d1, d2) => dayjs(d1).startOf("day").isSame(dayjs(d2).startOf("day"));

    for (const albumId of albumIds) {
      const album = await Album.findById(albumId);
      if (!album) continue;

      album.data = Array.isArray(album.data) ? album.data : [];
      let rowIdx = album.data.findIndex(r => r?.event === event && r?.date && sameDay(r.date, normalizedDate));
      if (rowIdx === -1) {
        album.data.push({ event, date: normalizedDate, images: [] });
        rowIdx = album.data.length - 1;
      }

      const addIds = createdIds.map(id => new mongoose.Types.ObjectId(id));
      const upd = await Album.updateOne(
        { _id: album._id, [`data.${rowIdx}.event`]: event, [`data.${rowIdx}.date`]: album.data[rowIdx].date },
        { $addToSet: { [`data.${rowIdx}.images`]: { $each: addIds } } }
      );

      if (!upd.matchedCount) {
        const has = new Set(album.data[rowIdx].images.map(x => String(x)));
        for (const oid of addIds) if (!has.has(String(oid))) album.data[rowIdx].images.push(oid);
        await album.save();
      }
    }

    // ---------- Tag users ----------
    let validTaggedUsers = [];
    let invalidUsernames = [];

    if (Array.isArray(taggeesUsernames) && taggeesUsernames.length) {
      const users = await User.find(
        { username: { $in: taggeesUsernames.map(String) } },
        { _id: 1, username: 1 }
      ).lean();

      const foundUsernames = new Set(users.map(u => u.username));
      invalidUsernames = taggeesUsernames.filter(u => !foundUsernames.has(u));

      if (users.length > 0) {
        validTaggedUsers = users.map(u => u._id);
        const requestDoc = { from: user._id, date: new Date(), images: createdIds };
        await User.updateMany({ _id: { $in: validTaggedUsers } }, { $push: { requests: requestDoc } });
      }
    }

    // ---------- Increment ref (uploader + tagged users) ----------
    const totalRefIncrement = albumIds.length + validTaggedUsers.length;
    if (totalRefIncrement > 0) {
      await Image.updateMany(
        { _id: { $in: createdIds } },
        { $inc: { "images.ref": totalRefIncrement } }
      );
    }

    // ---------- Update uploader storage ----------
    if (bytesAdded > 0) {
      user.plan.spaceUsed = Number(user.plan?.spaceUsed || 0) + bytesAdded;
      await user.save();
    }

    return res.json({
      created: createdIds.length,
      imageIds: createdIds,
      refIncrementedBy: totalRefIncrement,
      invalidUsernames,
    });

  } catch (err) {
    console.error("upload-complete error:", err);
    // ensure uploaded objects are cleaned up
    if (uploadedKeys.length) await deleteS3Objects(uploadedKeys);
    return e500(res, "server error");
  }
});

export default router;
