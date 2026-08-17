import { AuthShell } from "@/components/auth/auth-shell";
import { SignUpForm } from "@/components/sign-up-form";
import { redirectAuthenticatedUser } from "@/lib/auth/server";

export default async function SignUpPage() {
  await redirectAuthenticatedUser();
  return <AuthShell><SignUpForm /></AuthShell>;
}
