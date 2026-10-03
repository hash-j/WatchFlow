import { NextResponse } from "next/server";

import { executeScheduledReminders } from "@/lib/notifications/scheduled-reminders";
import { isAuthorizedSchedulerRequest } from "@/lib/notifications/scheduler-auth";
import { logScheduledReminderExecution } from "@/lib/notifications/scheduler-observability";
import { isExpectedSchedulerTarget } from "@/lib/notifications/scheduler-target";

async function execute(request: Request) {
  if (!isAuthorizedSchedulerRequest(request.headers.get("authorization"))) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (!isExpectedSchedulerTarget()) {
    return NextResponse.json(
      { error: "Scheduled execution target verification failed." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const result = await executeScheduledReminders();
    return NextResponse.json(logScheduledReminderExecution(result), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      { error: "Scheduled reminder execution failed." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export const GET = execute;
export const POST = execute;
