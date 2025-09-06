import express from "express"
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import hpp from 'hpp';
import dotenv from 'dotenv';
import cookieParser from "cookie-parser";
import connectDB from './config/mongodb.js'

//routes
import signupRoutes from './routes/signup.js';
import loginRoutes from './routes/login.js';
import googleRoutes from './routes/google.js';
import testRoutes from './routes/test.js';
import completeProfileRoutes from './routes/complete-profile.js';
import paymentRoutes from './routes/payment.js';
import uploads from "./routes/uploads.js";
import tags from "./routes/tags.js";
import share from "./routes/share.js";

dotenv.config();

const app = express()

//Database connection
connectDB();

//Secure headers
app.use(helmet());

// Cookie Parser
app.use(cookieParser());

// Body parser with limits
app.use(express.json({ limit: '16kb' }));
app.use(express.urlencoded({ extended: true, limit: '16kb' }));

//CORS
app.use(cors({
  origin: '*',
  credentials: true,
}));

//Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP
  message: 'Too many requests, please try again later.',
});
app.use(limiter);

// // Prevent NoSQL Injection
app.use((req, res, next) => {
  if (req.body) {
    for (const prop in req.body) {
      if (/^\$/.test(prop) || /\./.test(prop)) {
        const sanitized = prop.replace(/^\$|\./g, '_');
        req.body[sanitized] = req.body[prop];
        delete req.body[prop];
      }
    }
  }
  next();
});

// Prevent HTTP Parameter Pollution
app.use(hpp());

// Routes
app.use(signupRoutes);
app.use(loginRoutes);
app.use(googleRoutes);
app.use(testRoutes);
app.use(completeProfileRoutes);
app.use(paymentRoutes);
app.use(uploads);
app.use(tags);
app.use(share);

//Server listening
app.listen(process.env.PORT, () => {
  console.log(`Server running`)
})