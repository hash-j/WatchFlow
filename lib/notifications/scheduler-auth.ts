import "server-only";

import { timingSafeEqual } from "node:crypto";

const MINIMUM_SCHEDULER_SECRET_LENGTH = 32;

function bearerToken(authorization: string | null) {
  if (!authorization?.startsWith("Bearer ")) return null;
  const token = authorization.slice("Bearer ".length);
  return token.length > 0 ? token : null;
}

export function isAuthorizedSchedulerRequest(authorization: string | null) {
  const configured = process.env.WATCHFLOW_SCHEDULER_SECRET;
  const supplied = bearerToken(authorization);
  if (
    !configured ||
    configured.length < MINIMUM_SCHEDULER_SECRET_LENGTH ||
    !supplied
  ) {
    return false;
  }

  const expected = Buffer.from(configured, "utf8");
  const actual = Buffer.from(supplied, "utf8");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
