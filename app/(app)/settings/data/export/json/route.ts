import {
  buildAccountDataExport,
  exportFilenameDate,
} from "@/lib/settings/export";
import { readAccountExportSource } from "@/lib/settings/supabase-export";
import { authenticateSettings } from "@/lib/settings/supabase-settings";

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
  "X-Content-Type-Options": "nosniff",
};

export async function GET() {
  try {
    const session = await authenticateSettings();
    if (!session) {
      return Response.json(
        { error: "Authentication required." },
        { status: 401, headers: PRIVATE_HEADERS },
      );
    }

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
        ...PRIVATE_HEADERS,
      },
    });
  } catch {
    return Response.json(
      { error: "Your account export could not be created." },
      {
        status: 500,
        headers: PRIVATE_HEADERS,
      },
    );
  }
}
