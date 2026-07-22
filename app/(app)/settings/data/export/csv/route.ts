import { buildLibraryCsv, exportFilenameDate } from "@/lib/settings/export";
import { authenticateSettings } from "@/lib/settings/supabase-settings";
import { readOwnedLibraryExportRows } from "@/lib/settings/supabase-export";

export async function GET() {
  const session = await authenticateSettings();
  if (!session) {
    return Response.json({ error: "Authentication required." }, { status: 401 });
  }

  try {
    const rows = await readOwnedLibraryExportRows(
      session.client,
      session.user.id,
    );
    const filename = `watchflow-library-${exportFilenameDate()}.csv`;

    return new Response(buildLibraryCsv(rows), {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store, max-age=0",
        Pragma: "no-cache",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return Response.json(
      { error: "Your library export could not be created." },
      {
        status: 500,
        headers: { "Cache-Control": "private, no-store, max-age=0" },
      },
    );
  }
}
