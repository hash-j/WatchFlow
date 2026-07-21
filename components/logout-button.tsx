"use client";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function LogoutButton() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const logout = async () => {
    const supabase = createClient();
    setError(null);
    setIsLoading(true);

    const { error } = await supabase.auth.signOut();

    if (error) {
      setError("Unable to sign out. Please try again.");
      setIsLoading(false);
      return;
    }

    router.replace("/auth/login");
    router.refresh();
  };

  return (
    <div className="flex flex-col items-start gap-1">
      <Button variant="outline" size="sm" onClick={logout} disabled={isLoading}>
        {isLoading ? "Signing out..." : "Sign out"}
      </Button>
      {error ? (
        <p className="max-w-40 text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
