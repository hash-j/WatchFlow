import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { getGoogleCalendarConfig } from "@/lib/calendar/google-config";
import { exchangeGoogleAuthorizationCode } from "@/lib/calendar/google-provider";
import { consumeCalendarOAuthState, saveGoogleCalendarConnection } from "@/lib/calendar/oauth-store";
import { GOOGLE_OAUTH_COOKIE, hashOAuthSessionBinding, hashOAuthValue, parseOAuthCookie } from "@/lib/calendar/oauth-state";
import { encryptCalendarRefreshToken } from "@/lib/calendar/token-encryption";
import { createClient } from "@/lib/supabase/server";

function destination(status: "connected" | "denied" | "invalid" | "failed") {
  const origin = getGoogleCalendarConfig().redirectUrl.origin;
  return new URL(`/settings/calendar?calendar=${status}`, origin);
}

function finish(status: "connected" | "denied" | "invalid" | "failed") {
  const response = NextResponse.redirect(destination(status));
  response.cookies.set(GOOGLE_OAUTH_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/api/calendar/google/callback",
    maxAge: 0,
  });
  return response;
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return finish("invalid");

  const state = request.nextUrl.searchParams.get("state") ?? "";
  const stored = parseOAuthCookie((await cookies()).get(GOOGLE_OAUTH_COOKIE)?.value);
  if (!state || !stored) return finish("invalid");

  try {
    const consumed = await consumeCalendarOAuthState({
      userId: user.id,
      stateHash: hashOAuthValue(state),
      bindingHash: hashOAuthSessionBinding(
        stored.binding,
        user.id,
        user.last_sign_in_at,
      ),
    });
    if (!consumed) return finish("invalid");
    if (request.nextUrl.searchParams.get("error") === "access_denied") return finish("denied");

    const code = request.nextUrl.searchParams.get("code");
    if (!code) return finish("invalid");
    const connected = await exchangeGoogleAuthorizationCode(code, stored.codeVerifier);
    await saveGoogleCalendarConnection({
      userId: user.id,
      providerSubject: connected.providerSubject,
      displayEmail: connected.displayEmail,
      grantedScopes: connected.grantedScopes,
      encrypted: encryptCalendarRefreshToken(connected.refreshToken, user.id),
    });
    return finish("connected");
  } catch {
    return finish("failed");
  }
}

