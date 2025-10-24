// src/routes/tag.js
import express from "express";
import dayjs from "dayjs";
import mongoose from "mongoose";
import User from "../models/userschema.js";
import { Album } from "../models/albumschema.js";
import { Image } from "../models/imagesschema.js";
import { authMiddleware } from "../middlewares/auth.js";
import { deleteS3Objects } from "../services/s3Delete.js"; // 👈 add this

const router = express.Router();

const e400 = (res, m) => res.status(400).json({ code: "VALIDATION_ERROR", message: m });
const e402 = (res, m) => res.status(402).json({ code: "QUOTA_EXCEEDED", message: m });
const e404 = (res, m) => res.status(404).json({ code: "NOT_FOUND", message: m });
const e500 = (res, m) => res.status(500).json({ code: "SERVER_ERROR", message: m });

const isValidId = id =>
  mongoose.Types.ObjectId.isValid(id) &&
  String(new mongoose.Types.ObjectId(id)) === String(id);

const sameDay = (d1, d2) => dayjs(d1).startOf("day").isSame(dayjs(d2).startOf("day"));
// ==========================================================
// ✅ Accept a tag request
// ==========================================================
router.post("/requests/accept", authMiddleware, async (req, res) => {
  try {
    const {
      imageIds = [],
      event,
      date,
      albumIds = [],
      taggeesUsernames = [],
      requestIndex
    } = req.body;

    // 🔹 Input validation
    if (!Array.isArray(imageIds) || imageIds.length === 0) return e400(res, "imageIds required");
    if (!Array.isArray(albumIds) || albumIds.length === 0) return e400(res, "albumIds required");
    if (!event || !date) return e400(res, "event and date required");
    for (const id of imageIds) if (!isValidId(id)) return e400(res, "invalid image id");
    for (const id of albumIds) if (!isValidId(id)) return e400(res, "invalid album id");

    if (requestIndex !== undefined && (typeof requestIndex !== "number" || requestIndex < 0))
      return e400(res, "requestIndex must be a non-negative number");

    const me = await User.findById(req.user.id);
    if (!me) return e404(res, "user not found");

    // 🔹 Quota check
    const imgs = await Image.find(
      { _id: { $in: imageIds.map(x => new mongoose.Types.ObjectId(x)) } },
      { "images.size": 1 }
    ).lean();
    if (imgs.length !== imageIds.length) return e404(res, "some images not found");

    const totalBytes = imgs.reduce((sum, d) => sum + Number(d?.images?.size || 0), 0);
    const remaining = Number(me?.plan?.totalSpace || 0) - Number(me?.plan?.spaceUsed || 0);
    if (totalBytes > remaining)
      return e402(res, "storage exceeded. please upgrade your plan");

    const normalizedDate = new Date(date);
    const albumObjIds = albumIds.map(id => new mongoose.Types.ObjectId(id));
    const imageObjIds = imageIds.map(id => new mongoose.Types.ObjectId(id));

    // ======================================================
    // 🧩 Step 1: Check for duplicates in target albums
    // ======================================================
    const duplicateImages = await Album.aggregate([
      { $match: { _id: { $in: albumObjIds } } },
      { $unwind: "$data" },
      { $unwind: "$data.images" },
      { $match: { "data.images": { $in: imageObjIds } } },
      { $group: { _id: null, existingImages: { $addToSet: "$data.images" } } }
    ]);

    const duplicates = duplicateImages[0]?.existingImages || [];
    if (duplicates.length) {
      // Remove duplicates (permanently = false)
      const duplicateSet = new Set(duplicates.map(id => String(id)));

      const affectedAlbums = await Album.find({ _id: { $in: albumObjIds } });
      for (const album of affectedAlbums) {
        album.data = (album.data || []).map(row => ({
          ...row,
          images: (row.images || []).filter(x => !duplicateSet.has(String(x)))
        }));
        await album.save();
      }

      // Decrease ref count for duplicates
      await Image.updateMany(
        { _id: { $in: duplicates } },
        { $inc: { "images.ref": -1 } }
      );
    }

    // ======================================================
    // 🧩 Step 2: Add accepted images into albums
    // ======================================================
    let totalAdded = 0;

    for (const albumId of albumIds) {
      const album = await Album.findById(albumId);
      if (!album) continue;

      album.data = Array.isArray(album.data) ? album.data : [];

      // Find or create event/date row
      let rowIdx = album.data.findIndex(
        r => r?.event === event && r?.date && sameDay(r.date, normalizedDate)
      );

      if (rowIdx === -1) {
        album.data.push({ event, date: normalizedDate, images: [] });
      }

      // Sort by date (desc)
      album.data.sort((a, b) => new Date(b.date) - new Date(a.date));

      // Get updated row index
      rowIdx = album.data.findIndex(
        r => r.event === event && sameDay(r.date, normalizedDate)
      );

      const upd = await Album.updateOne(
        {
          _id: album._id,
          [`data.${rowIdx}.event`]: event,
          [`data.${rowIdx}.date`]: album.data[rowIdx].date
        },
        { $addToSet: { [`data.${rowIdx}.images`]: { $each: imageObjIds } } }
      );

      if (!upd.matchedCount) {
        const have = new Set(album.data[rowIdx].images.map(x => String(x)));
        for (const oid of imageObjIds)
          if (!have.has(String(oid))) album.data[rowIdx].images.push(oid);
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

    // ======================================================
    // 🧩 Step 3: Update user's used storage
    // ======================================================
    if (totalBytes > 0) {
      me.plan.spaceUsed = Number(me.plan?.spaceUsed || 0) + totalBytes;
      await me.save();
    }

    // ======================================================
    // 🧩 Step 4: Send tag requests to other users (if any)
    // ======================================================
if (Array.isArray(taggeesUsernames) && taggeesUsernames.length && imageIds.length) {
  const users = await User.find(
    { username: { $in: taggeesUsernames.map(String) } },
    { _id: 1, username: 1 }
  ).lean();

  const found = new Set(users.map(u => u.username));
  const missing = taggeesUsernames.filter(u => !found.has(String(u)));

  if (missing.length) return e404(res, `Username(s) not found: ${missing.join(", ")}`);

  const taggeeIds = users.map(u => u._id);
  const requestDoc = { from: me._id, date: new Date(), images: imageIds };

  // 🔹 Send the tag requests
  await User.updateMany(
    { _id: { $in: taggeeIds } },
    { $push: { requests: requestDoc } }
  );

  // 🔹 Increase image ref count for each tagging action
  await Image.updateMany(
    { _id: { $in: imageIds.map(id => new mongoose.Types.ObjectId(id)) } },
    { $inc: { "images.ref": 1 } }
  );
}

    // ======================================================
    // 🧩 Step 5: Remove original tag request
    // ======================================================
    try {
      if (typeof requestIndex !== "number" || requestIndex < 0)
        return e400(res, "requestIndex must be a non-negative number");

      const meWithRequests = await User.findById(req.user.id, { requests: 1 });
      if (!meWithRequests) return e404(res, "user not found");

      if (!Array.isArray(meWithRequests.requests) || requestIndex >= meWithRequests.requests.length)
        return e404(res, "request index out of range");

      const request = meWithRequests.requests[requestIndex];
      if (!request || !Array.isArray(request.images) || request.images.length === 0) {
        await User.updateOne({ _id: me._id }, { $unset: { [`requests.${requestIndex}`]: 1 } });
        await User.updateOne({ _id: me._id }, { $pull: { requests: null } });
        return res.json({ removed: true, index: requestIndex });
      }

      // 🧩 Decrease ref count for rejected images
      const imageIdsToRemove = request.images.map(id => new mongoose.Types.ObjectId(id));
      await Image.updateMany({ _id: { $in: imageIdsToRemove } }, { $inc: { "images.ref": -1 } });

      // Delete S3 objects where ref = 0
      const lowRefs = await Image.find(
        { _id: { $in: imageIdsToRemove }, "images.ref": 0 },
        { "images.key": 1, "images.thumbnailKey": 1 }
      ).lean();

      if (lowRefs.length) {
        const keysToDelete = lowRefs.map(d => d.images.key);
        const thumbKeysToDelete = lowRefs.map(d => d.images.thumbnailKey).filter(Boolean);
        await deleteS3Objects([...keysToDelete, ...thumbKeysToDelete]);
        await Image.deleteMany({ _id: { $in: lowRefs.map(d => d._id) } });
      }

      // Remove the request
      await User.updateOne({ _id: me._id }, { $unset: { [`requests.${requestIndex}`]: 1 } });
      await User.updateOne({ _id: me._id }, { $pull: { requests: null } });
    } catch (err) {
      console.error("Reject tag error:", err);
      return e500(res, "server error");
    }

    // ======================================================
    // ✅ Done
    // ======================================================
    return res.json({
      success: true,
      totalAdded,
      cleanedDuplicates: duplicates.length,
      message: "Tag request accepted successfully"
    });
  } catch (err) {
    console.error("Accept tag error:", err);
    return e500(res, "server error");
  }
});

// ==========================================================
// 🚫 Reject a tag request (decrease ref + delete if ref < 0)
// ==========================================================
router.post("/requests/reject", authMiddleware, async (req, res) => {
  try {
    const { requestIndex } = req.body;
    if (typeof requestIndex !== "number" || requestIndex < 0)
      return e400(res, "requestIndex must be a non-negative number");

    const me = await User.findById(req.user.id, { requests: 1 });
    if (!me) return e404(res, "user not found");
    if (!Array.isArray(me.requests) || requestIndex >= me.requests.length)
      return e404(res, "request index out of range");

    const request = me.requests[requestIndex];
    if (!request || !Array.isArray(request.images) || request.images.length === 0) {
      // just remove request if no images
      await User.updateOne(
        { _id: me._id },
        { $unset: { [`requests.${requestIndex}`]: 1 } }
      );
      await User.updateOne({ _id: me._id }, { $pull: { requests: null } });
      return res.json({ removed: true, index: requestIndex });
    }

    const imageIds = request.images.map(id => new mongoose.Types.ObjectId(id));

    // 🧩 Decrease ref by 1 for each rejected image
    await Image.updateMany({ _id: { $in: imageIds } }, { $inc: { "images.ref": -1 } });

    // 🧩 Find images that now have ref < 0 → delete from S3
    const lowRefs = await Image.find(
      { _id: { $in: imageIds }, "images.ref": 0 },
      { "images.key": 1, "images.thumbnailKey": 1 }
    ).lean();


    if (lowRefs.length) {
      const keysToDelete = lowRefs.map(d => d.images.key);
      const thumbKeysToDelete = lowRefs.map(d => d.images.thumbnailKey).filter(Boolean);

      // Delete both originals and thumbnails
      await deleteS3Objects([...keysToDelete, ...thumbKeysToDelete]);

      // Remove image docs from DB
      const idsToRemove = lowRefs.map(d => d._id);
      await Image.deleteMany({ _id: { $in: idsToRemove } });
    }

    // 🧹 Remove the request
    await User.updateOne(
      { _id: me._id },
      { $unset: { [`requests.${requestIndex}`]: 1 } }
    );
    await User.updateOne({ _id: me._id }, { $pull: { requests: null } });

    return res.json({
      removed: true,
      index: requestIndex,
      deletedImages: lowRefs.length,
    });
  } catch (err) {
    console.error("Reject tag error:", err);
    return e500(res, "server error");
  }
});

export default router;
