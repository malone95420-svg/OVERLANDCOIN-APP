import { sendResendEmail, type ResendSendResult } from "@/lib/email/sendResend";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function sendVerifyCodeEmail(input: {
  to: string;
  code: string;
  name?: string;
}): Promise<ResendSendResult> {
  const to = input.to.trim().toLowerCase();
  const name = input.name?.trim() || to.split("@")[0] || "explorer";
  const code = input.code.trim();
  const subject = `${code} is your OVERLANDCOIN verification code`;
  const text = [
    `Hi ${name},`,
    "",
    `Your OVERLANDCOIN verification code is: ${code}`,
    "",
    "It expires in 15 minutes. If you did not create a profile, ignore this email.",
    "",
    "The OVERLANDCOIN team",
  ].join("\n");
  const html = `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#0b1220;font-family:Georgia,Times,'Times New Roman',serif;color:#e8eef8;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b1220;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#121a2b;border:1px solid #2a3550;border-radius:16px;padding:32px;">
            <tr>
              <td>
                <p style="margin:0 0 8px;font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#d4b36a;">OVERLANDCOIN</p>
                <h1 style="margin:0 0 16px;font-size:28px;line-height:1.25;color:#fff;">Verify your email</h1>
                <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#d5deea;">Hi ${escapeHtml(name)},</p>
                <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#d5deea;">
                  Enter this code to finish creating your profile. It expires in 15 minutes.
                </p>
                <p style="margin:0 0 24px;font-size:32px;letter-spacing:0.2em;font-weight:700;color:#d4b36a;font-family:ui-monospace,Menlo,monospace;">${escapeHtml(code)}</p>
                <p style="margin:0;font-size:14px;line-height:1.6;color:#9aacbf;">If you did not sign up, ignore this email.<br/>The OVERLANDCOIN team</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
  return sendResendEmail({ to, subject, html, text });
}
