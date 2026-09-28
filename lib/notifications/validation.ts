import { z } from "zod";

const postgresUuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const notificationIdSchema = z.string().regex(postgresUuidPattern);

export const csvImportNotificationCompletionSchema = z.object({
  completionId: z.string().uuid(),
  finalBatch: z.boolean(),
});
