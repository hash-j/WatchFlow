import { UpdatePasswordForm } from "@/components/update-password-form";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Suspense } from "react";

async function UpdatePasswordContent() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims) {
    redirect("/auth/login");
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
