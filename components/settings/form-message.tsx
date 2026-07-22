import type { SettingsActionState } from "@/lib/settings/types";

export function FormMessage({ state }: { state: SettingsActionState }) {
  if (!state.message) return null;

  return (
    <p
      className={
        state.status === "error"
          ? "text-sm text-destructive"
          : "text-sm text-muted-foreground"
      }
      role={state.status === "error" ? "alert" : "status"}
    >
      {state.message}
    </p>
  );
}

export function FieldError({
  errors,
  id,
}: {
  errors: string[] | undefined;
  id: string;
}) {
  if (!errors?.length) return null;

  return (
    <p id={id} className="text-xs text-destructive" role="alert">
      {errors[0]}
    </p>
  );
}
