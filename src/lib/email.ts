import nodemailer from "nodemailer";

export function isSmtpConfigured() {
  return Boolean(
    process.env.SMTP_HOST &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASS &&
      process.env.SMTP_FROM,
  );
}

function getTransporter() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const port = Number(process.env.SMTP_PORT ?? 587);

  if (!host || !user || !pass) {
    throw new Error("SMTP chưa được cấu hình");
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

export async function sendOtpEmail(params: {
  to: string;
  code: string;
  purpose: "reset" | "change";
}) {
  const subject =
    params.purpose === "change"
      ? "Mã OTP đổi mật khẩu — AI Review Validator"
      : "Mã OTP quên mật khẩu — AI Review Validator";

  const actionLabel =
    params.purpose === "change" ? "đổi mật khẩu" : "đặt lại mật khẩu";

  const html = `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#0b1220;color:#e2e8f0;border-radius:12px">
      <h2 style="margin:0 0 12px;color:#a78bfa">AI Review Validator</h2>
      <p style="margin:0 0 16px;color:#94a3b8">Mã OTP để ${actionLabel}:</p>
      <p style="font-size:32px;letter-spacing:8px;font-weight:700;margin:0 0 16px;color:#fff">${params.code}</p>
      <p style="margin:0;color:#64748b;font-size:13px">Mã có hiệu lực 10 phút. Không chia sẻ mã này cho người khác.</p>
    </div>
  `;

  if (!isSmtpConfigured()) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("SMTP chưa được cấu hình trên server");
    }
    console.info(`[email:dev] OTP for ${params.to} (${params.purpose}): ${params.code}`);
    return { delivered: false as const, devMode: true as const };
  }

  const transporter = getTransporter();
  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: params.to,
    subject,
    html,
    text: `Mã OTP ${actionLabel}: ${params.code}. Hiệu lực 10 phút.`,
  });

  return { delivered: true as const, devMode: false as const };
}
