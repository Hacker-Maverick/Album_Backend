import { BrevoClient } from "@getbrevo/brevo";
import dotenv from "dotenv";
dotenv.config();

const brevo = new BrevoClient({
  apiKey: process.env.BREVO_API_KEY,
});

/**
 * Sends a transactional email using Brevo.
 * @param {string} to - Recipient email.
 * @param {string} subject - Email subject.
 * @param {string} text - Plain text content.
 * @param {string} html - HTML content (optional).
 * @returns {Promise<Object>} - The result from Brevo API.
 */
export async function sendMail(to, subject, text, html = "") {
  try {
    const result = await brevo.transactionalEmails.sendTransacEmail({
      subject,
      htmlContent: html,
      textContent: text || undefined,
      sender: {
        name: process.env.FROM_NAME || "Albumify",
        email: process.env.FROM_EMAIL || "pkumar199199@gmail.com",
      },
      to: [{ email: to }],
    });

    return result;
  } catch (error) {
    console.error("Brevo Email Error:", error);
    return { error };
  }
}
