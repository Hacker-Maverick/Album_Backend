import express from "express";
import User from "../models/userschema.js";
import { authMiddleware } from "../middlewares/auth.js";

const router = express.Router();

// 🔍 Search users by username
router.get("/search", authMiddleware, async (req, res) => {
  const { query } = req.query;
  if (!query) return res.status(400).json({ message: "Query required" });

  const users = await User.find(
    { username: { $regex: query, $options: "i" } },
    { username: 1 }
  ).limit(10);
  res.json(users);
});

// 🤝 Send friend request
router.post("/send/:toId", authMiddleware, async (req, res) => {
  try {
    const fromId = req.user.id;
    const toId = req.params.toId;

    if (fromId.toString() === toId)
      return res.status(400).json({ message: "Cannot send request to yourself" });

    const sender = await User.findById(fromId);
    const receiver = await User.findById(toId);

    if (!receiver) return res.status(404).json({ message: "User not found" });

    // Check if already friends
    if (receiver.friends.some(f => f.ref_id.equals(fromId)))
      return res.status(400).json({ message: "Already friends" });

    // Check if request already sent
    if (receiver.friendRequests.some(r => r.from.equals(fromId)))
      return res.status(400).json({ message: "Request already sent" });

    receiver.friendRequests.push({
      from: fromId,
      username: sender.username,
    });
    await receiver.save();

    res.json({ message: "Friend request sent" });
  } catch (err) {
    res.status(500).json({ message: "Error sending request", error: err.message });
  }
});

// ✅ Accept friend request
router.post("/accept/:fromId", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const fromId = req.params.fromId;

    const user = await User.findById(userId);
    const sender = await User.findById(fromId);

    if (!user || !sender)
      return res.status(404).json({ message: "User not found" });

    // Remove the friend request
    user.friendRequests = user.friendRequests.filter(r => !r.from.equals(fromId));

    // Add each other as friends
    user.friends.push({ ref_id: fromId, username: sender.username });
    sender.friends.push({ ref_id: userId, username: user.username });

    await user.save();
    await sender.save();

    res.json({ message: "Friend request accepted" });
  } catch (err) {
    res.status(500).json({ message: "Error accepting request", error: err.message });
  }
});

// ❌ Reject friend request
router.post("/reject/:fromId", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const fromId = req.params.fromId;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.friendRequests = user.friendRequests.filter(r => !r.from.equals(fromId));
    await user.save();

    res.json({ message: "Friend request rejected" });
  } catch (err) {
    res.status(500).json({ message: "Error rejecting request", error: err.message });
  }
});

// PATCH /friends/nickname/:friendId
router.patch("/nickname/:friendId", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { nickname } = req.body;
    const friendId = req.params.friendId;

    if (!nickname || nickname.trim() === "")
      return res.status(400).json({ message: "Nickname required" });

    const user = await User.findById(userId);
    const friend = user.friends.find(f => f.ref_id.equals(friendId));
    if (!friend) return res.status(404).json({ message: "Friend not found" });

    friend.nickname = nickname;
    await user.save();

    res.json({ message: "Nickname updated successfully" });
  } catch (err) {
    res.status(500).json({ message: "Error updating nickname", error: err.message });
  }
});

// DELETE /friends/remove/:friendId
router.delete("/remove/:friendId", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const friendId = req.params.friendId;

    const user = await User.findById(userId);
    const friend = await User.findById(friendId);

    if (!user || !friend) return res.status(404).json({ message: "User not found" });

    // Remove each other from friend lists
    user.friends = user.friends.filter(f => !f.ref_id.equals(friendId));
    friend.friends = friend.friends.filter(f => !f.ref_id.equals(userId));

    await user.save();
    await friend.save();

    res.json({ message: "Friend removed successfully" });
  } catch (err) {
    res.status(500).json({ message: "Error removing friend", error: err.message });
  }
});


export default router;
