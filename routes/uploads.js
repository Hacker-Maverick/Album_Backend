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
}); [3][4]

router.post("/upload-complete", authMiddleware, async (req, res) => {
  try {
    const { keys, event, date, taggeesUsernames = [] } = req.body;
    const albumIds = toArray(req.body.albumIds);

    if (!Array.isArray(keys) || keys.length === 0) return e400(res, "keys required");
    if (!albumIds.length) return e400(res, "albumIds required");
    if (!event || !date) return e400(res, "event and date required");
    for (const id of albumIds) if (!isValidId(id)) return e400(res, "invalid album id");

    const user = await User.findById(req.user.id);
    if (!user) return e404(res, "user not found");

    // verify keys exist in S3 and compute size
    const confirmed = [];
    let bytesAdded = 0;
    for (const key of keys) {
      if (!key || typeof key !== "string") return e400(res, "invalid key");
      try {
        const head = await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
        const size = Number(head?.ContentLength ?? 0);
        const remaining = Number(user?.plan?.totalSpace || 0) - Number(user?.plan?.spaceUsed || 0) - bytesAdded;
        if (size > remaining) return e402(res, "quota exceeded");
        confirmed.push({ key, uploadedBy: user._id });
        bytesAdded += size;
      } catch (e) {
        const sc = e?.$metadata?.httpStatusCode ?? null;
        if (sc === 404) return e422(res, "object not found in s3");
        if (sc === 403) return e403(res, "s3 access denied");
        return e500(res, "s3 verification failed");
      }
    }
    if (!confirmed.length) return e422(res, "no valid uploads"); [5][2]

    let taggeeIds = [];
    if (taggeesUsernames.length) {
      const users = await User.find({ username: { $in: taggeesUsernames.map(String) } }, { _id: 1, username: 1 }).lean();
      const found = new Set(users.map(u => u.username));
      const missing = taggeesUsernames.filter(u => !found.has(String(u)));
      if (missing.length) return e404(res, "username not found");
      taggeeIds = [...new Set(users.map(u => String(u._id)))];
    } 

    const albums = await Album.find({ _id: { $in: albumIds } });
    if (albums.length !== albumIds.length) return e404(res, "album not found"); [3]

    const normalizedDate = new Date(date);
    const sameDay = (d1, d2) => dayjs(d1).startOf("day").isSame(dayjs(d2).startOf("day"));

    const results = [];
    // collect all new sub-image ObjectIds per album so we can push into requests
    const createdSubImageIds = [];

    for (const album of albums) {
      album.data = Array.isArray(album.data) ? album.data : [];
      const existingIdx = album.data.findIndex(
        it => it?.event === event && it?.date && sameDay(it.date, normalizedDate)
      );

      if (existingIdx >= 0) {
        const imageRefId = album.data[existingIdx].images;
        let imageDoc = await Image.findById(imageRefId);
        if (!imageDoc) {
          imageDoc = await Image.create({
            album: album._id,
            images: confirmed.map(({ key, uploadedBy }) => ({ key, uploadedBy }))
          });
          album.data[existingIdx].images = imageDoc._id;
          await album.save();
          // new subdocs created above
          for (const sub of imageDoc.images) createdSubImageIds.push(String(sub._id));
        } else {
          // push and capture subdoc ids
          for (const { key, uploadedBy } of confirmed) {
            imageDoc.images.push({ key, uploadedBy });
            const pushed = imageDoc.images[imageDoc.images.length - 1];
            createdSubImageIds.push(String(pushed._id));
          }
          await imageDoc.save();
        }
        results.push({ albumId: album._id, imageDocId: imageDoc._id, merged: true });
      } else {
        // create new Image doc and data entry
        const imageDoc = await Image.create({
          album: album._id,
          images: confirmed.map(({ key, uploadedBy }) => ({ key, uploadedBy }))
        });
        album.data.push({ event, date: normalizedDate, images: imageDoc._id });
        await album.save();
        for (const sub of imageDoc.images) createdSubImageIds.push(String(sub._id));
        results.push({ albumId: album._id, imageDocId: imageDoc._id, merged: false });
      }
    }

    if (bytesAdded > 0) {
      user.plan.spaceUsed = Number(user.plan?.spaceUsed || 0) + bytesAdded;
      await user.save();
    }

    if (taggeeIds.length && createdSubImageIds.length) {
      const requestDoc = { from: user._id, date: new Date(), images: createdSubImageIds };
      await User.updateMany({ _id: { $in: taggeeIds } }, { $push: { requests: requestDoc } });
    } 

    res.json({ albumsProcessed: results.length, results, imagesCreated: createdSubImageIds.length });
  } catch (err) {
    return e500(res, "server error");
  }
});

export default router;
