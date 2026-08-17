import { UpdatePasswordForm } from "@/components/update-password-form";
import { AuthShell } from "@/components/auth/auth-shell";
import { authErrorPath } from "@/lib/auth/errors";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Suspense } from "react";

async function UpdatePasswordContent() {
  let data;
  let error;

  try {
    const supabase = await createClient();
    const result = await supabase.auth.getClaims();
    data = result.data;
    error = result.error;
  } catch {
    redirect(authErrorPath("service_unavailable"));
  }

  if (error || !data?.claims) {
    redirect(authErrorPath("recovery_session_required"));
  }

  return <UpdatePasswordForm />;
}

export default function Page() {
  return (
    <AuthShell>
      <Suspense
        fallback={
          <div role="status" className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground shadow-sm">
            Validating your recovery link…
          </div>
        }
      >
        <UpdatePasswordContent />
      </Suspense>
    </AuthShell>
  );
}
