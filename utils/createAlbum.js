// src/utils/createAlbum.js
import { Album } from "../models/albumschema.js";

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

  return album._id;
}
