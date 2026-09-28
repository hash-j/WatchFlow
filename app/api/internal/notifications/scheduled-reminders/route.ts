import { NextResponse } from "next/server";

import { executeScheduledReminders } from "@/lib/notifications/scheduled-reminders";
import { isAuthorizedSchedulerRequest } from "@/lib/notifications/scheduler-auth";

export async function POST(request: Request) {
  if (!isAuthorizedSchedulerRequest(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await executeScheduledReminders();
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      { error: "Scheduled reminder execution failed." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
