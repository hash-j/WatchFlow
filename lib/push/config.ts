import "server-only";

import { vapidPublicKeySchema } from "./validation";

const vapidPrivateKeyPattern = /^[A-Za-z0-9_-]{40,60}$/;

function validVapidSubject(value: string) {
  if (value.startsWith("mailto:")) {
    return /^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

export function getVapidPublicKey() {
  const parsed = vapidPublicKeySchema.safeParse(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
  );
  return parsed.success ? parsed.data : null;
}

export type VapidConfiguration = {
  subject: string;
  publicKey: string;
  privateKey: string;
};

export function getVapidConfiguration(): VapidConfiguration | null {
  const publicKey = getVapidPublicKey();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim() ?? "";
  const subject = process.env.VAPID_SUBJECT?.trim() ?? "";

  if (
    !publicKey ||
    !vapidPrivateKeyPattern.test(privateKey) ||
    !validVapidSubject(subject)
  ) {
    return null;
  }

  return { subject, publicKey, privateKey };
}
