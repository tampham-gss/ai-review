import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { sendOtpEmail } from "@/lib/email";

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_COOLDOWN_MS = 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;

export type OtpPurpose = "reset" | "change";

function generateOtpCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function createAndSendOtp(email: string, purpose: OtpPurpose) {
  const normalized = email.toLowerCase().trim();
  const user = await prisma.user.findUnique({ where: { email: normalized } });
  if (!user) {
    // Không tiết lộ email có tồn tại hay không
    return {
      ok: true as const,
      message: "Nếu email tồn tại, mã OTP đã được gửi.",
      devOtp: undefined as string | undefined,
    };
  }

  const latest = await prisma.passwordResetOtp.findFirst({
    where: { email: normalized, purpose, usedAt: null },
    orderBy: { createdAt: "desc" },
  });

  if (latest && Date.now() - latest.createdAt.getTime() < OTP_COOLDOWN_MS) {
    const waitSec = Math.ceil(
      (OTP_COOLDOWN_MS - (Date.now() - latest.createdAt.getTime())) / 1000,
    );
    return {
      ok: false as const,
      error: `Vui lòng đợi ${waitSec}s trước khi gửi lại OTP`,
    };
  }

  const code = generateOtpCode();
  const codeHash = await bcrypt.hash(code, 10);

  await prisma.passwordResetOtp.create({
    data: {
      email: normalized,
      codeHash,
      purpose,
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
    },
  });

  const sendResult = await sendOtpEmail({
    to: normalized,
    code,
    purpose,
  });

  return {
    ok: true as const,
    message: sendResult.delivered
      ? "Đã gửi mã OTP tới email của bạn."
      : "SMTP chưa cấu hình — dùng mã OTP hiển thị (chế độ dev).",
    devOtp: sendResult.devMode ? code : undefined,
  };
}

export async function verifyOtp(
  email: string,
  code: string,
  purpose: OtpPurpose,
) {
  const normalized = email.toLowerCase().trim();
  const otp = await prisma.passwordResetOtp.findFirst({
    where: {
      email: normalized,
      purpose,
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!otp) {
    return { ok: false as const, error: "OTP không hợp lệ hoặc đã hết hạn" };
  }

  if (otp.attempts >= OTP_MAX_ATTEMPTS) {
    return {
      ok: false as const,
      error: "Đã nhập sai quá nhiều lần. Hãy yêu cầu mã mới.",
    };
  }

  const match = await bcrypt.compare(code.trim(), otp.codeHash);
  if (!match) {
    await prisma.passwordResetOtp.update({
      where: { id: otp.id },
      data: { attempts: { increment: 1 } },
    });
    return { ok: false as const, error: "Mã OTP không đúng" };
  }

  return { ok: true as const, otpId: otp.id };
}

export async function consumeOtp(otpId: string) {
  await prisma.passwordResetOtp.update({
    where: { id: otpId },
    data: { usedAt: new Date() },
  });
}
