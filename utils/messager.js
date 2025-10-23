import dotenv from "dotenv";
dotenv.config();

export const sendOtpSms = async (phoneNumber, otp) => {
  try {
    const response = await fetch("https://www.fast2sms.com/dev/bulkV2", {
      method: "POST",
      headers: {
        authorization: process.env.FAST2SMS_API_KEY,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        variables_values: otp,
        route: process.env.FAST2SMS_ROUTE,
        numbers: phoneNumber,
      }),
    });

    const data = await response.json();
    console.log(data)

    if (data && data.return === true) {
      return { success: true, message: "OTP sent successfully", response: data };
    } else {
      return { success: false, message: data.message || "Failed to send OTP", response: data };
    }
  } catch (error) {
    console.error("Error sending OTP:", error.message);
    return { success: false, message: "Internal Server Error" };
  }
};