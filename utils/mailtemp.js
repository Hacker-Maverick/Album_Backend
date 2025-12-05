export const mailTemplate = `<!-- OTP HTML template -->
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial; background:#f4f6f8; padding:24px;">
  <tr>
    <td align="center">
      <table width="600" cellpadding="0" cellspacing="0" role="presentation" style="background:#ffffff; border-radius:10px; overflow:hidden; box-shadow:0 6px 20px rgba(16,24,40,0.08);">
        <!-- Header -->
        <tr>
          <td style="padding:20px 24px; background: linear-gradient(90deg,#4f46e5,#06b6d4); color:white; text-align:left;">
            <h1 style="margin:0; font-size:18px; font-weight:700;">Albumify</h1>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:28px 24px 18px; color:#0f172a;">
            <p style="margin:0 0 12px; font-size:15px; color:#0b1726;">
              Hello,
            </p>

            <p style="margin:0 0 18px; font-size:14px; color:#374151; line-height:1.45;">
              Use the code below to complete your sign-in. This code is valid for <strong>5 minutes</strong>. Do not share it with anyone.
            </p>

            <!-- OTP box -->
            <div style="margin:18px 0; display:flex; justify-content:center;">
              <div style="background:#f8fafc; border:1px solid #e6eef8; padding:14px 22px; border-radius:8px; text-align:center; font-size:22px; letter-spacing:4px; font-weight:700; color:#111827;">
                123456
              </div>
            </div>

            <p style="margin:0 0 18px; font-size:13px; color:#6b7280;">
              If you didn't request this, you can safely ignore this email. The code will expire automatically.
            </p>

            <table cellpadding="0" cellspacing="0" role="presentation" style="margin-top:8px;">
              <tr>
                <td style="padding:10px 14px; background:#ffffff; border-radius:6px; border:1px solid #eef2ff; font-size:13px; color:#374151;">
                  Need help? Reply to this email and we'll assist you.
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:18px 24px; background:#f7fafc; color:#64748b; font-size:12px; text-align:center;">
            ©Albumify • All rights reserved • <span style="color:#111827">Privacy</span>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
`