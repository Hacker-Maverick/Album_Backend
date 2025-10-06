import express from "express";
import{ authMiddleware }from "../middlewares/auth.js";

const router = express.Router();

// Protected route
router.get("/",(req, res) => {
  res.status(200).json({
    success: true,
    message: "Test route is working fine",
  });
});

export default router;
