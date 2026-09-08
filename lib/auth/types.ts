export type FieldErrors = Partial<
  Record<"fullName" | "email" | "password" | "confirmPassword" | "code", string>
>;

export type SignUpActionState = {
  error: string | null;
  errorKind: "account_exists" | null;
  fields: FieldErrors;
  values: {
    fullName: string;
    email: string;
  };
};

export type VerificationActionState = {
  error: string | null;
  success: string | null;
  code: string;
};

export const INITIAL_SIGN_UP_STATE: SignUpActionState = {
  error: null,
  errorKind: null,
  fields: {},
  values: { fullName: "", email: "" },
};

export const INITIAL_VERIFICATION_STATE: VerificationActionState = {
  error: null,
  success: null,
  code: "",
};

export const RESEND_COOLDOWN_SECONDS = 60;
