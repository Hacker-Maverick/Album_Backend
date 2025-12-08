import nodemailer from "nodemailer";
import dotenv from "dotenv";
dotenv.config();

export async function sendMail(to, subject, text, html="") {

  // create transporter using SMTP
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 465,
    secure: true, // true for 465, false for 587
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    },
    // optional: increase timeout for slow networks
    // connectionTimeout: 50000,
  });

  // Verify config (optional, helpful for debugging)
  await transporter.verify();

  const info = await transporter.sendMail({
    from: `"${process.env.FROM_NAME}" <${process.env.FROM_EMAIL}>`,
    to,
    subject,
    text,
    html
  });

  return info;
}
