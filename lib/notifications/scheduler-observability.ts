import "server-only";

import type { CalendarSyncExecutionResult } from "@/lib/calendar/calendar-sync-executor";
import type { ScheduledReminderExecutionResult } from "./scheduled-reminders";

const REMINDER_LOG_LABEL = "watchflow.scheduler.scheduled-reminders";
const CALENDAR_LOG_LABEL = "watchflow.scheduler.calendar-sync";

export function scheduledReminderCounters(
  result: ScheduledReminderExecutionResult,
) {
  return {
    claimedJobs: result.claimedJobs,
    attemptedDeliveries: result.attemptedDeliveries,
    delivered: result.delivered,
    retryable: result.retryable,
    failed: result.failed,
  };
}

export function calendarSyncCounters(result: CalendarSyncExecutionResult) {
  return {
    claimed: result.claimed,
    succeeded: result.succeeded,
    retryable: result.retryable,
    failed: result.failed,
    authRequired: result.authRequired,
    staleFinalizations: result.staleFinalizations,
  };
}

export function logScheduledReminderExecution(
  result: ScheduledReminderExecutionResult,
) {
  const counters = scheduledReminderCounters(result);
  console.info(REMINDER_LOG_LABEL, counters);
  return counters;
}

export function logCalendarSyncExecution(result: CalendarSyncExecutionResult) {
  const counters = calendarSyncCounters(result);
  console.info(CALENDAR_LOG_LABEL, counters);
  return counters;
}
