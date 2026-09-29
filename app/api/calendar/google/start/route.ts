import { NextRequest, NextResponse } from "next/server";

import { createCalendarOAuthState } from "@/lib/calendar/oauth-store";
import {
  createOAuthAttempt,
  GOOGLE_OAUTH_COOKIE,
  GOOGLE_OAUTH_TTL_SECONDS,
  hashOAuthSessionBinding,
  hashOAuthValue,
  serializeOAuthCookie,
} from "@/lib/calendar/oauth-state";
import { buildGoogleAuthorizationUrl, createPkceChallenge } from "@/lib/calendar/google-provider";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.redirect(new URL("/auth/login", request.nextUrl.origin));

  try {
    const attempt = createOAuthAttempt();
    await createCalendarOAuthState({
      userId: user.id,
      stateHash: hashOAuthValue(attempt.state),
      bindingHash: hashOAuthSessionBinding(
        attempt.binding,
        user.id,
        user.last_sign_in_at,
      ),
      expiresAt: new Date(Date.now() + GOOGLE_OAUTH_TTL_SECONDS * 1000),
    });
    const response = NextResponse.redirect(buildGoogleAuthorizationUrl({
      state: attempt.state,
      codeChallenge: createPkceChallenge(attempt.codeVerifier),
    }));
    response.cookies.set(GOOGLE_OAUTH_COOKIE, serializeOAuthCookie(attempt.binding, attempt.codeVerifier), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/api/calendar/google/callback",
      maxAge: GOOGLE_OAUTH_TTL_SECONDS,
    });
    return response;
  } catch {
    return NextResponse.redirect(new URL("/settings/calendar?calendar=unavailable", request.nextUrl.origin));
  }
}

