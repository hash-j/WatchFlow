import { UpdatePasswordForm } from "@/components/update-password-form";
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

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <UpdatePasswordForm />
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="grid min-h-svh place-items-center text-sm text-muted-foreground">
          Validating your recovery link...
        </div>
      }
    >
      <UpdatePasswordContent />
    </Suspense>
  );
}
