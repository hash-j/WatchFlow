import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";

import {
  authErrorPath,
  getAuthCallbackFailureReason,
  parseEmailOtpType,
} from "@/lib/auth/errors";
import { getSafeRedirectPath } from "@/lib/auth/safe-redirect";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = parseEmailOtpType(searchParams.get("type"));
  const fallback = type === "recovery" ? "/auth/update-password" : "/dashboard";
  const next = getSafeRedirectPath(searchParams.get("next"), fallback);

  if (tokenHash && type) {
    let supabase: Awaited<ReturnType<typeof createClient>>;
    try {
      supabase = await createClient();
    } catch (error) {
      redirect(authErrorPath(getAuthCallbackFailureReason(error)));
    }

    let verificationError: unknown;
    try {
      const result = await supabase.auth.verifyOtp({
        type,
        token_hash: tokenHash,
      });
      verificationError = result.error;
    } catch (error) {
      redirect(authErrorPath(getAuthCallbackFailureReason(error)));
    }

    if (verificationError) {
      redirect(
        authErrorPath(getAuthCallbackFailureReason(verificationError)),
      );
    }

    redirect(next);
  }

  redirect(authErrorPath("invalid_link"));
}
