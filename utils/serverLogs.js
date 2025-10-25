// src/utils/serverLogs.js
import ServerLogs from "../models/serverlogschema.js";
import dayjs from "dayjs";

/**
 * Updates lifetime and monthly server stats.
 * @param {string} action - The event type (imageUploaded, albumCreated, paymentMade, userSignedUp)
 * @param {object} data - Extra data, e.g., { count: 5 } or { amount: 200, email: "x@y.com" }
 */
export const updateServerLogs = async (action, data = {}) => {
  const now = dayjs();
  const monthKey = now.format("YYYY-MM"); // e.g. "2025-10"

  // 🔍 Ensure we have a single ServerLogs document
  let serverLogs = await ServerLogs.findOne();
  if (!serverLogs) serverLogs = new ServerLogs();

  // 🔹 Find or create monthly entry for current month
  let currentMonth = serverLogs.monthly.find((m) => m.month === monthKey);
  if (!currentMonth) {
    currentMonth = {
      month: monthKey,
      totalImagesUploaded: 0,
      totalAlbumsCreated: 0,
      totalPaymentsCollected: 0,
      newUsers: [],
    };
    serverLogs.monthly.push(currentMonth);
  }

  // 🧮 Switch between different tracked events
  switch (action) {
    case "imageUploaded": {
      const count = data.count || 1; // how many images uploaded
      serverLogs.lifetime.totalImagesUploaded += count;
      currentMonth.totalImagesUploaded += count;
      break;
    }

    case "albumCreated": {
      const count = data.count || 1;
      serverLogs.lifetime.totalAlbumsCreated += count;
      currentMonth.totalAlbumsCreated += count;
      break;
    }

    case "paymentMade": {
      const amount = data.amount || 0;
      serverLogs.lifetime.totalPaymentsCollected += amount;
      currentMonth.totalPaymentsCollected += amount;
      break;
    }

    case "userSignedUp": {
      const email = data.email;
      if (!email) break;

      // lifetime total users
      if (!serverLogs.lifetime.allUserEmails.includes(email)) {
        serverLogs.lifetime.totalUsers += 1;
        serverLogs.lifetime.allUserEmails.push(email);
      }

      // month new users
      if (!currentMonth.newUsers.includes(email))
        currentMonth.newUsers.push(email);

      break;
    }

    default:
      console.warn("⚠️ Unknown action passed to updateServerLogs:", action);
  }

  serverLogs.lastUpdated = new Date();
  await serverLogs.save();
};
