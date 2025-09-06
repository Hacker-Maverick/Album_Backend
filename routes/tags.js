// src/routes/requests.js
import express from "express";
import dayjs from "dayjs";
import mongoose from "mongoose";
import User from "../models/userschema.js";
import { Album } from "../models/albumschema.js";
import { Image } from "../models/imagesschema.js";
import { authMiddleware } from "../middlewares/auth.js";

const router = express.Router();

const toArray = v => Array.isArray(v) ? v : (v == null ? [] : String(v).split(",").map(s => s.trim()).filter(Boolean));
const isValidId = id => mongoose.Types.ObjectId.isValid(id) && String(new mongoose.Types.ObjectId(id)) === String(id);

const e400 = (res, m) => res.status(400).json({ code: "VALIDATION_ERROR", message: m });
const e404 = (res, m) => res.status(404).json({ code: "NOT_FOUND", message: m });
const e422 = (res, m) => res.status(422).json({ code: "UNPROCESSABLE", message: m });
const e500 = (res, m) => res.status(500).json({ code: "SERVER_ERROR", message: m });

// POST /requests/accept
// body: { imageIds: [subImageId], albumIds: [albumId], event, date, taggeesUsernames?: [] }
router.post("/requests/accept", authMiddleware, async (req, res) => {
  try {
    const { imageIds = [], event, date, taggeesUsernames = [] } = req.body;
    const albumIds = toArray(req.body.albumIds);

    if (!Array.isArray(imageIds) || imageIds.length === 0) return e400(res, "imageIds required");
    if (!albumIds.length) return e400(res, "albumIds required");
    if (!event || !date) return e400(res, "event and date required");
    for (const id of [...imageIds, ...albumIds]) if (!isValidId(id)) return e400(res, "invalid id in input");

    const me = await User.findById(req.user.id);
    if (!me) return e404(res, "user not found");

    // Resolve taggee ids if provided
    let taggeeIds = [];
    if (taggeesUsernames.length) {
      const users = await User.find({ username: { $in: taggeesUsernames.map(String) } }, { _id: 1, username: 1 }).lean();
      const found = new Set(users.map(u => u.username));
      const missing = taggeesUsernames.filter(u => !found.has(String(u)));
      if (missing.length) return e404(res, "username not found");
      taggeeIds = [...new Set(users.map(u => String(u._id)))];
    } 

    // Find the sub-images by _id from any Image doc; collect key and uploadedBy
    const oids = imageIds.map(id => new mongoose.Types.ObjectId(id));
    const carriers = await Image.find(
      { "images._id": { $in: oids } },
      { album: 1, images: 1 }
    ).lean();

    if (!carriers.length) return e404(res, "sub-images not found");

    const pickedMap = new Map(); // subImageId -> { key, uploadedBy }
    for (const doc of carriers) {
      for (const sub of doc.images) {
        const sid = String(sub._id);
        if (oids.some(x => String(x) === sid)) {
          pickedMap.set(sid, { key: sub.key, uploadedBy: sub.uploadedBy });
        }
      }
    }
    const picked = Array.from(pickedMap.entries()).map(([sid, v]) => ({ _id: sid, ...v }));
    if (!picked.length) return e404(res, "none of the sub-images could be resolved");

    // Load target albums
    const albums = await Album.find({ _id: { $in: albumIds } });
    if (albums.length !== albumIds.length) return e404(res, "album not found");

    const normalizedDate = new Date(date);
    const sameDay = (d1, d2) => dayjs(d1).startOf("day").isSame(dayjs(d2).startOf("day"));

    const results = [];
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
            images: picked.map(({ key, uploadedBy }) => ({ key, uploadedBy }))
          });
          album.data[existingIdx].images = imageDoc._id;
          await album.save();
          for (const sub of imageDoc.images) createdSubImageIds.push(String(sub._id));
        } else {
          for (const { key, uploadedBy } of picked) {
            imageDoc.images.push({ key, uploadedBy });
            const pushed = imageDoc.images[imageDoc.images.length - 1];
            createdSubImageIds.push(String(pushed._id));
          }
          await imageDoc.save();
        }
        results.push({ albumId: album._id, imageDocId: imageDoc._id, merged: true });
      } else {
        const imageDoc = await Image.create({
          album: album._id,
          images: picked.map(({ key, uploadedBy }) => ({ key, uploadedBy }))
        });
        album.data.push({ event, date: normalizedDate, images: imageDoc._id });
        await album.save();
        for (const sub of imageDoc.images) createdSubImageIds.push(String(sub._id));
        results.push({ albumId: album._id, imageDocId: imageDoc._id, merged: false });
      }
    } 

    // Send requests to new taggees with the created sub-image ids
    if (taggeeIds.length && createdSubImageIds.length) {
      const requestDoc = { from: me._id, date: new Date(), images: createdSubImageIds };
      await User.updateMany({ _id: { $in: taggeeIds } }, { $push: { requests: requestDoc } });
    } 

    // Optional: remove these ids from the current user's pending requests here if tracking specific request documents
    await User.updateOne(
      { _id: me._id },
      { $pull: { requests: { images: { $elemMatch: { $in: imageIds.map(String) } } } } }
    );

    return res.json({
      acceptedImageIds: picked.map(p => p._id),
      createdSubImageIdsCount: createdSubImageIds.length,
      results
    });
  } catch (err) {
    return e500(res, "server error");
  }
});

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

    // Step 1: unset the specific array slot to null
    await User.updateOne(
      { _id: me._id },
      { $unset: { [`requests.${requestIndex}`]: 1 } }
    ); 

    // Step 2: pull all nulls from the array to close the gap
    const upd = await User.updateOne(
      { _id: me._id },
      { $pull: { requests: null } }
    ); 

    return res.json({
      removed: upd.modifiedCount > 0,
      index: requestIndex
    });
  } catch (err) {
    return e500(res, "server error");
  }
});

export default router;
