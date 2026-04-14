import * as SibApiV3Sdk from "@getbrevo/brevo";
import dotenv from "dotenv";
dotenv.config();

const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();
apiInstance.setApiKey(SibApiV3Sdk.TransactionalEmailsApiApiKeys.apiKey, process.env.BREVO_API_KEY);

export async function sendMail(to, subject, text, html = "") {
  try {
    const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();

    sendSmtpEmail.subject = subject;
    sendSmtpEmail.htmlContent = html;
    sendSmtpEmail.textContent = text || undefined;
    sendSmtpEmail.sender = {
      name: process.env.FROM_NAME || "Albumify",
      email: process.env.FROM_EMAIL || "pkumar199199@gmail.com",
    };
    sendSmtpEmail.to = [{ email: to }];

    const result = await apiInstance.sendTransacEmail(sendSmtpEmail);
    return result;
  } catch (error) {
    console.error("Brevo Email Error:", error);
    return { error };
  }
}
