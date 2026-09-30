import { NextResponse } from "next/server";

import { executeCalendarSync } from "@/lib/calendar/calendar-sync-executor";
import { isAuthorizedSchedulerRequest } from "@/lib/notifications/scheduler-auth";

export async function POST(request: Request) {
  if (!isAuthorizedSchedulerRequest(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await executeCalendarSync();
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      { error: "Calendar synchronization failed." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
