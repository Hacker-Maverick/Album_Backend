// src/utils/createAlbum.js
import { Album } from "../models/albumschema.js";
import { updateServerLogs } from "./serverLogs.js";

/**
 * Create a new empty album
 * @param {String} type - type of the album, e.g., "Main Album" or "Group Album"
 * @returns {Promise<ObjectId>} - ID of the created album
 */
export async function createEmptyAlbum(type) {
  if (!type || typeof type !== "string") {
    throw new Error("Album type must be a non-empty string");
  }

  const album = new Album({
    type,
    data: [], // empty initially
  });

  await album.save();

      // 🆕 Update server logs for album creation
    await updateServerLogs("albumCreated", { count: 1 });

  return album._id;
}
