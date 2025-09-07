// src/routes/uploads.js
import express from "express";
import dayjs from "dayjs";
import mongoose from "mongoose";
import { S3Client, HeadObjectCommand } from "@aws-sdk/client-s3";
import User from "../models/userschema.js";
import { Album } from "../models/albumschema.js";
import { Image } from "../models/imagesschema.js";
import { presignPutUrl } from "../services/s3Presign.js";
import { mediaKey, detectExt } from "../utils/keys.js";
import { authMiddleware } from "../middlewares/auth.js";

const router = express.Router();
const s3 = new S3Client({ region: process.env.AWS_REGION });
const BUCKET = process.env.S3_BUCKET;

const toArray = v => Array.isArray(v) ? v : (v == null ? [] : String(v).split(",").map(s => s.trim()).filter(Boolean));
const isValidId = id => mongoose.Types.ObjectId.isValid(id) && String(new mongoose.Types.ObjectId(id)) === String(id);

const e400 = (res, m) => res.status(400).json({ code: "VALIDATION_ERROR", message: m });
const e402 = (res, m) => res.status(402).json({ code: "QUOTA_EXCEEDED", message: m });
const e403 = (res, m) => res.status(403).json({ code: "FORBIDDEN", message: m });
const e404 = (res, m) => res.status(404).json({ code: "NOT_FOUND", message: m });
const e422 = (res, m) => res.status(422).json({ code: "UNPROCESSABLE", message: m });
const e500 = (res, m) => res.status(500).json({ code: "SERVER_ERROR", message: m });

// 1) INIT: return presigned PUT URLs
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
      const url = await presignPutUrl({ bucket: BUCKET, key, contentType: mime });
      items.push({ key, url, contentType: mime });
    }
    res.json({ bucket: BUCKET, items });
  } catch (err) { next(err); }
});

// 2) COMPLETE: verify HEAD, create Image docs, attach to album, update quota, tag requests
router.post("/upload-complete", authMiddleware, async (req, res) => {
  try {
    const { keys, event, date, taggeesUsernames = [] } = req.body;
    const albumIds = Array.isArray(req.body.albumIds) ? req.body.albumIds : [];
    if (!Array.isArray(keys) || keys.length === 0) return e400(res, "keys required");
    if (!albumIds.length) return e400(res, "albumIds required");
    if (!event || !date) return e400(res, "event and date required");
    for (const id of albumIds) if (!isValidId(id)) return e400(res, "invalid album id");

    const user = await User.findById(req.user.id);
    if (!user) return e404(res, "user not found");

    // Verify S3 and sizes
    const toCreate = [];
    let bytesAdded = 0;
    for (const key of keys) {
      try {
        const head = await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
        const size = Number(head?.ContentLength ?? 0);
        const remaining = Number(user?.plan?.totalSpace || 0) - Number(user?.plan?.spaceUsed || 0) - bytesAdded;
        if (size <= 0) return e422(res, "empty object not allowed");
        if (size > remaining) return e402(res, "quota exceeded");
        toCreate.push({ key, uploadedBy: user._id, size });
        bytesAdded += size;
      } catch (e) {
        const sc = e?.$metadata?.httpStatusCode ?? null;
        if (sc === 404) return e422(res, "object not found in s3");
        if (sc === 403) return e403(res, "s3 access denied");
        return e500(res, "s3 verification failed");
      }
    }

    // Create Image docs
    const created = await Image.insertMany(
      toCreate.map(({ key, uploadedBy, size }) => ({ images: { key, uploadedBy, size } })),
      { ordered: true }
    );
    const createdIds = created.map(d => d._id);

    // Attach to each album
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

      // Increment ref for attached images
      const fresh = await Album.findById(album._id, { data: 1 });
      const row = fresh?.data?.[rowIdx];
      if (row?.images?.length) {
        const present = new Set(row.images.map(x => String(x)));
        const actuallyAdded = createdIds.filter(id => present.has(String(id)));
        if (actuallyAdded.length) {
          await Image.updateMany(
            { _id: { $in: actuallyAdded } },
            { $inc: { "images.ref": 1 } }
          );
        }
      }
    }

    // Update uploader storage
    if (bytesAdded > 0) {
      user.plan.spaceUsed = Number(user.plan?.spaceUsed || 0) + bytesAdded;
      await user.save();
    }

    // Tag requests
    if (Array.isArray(taggeesUsernames) && taggeesUsernames.length) {
      const users = await User.find(
        { username: { $in: taggeesUsernames.map(String) } },
        { _id: 1, username: 1 }
      ).lean();
      const found = new Set(users.map(u => u.username));
      const missing = taggeesUsernames.filter(u => !found.has(String(u)));
      if (missing.length) return e404(res, "username not found");

      const taggeeIds = users.map(u => u._id);
      const requestDoc = { from: user._id, date: new Date(), images: createdIds };
      await User.updateMany(
        { _id: { $in: taggeeIds } },
        { $push: { requests: requestDoc } }
      );
    }

    return res.json({ created: createdIds.length, imageIds: createdIds });
  } catch (err) {
    return e500(res, "server error");
  }
});

export default router;
