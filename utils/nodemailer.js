import nodemailer from "nodemailer";
import dotenv from "dotenv";
dotenv.config();

export const sendMail = async (to, subject, text, html = "") => {
  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    const mailOptions = {
      from: '"Albumify" <pkumar199199@gmail.com>',
      to,
      subject,
      text,
      html,
    };

    const result = await transporter.sendMail(mailOptions);
    return { success: true, result };
  } catch (error) {
    console.error("Mail sending failed:", error);
    return { success: false, error };
  }
};