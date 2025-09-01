import express from "express";
import{ authMiddleware }from "../middlewares/auth.js";

const router = express.Router();

// Protected route
router.get("/protected", authMiddleware, (req, res) => {
  res.json({
    success: true,
    message: "You are authorized!",
    user: req.user, // comes from decoded JWT
  });
});

export default router;
