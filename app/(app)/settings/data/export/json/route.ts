import {
  buildAccountDataExport,
  exportFilenameDate,
} from "@/lib/settings/export";
import { readAccountExportSource } from "@/lib/settings/supabase-export";
import { authenticateSettings } from "@/lib/settings/supabase-settings";

export async function GET() {
  const session = await authenticateSettings();
  if (!session) {
    return Response.json({ error: "Authentication required." }, { status: 401 });
  }

  try {
    const source = await readAccountExportSource(
      session.client,
      session.user.id,
    );
    const body = buildAccountDataExport({
      exportedAt: new Date().toISOString(),
      email: session.user.email ?? null,
      ...source,
    });
    const filename = `watchflow-account-data-${exportFilenameDate()}.json`;

    return new Response(JSON.stringify(body, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store, max-age=0",
        Pragma: "no-cache",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return Response.json(
      { error: "Your account export could not be created." },
      {
        status: 500,
        headers: { "Cache-Control": "private, no-store, max-age=0" },
      },
    );
  }
}
