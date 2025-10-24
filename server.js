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
import completeProfileRoutes from './routes/complete-profile.js';
import paymentRoutes from './routes/payment.js';
import uploads from "./routes/uploads.js";
import tags from "./routes/tags.js";
import share from "./routes/share.js";
import edit from "./routes/edit.js";
import deleteRoute from "./routes/delete.js";
import meRoutes from "./routes/me.js";
import loadImages from "./routes/loadImages.js";
import download from "./routes/download.js";
import view from "./routes/view.js";
import makegroup from "./routes/makegroup.js";
import albumopts from "./routes/albumoptions.js";
import thumbnailurl from "./routes/thumbnailurl.js";
import requestdata from "./routes/requestdata.js";
import verifyroutes from "./routes/verify.js";
import changePassword from "./routes/changepassword.js";
import forgotpassword from "./routes/forgotpassword.js";
import updateuser from "./routes/UpdateUser.js";
import deleteaccount from "./routes/deleteaccount.js";
import friendroutes from "./routes/friends.js";

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
// const limiter = rateLimit({
//   windowMs: 15 * 60 * 1000, // 15 minutes
//   max: 100, // Limit each IP
//   message: 'Too many requests, please try again later.',
// });
// app.use(limiter);

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
app.use(completeProfileRoutes);
app.use(paymentRoutes);
app.use(uploads);
app.use(tags);
app.use(share);
app.use(edit);
app.use(deleteRoute);
app.use(meRoutes);
app.use("/albums", loadImages);
app.use(download);
app.use(view);
app.use(makegroup);
app.use(albumopts);
app.use(thumbnailurl);
app.use(requestdata);
app.use(verifyroutes);
app.use(changePassword);
app.use("/forgot-password",forgotpassword);
app.use(updateuser);
app.use(deleteaccount);
app.use("/friends",friendroutes);

//Server listening
app.listen(process.env.PORT, () => {
  console.log(`Server running`)
})