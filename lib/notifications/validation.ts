import { z } from "zod";

export const notificationIdSchema = z.string().uuid();

export const csvImportNotificationCompletionSchema = z.object({
  completionId: z.string().uuid(),
  finalBatch: z.boolean(),
});
