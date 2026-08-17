import "server-only";

import { cookies } from "next/headers";

import { normalizeEmail } from "./validation";
import { RESEND_COOLDOWN_SECONDS } from "./types";

export const PENDING_VERIFICATION_COOKIE = "watchflow_pending_verification";
export const PENDING_VERIFICATION_TTL_SECONDS = 15 * 60;

export type PendingVerification = {
  email: string;
  expiresAt: number;
  resendAvailableAt: number;
};

function encodePendingVerification(value: PendingVerification) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

export function decodePendingVerification(
  value: string | undefined,
  now = Date.now(),
): PendingVerification | null {
  if (!value || value.length > 1024) return null;

  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as Partial<PendingVerification>;
    const email = normalizeEmail(parsed.email);

    if (
      !email ||
      typeof parsed.expiresAt !== "number" ||
      typeof parsed.resendAvailableAt !== "number" ||
      !Number.isFinite(parsed.expiresAt) ||
      !Number.isFinite(parsed.resendAvailableAt) ||
      parsed.expiresAt <= now
    ) {
      return null;
    }

    return {
      email,
      expiresAt: parsed.expiresAt,
      resendAvailableAt: parsed.resendAvailableAt,
    };
  } catch {
    return null;
  }
}

export async function getPendingVerification() {
  const cookieStore = await cookies();
  return decodePendingVerification(
    cookieStore.get(PENDING_VERIFICATION_COOKIE)?.value,
  );
}

export async function setPendingVerification(
  email: string,
  resendAvailableAt = Date.now() + RESEND_COOLDOWN_SECONDS * 1000,
) {
  const cookieStore = await cookies();
  const pending: PendingVerification = {
    email: normalizeEmail(email),
    expiresAt: Date.now() + PENDING_VERIFICATION_TTL_SECONDS * 1000,
    resendAvailableAt,
  };

  cookieStore.set(PENDING_VERIFICATION_COOKIE, encodePendingVerification(pending), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/auth",
    maxAge: PENDING_VERIFICATION_TTL_SECONDS,
  });

  return pending;
}

export async function clearPendingVerification() {
  const cookieStore = await cookies();
  cookieStore.set(PENDING_VERIFICATION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/auth",
    maxAge: 0,
  });
}
