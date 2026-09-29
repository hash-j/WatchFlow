import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export type EncryptedCalendarToken = {
  ciphertext: Buffer;
  nonce: Buffer;
  authTag: Buffer;
  keyVersion: number;
};

export class CalendarTokenEncryptionError extends Error {
  constructor(message = "Calendar token encryption is not configured.") {
    super(message);
    this.name = "CalendarTokenEncryptionError";
  }
}

function key() {
  const value = process.env.CALENDAR_TOKEN_ENCRYPTION_KEY ?? "";
  const decoded = Buffer.from(value, "base64");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value) || decoded.length !== 32) {
    throw new CalendarTokenEncryptionError();
  }
  return decoded;
}

function keyVersion() {
  const value = Number(process.env.CALENDAR_TOKEN_ENCRYPTION_KEY_VERSION ?? "1");
  if (!Number.isInteger(value) || value < 1 || value > 32767) {
    throw new CalendarTokenEncryptionError("Calendar token key version is invalid.");
  }
  return value;
}

function aad(ownerId: string, version: number) {
  return Buffer.from(`watchflow:calendar-refresh-token:v${version}:${ownerId}`, "utf8");
}

export function encryptCalendarRefreshToken(
  refreshToken: string,
  ownerId: string,
): EncryptedCalendarToken {
  if (!refreshToken || !ownerId) throw new CalendarTokenEncryptionError("Calendar token input is invalid.");
  const version = keyVersion();
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), nonce);
  cipher.setAAD(aad(ownerId, version));
  const ciphertext = Buffer.concat([cipher.update(refreshToken, "utf8"), cipher.final()]);
  return { ciphertext, nonce, authTag: cipher.getAuthTag(), keyVersion: version };
}

export function decryptCalendarRefreshToken(
  encrypted: EncryptedCalendarToken,
  ownerId: string,
) {
  if (encrypted.nonce.length !== 12 || encrypted.authTag.length !== 16) {
    throw new CalendarTokenEncryptionError("Calendar token envelope is invalid.");
  }
  const decipher = createDecipheriv("aes-256-gcm", key(), encrypted.nonce);
  decipher.setAAD(aad(ownerId, encrypted.keyVersion));
  decipher.setAuthTag(encrypted.authTag);
  return Buffer.concat([decipher.update(encrypted.ciphertext), decipher.final()]).toString("utf8");
}

