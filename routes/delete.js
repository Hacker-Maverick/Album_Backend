// src/routes/images-delete.js
import express from "express";
import mongoose from "mongoose";
import { authMiddleware } from "../middlewares/auth.js";
import { Album } from "../models/albumschema.js";
import { Image } from "../models/imagesschema.js";
import User from "../models/userschema.js";
import { deleteS3Objects } from "../services/s3Delete.js";

const router = express.Router();

const e400 = (res, m) => res.status(400).json({ code: "VALIDATION_ERROR", message: m });
const e404 = (res, m) => res.status(404).json({ code: "NOT_FOUND", message: m });
const e500 = (res, m) => res.status(500).json({ code: "SERVER_ERROR", message: m });

const isValidId = id =>
  mongoose.Types.ObjectId.isValid(id) &&
  String(new mongoose.Types.ObjectId(id)) === String(id);

router.post("/delete", authMiddleware, async (req, res) => {
  try {
    const { albumId, albumIds = [], imageIds = [], permanently = false } = req.body;

    // Validate
    if (!albumId || !isValidId(albumId)) return e400(res, "valid albumId required");
    if (!Array.isArray(albumIds) || albumIds.length === 0) return e400(res, "albumIds required");
    if (!Array.isArray(imageIds) || imageIds.length === 0) return e400(res, "imageIds required");
    for (const id of albumIds) if (!isValidId(id)) return e400(res, "invalid album id in albumIds");
    for (const id of imageIds) if (!isValidId(id)) return e400(res, "invalid image id");

    const me = await User.findById(req.user.id, { _id: 1 });
    if (!me) return e404(res, "user not found");

    // Normalize ids and ensure albumId is included in albumIds
    const srcAlbumId = new mongoose.Types.ObjectId(albumId);
    const uniqAlbumIds = [...new Set(albumIds.map(String))];
    if (!uniqAlbumIds.includes(String(albumId))) uniqAlbumIds.push(String(albumId));
    const albumObjIds = uniqAlbumIds.map(id => new mongoose.Types.ObjectId(id));
    const imageObjIds = imageIds.map(id => new mongoose.Types.ObjectId(id));
    const imageStrSet = new Set(imageIds.map(String));

    // Load source album (for existence and early failure)
    const srcAlbum = await Album.findById(srcAlbumId);
    if (!srcAlbum) return e404(res, "album not found");

    // 1) Remove images from album(s)
    const albumsToProcess = permanently
      ? await Album.find({ _id: { $in: albumObjIds } })
      : [srcAlbum];

    // Track how many albums lost each image this call (for global ref dec)
    const lostCountByImage = new Map(imageIds.map(id => [String(id), 0]));
    const touchedIds = new Set();

    for (const album of albumsToProcess) {
      album.data = Array.isArray(album.data) ? album.data : [];

      // Snapshot pre state (presence) for accurate “lost” counting
      const preSet = new Set(
        (album.data || []).flatMap(r => r.images || []).map(x => String(x))
      );

      // Remove from all rows
      let changed = false;
      for (const row of album.data) {
        const before = row.images.length;
        if (before) {
          row.images = row.images.filter(x => !imageStrSet.has(String(x)));
          if (row.images.length !== before) changed = true;
        }
      }

      if (changed) {
        // After-state
        const afterSet = new Set(
          album.data.flatMap(r => r.images).map(x => String(x))
        );

        // For each image that was present before and is absent after, increment lostCount
        for (const img of imageIds) {
          if (preSet.has(String(img)) && !afterSet.has(String(img))) {
            lostCountByImage.set(String(img), (lostCountByImage.get(String(img)) || 0) + 1);
          }
        }

        await album.save();
        touchedIds.add(String(album._id));
      }
    }

    // Prune empty rows only for touched albums
    if (touchedIds.size) {
      const prunes = [...touchedIds].map(id => new mongoose.Types.ObjectId(id));
      await Album.updateMany(
        { _id: { $in: prunes } },
        { $pull: { data: { images: { $size: 0 } } } }
      );
    }

    // 2) Decrement global refs by the number of albums that lost each image
    const refDecOps = [];
    for (const [imgStr, lost] of lostCountByImage.entries()) {
      if (lost > 0) {
        refDecOps.push({
          updateOne: {
            filter: { _id: new mongoose.Types.ObjectId(imgStr) },
            update: { $inc: { "images.ref": -lost } }
          }
        });
      }
    }
    if (refDecOps.length) {
      await Image.bulkWrite(refDecOps, { ordered: false });
    }

    // 3) Determine which images are now absent across the provided albumIds for this user
    // For permanently=true, absence across the provided albumIds is guaranteed since we removed from all
    const absentAllByImage = new Map();
    if (permanently) {
      for (const imgId of imageObjIds) absentAllByImage.set(String(imgId), true);
    } else {
      // Check presence for each image across the provided albumIds
      for (const imgId of imageObjIds) {
        const existsSome = await Album.exists({
          _id: { $in: albumObjIds },
          "data.images": imgId
        });
        absentAllByImage.set(String(imgId), !existsSome);
      }
    }

    // 4) Load images to compute freed bytes and decide S3/DB purge
    const imgs = await Image.find(
      { _id: { $in: imageObjIds } },
      { "images.ref": 1, "images.key": 1, "images.thumbnailKey": 1, "images.size": 1 }
    ).lean();

    // Free current user's storage for images absent across provided albums
    let freedBytes = 0;
    for (const d of imgs) {
      const imgStr = String(d._id);
      if (absentAllByImage.get(imgStr)) {
        freedBytes += Number(d?.images?.size || 0);
      }
    }
    if (freedBytes > 0) {
      await User.updateOne(
        { _id: me._id },
        { $inc: { "plan.spaceUsed": -freedBytes } }
      );
    }

    // 5) Purge from S3 and DB when global ref is now 0
    const toPurge = imgs.filter(d => Number(d?.images?.ref || 0) <= 0);
    if (toPurge.length) {
      // Collect both main keys and thumbnail keys
      const keys = [];
      for (const d of toPurge) {
        if (d?.images?.key) keys.push(d.images.key);
        if (d?.images?.thumbnailKey) keys.push(d.images.thumbnailKey);
      }
      if (keys.length) {
        await deleteS3Objects(keys);
      }
      await Image.deleteMany({ _id: { $in: toPurge.map(d => d._id) } });
    }

    return res.json({
      albumId: String(srcAlbumId),
      albumsChecked: uniqAlbumIds.length,
      imagesProcessed: imageIds.length,
      permanently: Boolean(permanently),
      freedBytes
    });
  } catch (err) {
    return e500(res, "server error");
  }
});

export default router;
