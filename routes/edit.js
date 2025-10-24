import express from "express";
import dayjs from "dayjs";
import mongoose from "mongoose";
import { Album } from "../models/albumschema.js";
import { Image } from "../models/imagesschema.js";
import User from "../models/userschema.js";
import { authMiddleware } from "../middlewares/auth.js";

const router = express.Router();

const e400 = (res, m) => res.status(400).json({ code: "VALIDATION_ERROR", message: m });
const e404 = (res, m) => res.status(404).json({ code: "NOT_FOUND", message: m });
const e500 = (res, m) => res.status(500).json({ code: "SERVER_ERROR", message: m });

const isValidId = id =>
  mongoose.Types.ObjectId.isValid(id) &&
  String(new mongoose.Types.ObjectId(id)) === String(id);

const sameDay = (d1, d2) => dayjs(d1).startOf("day").isSame(dayjs(d2).startOf("day"));

router.post("/edit", authMiddleware, async (req, res) => {
  try {
    const { albumIds = [], imageIds = [], event, date } = req.body;

    if (!Array.isArray(albumIds) || albumIds.length === 0) return e400(res, "albumIds required");
    if (!Array.isArray(imageIds) || imageIds.length === 0) return e400(res, "imageIds required");
    if (!event || !date) return e400(res, "event and date required");
    for (const id of albumIds) if (!isValidId(id)) return e400(res, "invalid album id");
    for (const id of imageIds) if (!isValidId(id)) return e400(res, "invalid image id");

    const me = await User.findById(req.user.id, { _id: 1 }).lean();
    if (!me) return e404(res, "user not found");

    const normalizedDate = new Date(date);
    const albumObjIds = albumIds.map(id => new mongoose.Types.ObjectId(id));
    const imageObjIds = imageIds.map(id => new mongoose.Types.ObjectId(id));

    const presentByImage = new Map();
    for (const imgId of imageObjIds) {
      const holders = await Album.find(
        { _id: { $in: albumObjIds }, "data.images": imgId },
        { _id: 1 }
      ).lean();
      presentByImage.set(String(imgId), new Set(holders.map(h => String(h._id))));
    }

    const albums = await Album.find({ _id: { $in: albumObjIds } });
    if (!albums.length) return e404(res, "no target albums found");

    const touchedAlbumIds = new Set();
    const addedByImage = new Map();
    for (const imgId of imageObjIds) addedByImage.set(String(imgId), new Set());

    const perAlbumResults = [];

    for (const album of albums) {
      touchedAlbumIds.add(String(album._id));
      album.data = Array.isArray(album.data) ? album.data : [];

      // ✅ Find/create destination row
      let rowIdx = album.data.findIndex(
        r => r?.event === event && r?.date && sameDay(r.date, normalizedDate)
      );
      if (rowIdx === -1) {
        album.data.push({ event, date: normalizedDate, images: [] });
      }

      // ✅ Sort album.data by date descending (latest first)
      album.data.sort((a, b) => new Date(b.date) - new Date(a.date));

      // ✅ Update rowIdx after sorting
      rowIdx = album.data.findIndex(r =>
        r?.event === event && sameDay(r.date, normalizedDate)
      );

      const destRow = album.data[rowIdx];

      // ✅ Remove images from all rows
      let removed = 0;
      for (const row of album.data) {
        const prev = row.images.length;
        if (prev) {
          row.images = row.images.filter(x => !imageObjIds.some(i => String(i) === String(x)));
          removed += prev - row.images.length;
        }
      }

      // ✅ Add to destination
      let added = 0;
      for (const imgId of imageObjIds) {
        const imgStr = String(imgId);
        const hadSet = presentByImage.get(imgStr) || new Set();
        const alreadyInThisAlbum = hadSet.has(String(album._id));
        if (!alreadyInThisAlbum) {
          if (!destRow.images.some(x => String(x) === imgStr)) {
            destRow.images.push(imgId);
            added += 1;
            addedByImage.get(imgStr)?.add(String(album._id));
          }
        } else {
          if (!destRow.images.some(x => String(x) === imgStr)) {
            destRow.images.push(imgId);
          }
        }
      }

      // ✅ Ensure final sort before saving (safety)
      album.data.sort((a, b) => new Date(b.date) - new Date(a.date));

      await album.save();
      perAlbumResults.push({ albumId: String(album._id), removed, added });
    }

    const bulkOps = [];
    for (const [imgStr, addedSet] of addedByImage.entries()) {
      const count = addedSet.size;
      if (count > 0) {
        bulkOps.push({
          updateOne: {
            filter: { _id: new mongoose.Types.ObjectId(imgStr) },
            update: { $inc: { "images.ref": count } }
          }
        });
      }
    }
    if (bulkOps.length) {
      await Image.bulkWrite(bulkOps, { ordered: false });
    }

    if (touchedAlbumIds.size) {
      const prunes = [...touchedAlbumIds].map(id => new mongoose.Types.ObjectId(id));
      await Album.updateMany(
        { _id: { $in: prunes } },
        { $pull: { data: { images: { $size: 0 } } } }
      );
    }

    return res.json({
      event,
      date: normalizedDate.toISOString(),
      albumsProcessed: perAlbumResults.length,
      perAlbum: perAlbumResults,
      images: imageIds,
      incrementsPerImage: [...addedByImage.entries()].map(([img, set]) => ({
        imageId: img,
        incBy: set.size
      }))
    });
  } catch (err) {
    console.error("Edit images error:", err);
    return e500(res, "server error");
  }
});

export default router;
