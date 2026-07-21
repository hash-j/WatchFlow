import { type EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";

import { getSafeRedirectPath } from "@/lib/auth/safe-redirect";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");
  const fallback = type === "recovery" ? "/auth/update-password" : "/dashboard";
  const next = getSafeRedirectPath(searchParams.get("next"), fallback);
  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      redirect(next);
    }

    redirect(`/auth/error?error=${encodeURIComponent(error.message)}`);
  }

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });

    if (!error) {
      redirect(next);
    }

    redirect(`/auth/error?error=${encodeURIComponent(error.message)}`);
  }

  redirect(
    `/auth/error?error=${encodeURIComponent("The authentication link is invalid or incomplete.")}`,
  );
}
