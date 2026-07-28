import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ListFormFields({
  idPrefix,
  name = "",
  description = "",
  fieldErrors,
}: {
  idPrefix: string;
  name?: string;
  description?: string;
  fieldErrors: Record<string, string[]>;
}) {
  const nameError = fieldErrors.name?.[0];
  const descriptionError = fieldErrors.description?.[0];
  const nameId = `${idPrefix}-name`;
  const nameErrorId = `${nameId}-error`;
  const descriptionId = `${idPrefix}-description`;
  const descriptionErrorId = `${descriptionId}-error`;

  return (
    <>
      <div className="space-y-2">
        <Label htmlFor={nameId}>List name</Label>
        <Input
          id={nameId}
          name="name"
          required
          maxLength={80}
          defaultValue={name}
          autoComplete="off"
          placeholder="Weekend Movies"
          aria-invalid={Boolean(nameError)}
          aria-describedby={nameError ? nameErrorId : undefined}
        />
        {nameError ? (
          <p id={nameErrorId} className="text-xs text-destructive" role="alert">
            {nameError}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor={descriptionId}>Description</Label>
        <textarea
          id={descriptionId}
          name="description"
          rows={4}
          maxLength={500}
          defaultValue={description}
          placeholder="Optional notes about this private collection"
          aria-invalid={Boolean(descriptionError)}
          aria-describedby={descriptionError ? descriptionErrorId : undefined}
          className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
        <div className="flex items-start justify-between gap-3">
          {descriptionError ? (
            <p
              id={descriptionErrorId}
              className="text-xs text-destructive"
              role="alert"
            >
              {descriptionError}
            </p>
          ) : (
            <span />
          )}
          <p className="text-xs text-muted-foreground">500 characters maximum</p>
        </div>
      </div>
    </>
  );
}
