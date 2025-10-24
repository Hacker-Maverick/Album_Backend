// utils/checkEmailInServerLogs.js
import ServerLogs from "../models/serverlogschema.js";

/**
 * ✅ Checks if a user's email already exists in lifetime records
 * @param {string} email - The email address to check
 * @returns {Promise<boolean>} - True if email exists, else false
 */
export const checkEmailInServerLogs = async (email) => {
  try {
    if (!email) return false;

    const logs = await ServerLogs.findOne(
      { "lifetime.allUserEmails": email },
      { _id: 1 }
    ).lean();

    return !!logs; // true if found
  } catch (err) {
    console.error("Error checking email in server logs:", err);
    return false;
  }
};
