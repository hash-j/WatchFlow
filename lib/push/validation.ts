import { z } from "zod";

const pushKeySchema = (minimum: number, maximum: number) =>
  z
    .string()
    .min(minimum)
    .max(maximum)
    .regex(/^[A-Za-z0-9_-]+$/, "Push subscription key is invalid.");

export const pushSubscriptionSchema = z.object({
  endpoint: z
    .url("Push subscription endpoint is invalid.")
    .max(2048)
    .refine((value) => value.startsWith("https://"), {
      message: "Push subscription endpoint must use HTTPS.",
    }),
  expirationTime: z.number().int().positive().nullable(),
  keys: z.object({
    p256dh: pushKeySchema(16, 256),
    auth: pushKeySchema(8, 128),
  }),
});

export const vapidPublicKeySchema = z
  .string()
  .trim()
  .min(80)
  .max(120)
  .regex(/^[A-Za-z0-9_-]+$/);
