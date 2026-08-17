"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import {
  getResendErrorMessage,
  getSignUpErrorMessage,
  getVerificationErrorMessage,
  isExistingAccountError,
} from "./action-errors";
import {
  clearPendingVerification,
  getPendingVerification,
  setPendingVerification,
} from "./pending-verification";
import {
  RESEND_COOLDOWN_SECONDS,
  type SignUpActionState,
  type VerificationActionState,
} from "./types";
import { validateOtp, validateSignUpForm } from "./validation";

export async function signUpAction(
  _previousState: SignUpActionState,
  formData: FormData,
): Promise<SignUpActionState> {
  const validation = validateSignUpForm(formData);
  if (!validation.success) {
    return {
      error: "Check the highlighted fields and try again.",
      fields: validation.fields,
      values: validation.values,
    };
  }

  const { email, fullName, password } = validation.data;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
      },
    });

    if (error && !isExistingAccountError(error)) {
      return {
        error: getSignUpErrorMessage(error),
        fields: {},
        values: { fullName, email },
      };
    }

    // A signup session here means email confirmation is disabled in Supabase.
    // Do not allow that configuration to bypass WatchFlow's verification step.
    if (data?.session) {
      await supabase.auth.signOut({ scope: "local" });
      return {
        error:
          "Email verification is not configured correctly. Please contact support.",
        fields: {},
        values: { fullName, email },
      };
    }

    await setPendingVerification(email);
  } catch (error) {
    return {
      error: getSignUpErrorMessage(error),
      fields: {},
      values: { fullName, email },
    };
  }

  redirect("/auth/verify-email");
}

export async function verifyEmailAction(
  _previousState: VerificationActionState,
  formData: FormData,
): Promise<VerificationActionState> {
  const validation = validateOtp(formData.get("code"));
  if (!validation.success) {
    return { error: validation.error, success: null, code: validation.code };
  }

  const pending = await getPendingVerification();
  if (!pending) {
    return {
      error: "Your verification session has expired. Return to signup to begin again.",
      success: null,
      code: validation.code,
    };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.verifyOtp({
      email: pending.email,
      token: validation.code,
      type: "email",
    });

    if (error) {
      return {
        error: getVerificationErrorMessage(error),
        success: null,
        code: validation.code,
      };
    }

    if (!data.session || !data.user) {
      return {
        error: "Your email was verified, but a secure session could not be created. Return to login.",
        success: null,
        code: validation.code,
      };
    }

    const { data: verified, error: userError } = await supabase.auth.getUser();
    if (
      userError ||
      !verified.user ||
      !verified.user.email_confirmed_at ||
      verified.user.email?.toLocaleLowerCase("en-US") !== pending.email
    ) {
      await supabase.auth.signOut({ scope: "local" });
      return {
        error: "We could not confirm a secure verified session. Return to login and try again.",
        success: null,
        code: validation.code,
      };
    }
  } catch (error) {
    return {
      error: getVerificationErrorMessage(error),
      success: null,
      code: validation.code,
    };
  }

  await clearPendingVerification();
  redirect("/dashboard");
}

export async function resendVerificationAction(
  _previousState: VerificationActionState,
  _formData: FormData,
): Promise<VerificationActionState> {
  void _previousState;
  void _formData;
  const pending = await getPendingVerification();
  if (!pending) {
    return {
      error: "Your verification session has expired. Return to signup to begin again.",
      success: null,
      code: "",
    };
  }

  if (pending.resendAvailableAt > Date.now()) {
    return {
      error: "Please wait for the countdown before requesting another code.",
      success: null,
      code: "",
    };
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: pending.email,
    });

    if (error) {
      return { error: getResendErrorMessage(error), success: null, code: "" };
    }

    await setPendingVerification(
      pending.email,
      Date.now() + RESEND_COOLDOWN_SECONDS * 1000,
    );
    return { error: null, success: "New verification code sent.", code: "" };
  } catch (error) {
    return { error: getResendErrorMessage(error), success: null, code: "" };
  }
}

export async function changeVerificationEmailAction() {
  await clearPendingVerification();
  redirect("/auth/sign-up");
}
