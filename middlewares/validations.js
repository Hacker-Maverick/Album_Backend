import { body, param, query, validationResult } from "express-validator";

// Middleware to handle validation errors
export const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ 
      success: false,
      errors: errors.array().map(err => ({ field: err.param, message: err.msg }))
    });
  }
  next();
};

// Auth Validators
export const validateSignup = [
  body("username")
    .trim()
    .isLength({ min: 3, max: 30 })
    .withMessage("Username must be 3-30 characters")
    .matches(/^[a-zA-Z0-9_-]+$/)
    .withMessage("Username can only contain letters, numbers, underscores, and hyphens"),
  body("email")
    .isEmail()
    .withMessage("Invalid email address")
    .normalizeEmail(),
  body("password")
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters")
    .matches(/[A-Z]/)
    .withMessage("Password must contain uppercase letter")
    .matches(/[a-z]/)
    .withMessage("Password must contain lowercase letter")
    .matches(/[0-9]/)
    .withMessage("Password must contain number")
    .matches(/[!@#$%^&*]/)
    .withMessage("Password must contain special character (!@#$%^&*)"),
  handleValidationErrors
];

export const validateLogin = [
  body("email")
    .isEmail()
    .withMessage("Invalid email address")
    .normalizeEmail(),
  body("password")
    .notEmpty()
    .withMessage("Password is required"),
  handleValidationErrors
];

export const validateForgotPassword = [
  body("identifier")
    .trim()
    .notEmpty()
    .withMessage("Email or phone is required")
    .custom(val => {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const phoneRegex = /^\d{10}$/;
      if (!emailRegex.test(val) && !phoneRegex.test(val)) {
        throw new Error("Identifier must be valid email or 10-digit phone");
      }
      return true;
    }),
  handleValidationErrors
];

export const validateChangePassword = [
  body("currentPassword")
    .notEmpty()
    .withMessage("Current password is required"),
  body("newPassword")
    .isLength({ min: 8 })
    .withMessage("New password must be at least 8 characters")
    .matches(/[A-Z]/)
    .withMessage("Password must contain uppercase letter")
    .matches(/[a-z]/)
    .withMessage("Password must contain lowercase letter")
    .matches(/[0-9]/)
    .withMessage("Password must contain number")
    .matches(/[!@#$%^&*]/)
    .withMessage("Password must contain special character"),
  body("confirmPassword")
    .custom((value, { req }) => value === req.body.newPassword)
    .withMessage("Passwords do not match"),
  handleValidationErrors
];

export const validateCompleteProfile = [
  body("username")
    .trim()
    .isLength({ min: 3, max: 30 })
    .withMessage("Username must be 3-30 characters")
    .matches(/^[a-zA-Z0-9_-]+$/)
    .withMessage("Username can only contain letters, numbers, underscores, and hyphens"),
  body("password")
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters")
    .matches(/[A-Z]/)
    .withMessage("Password must contain uppercase letter")
    .matches(/[a-z]/)
    .withMessage("Password must contain lowercase letter")
    .matches(/[0-9]/)
    .withMessage("Password must contain number"),
  handleValidationErrors
];

// User Update Validators
export const validateUpdateUser = [
  body("email")
    .optional()
    .isEmail()
    .withMessage("Invalid email address")
    .normalizeEmail(),
  body("phone")
    .optional()
    .matches(/^\d{10}$/)
    .withMessage("Phone must be 10 digits"),
  handleValidationErrors
];

// Friends Validators
export const validateFriendRequest = [
  body("toId")
    .notEmpty()
    .withMessage("Recipient ID is required")
    .isMongoId()
    .withMessage("Invalid recipient ID"),
  handleValidationErrors
];

export const validateFriendAction = [
  param("id")
    .isMongoId()
    .withMessage("Invalid friend ID"),
  handleValidationErrors
];

export const validateFriendSearch = [
  query("query")
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage("Search query must be 1-50 characters"),
  handleValidationErrors
];

// Upload Validators
export const validateFileUpload = [
  body("ext")
    .notEmpty()
    .withMessage("File extension is required")
    .matches(/^[a-zA-Z0-9]{2,4}$/)
    .withMessage("Invalid file extension"),
  body("mime")
    .notEmpty()
    .withMessage("MIME type is required")
    .matches(/^(image|video)\/.+$/)
    .withMessage("MIME type must be image or video"),
  handleValidationErrors
];

// Delete Validators
export const validateDelete = [
  body("imageIds")
    .isArray({ min: 1 })
    .withMessage("At least one image ID is required")
    .custom(ids => ids.every(id => typeof id === "string" && id.length === 24))
    .withMessage("All image IDs must be valid MongoDB ObjectIds"),
  handleValidationErrors
];

// View Validators
export const validateView = [
  body("imageIds")
    .isArray({ min: 1 })
    .withMessage("At least one image ID is required")
    .custom(ids => ids.every(id => typeof id === "string" && id.length === 24))
    .withMessage("All image IDs must be valid MongoDB ObjectIds"),
  handleValidationErrors
];

// Redeem Validators
export const validateRedeem = [
  body("plan")
    .notEmpty()
    .withMessage("Plan is required")
    .isIn(["free", "basic", "premium"])
    .withMessage("Invalid plan type"),
  handleValidationErrors
];

// Google Auth Validators
export const validateGoogleAuth = [
  body("idToken")
    .trim()
    .notEmpty()
    .withMessage("ID token is required")
    .isLength({ min: 50 })
    .withMessage("Invalid token format"),
  handleValidationErrors
];

// Utility Validators
export const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export const validatePhone = (phone) => {
  const phoneRegex = /^\d{10}$/;
  return phoneRegex.test(phone);
};

export const validateObjectId = (id) => {
  return /^[0-9a-fA-F]{24}$/.test(id);
};