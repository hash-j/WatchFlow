import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/login-form";
import { redirectAuthenticatedUser } from "@/lib/auth/server";

export default async function LoginPage() {
  await redirectAuthenticatedUser();
  return <AuthShell><LoginForm /></AuthShell>;
}
