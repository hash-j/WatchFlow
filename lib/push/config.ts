import "server-only";

import { vapidPublicKeySchema } from "./validation";

export function getVapidPublicKey() {
  const parsed = vapidPublicKeySchema.safeParse(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
  );
  return parsed.success ? parsed.data : null;
}
