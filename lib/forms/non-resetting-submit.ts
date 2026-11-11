import { startTransition, type FormEvent } from "react";

/**
 * React 19 automatically calls `form.reset()` after an action passed as
 * `<form action={...}>` settles. That restores every field to its mount-time
 * default: `<select>` options to `defaultSelected`, checkboxes to
 * `defaultChecked` and uncontrolled inputs to their original `defaultValue`.
 * When the page is not re-rendered with fresh props (revalidation is deferred
 * with `after()` or skipped), the visible form silently diverges from saved
 * data, and a second save can submit those stale values.
 *
 * Dispatching the same `useActionState` action from `onSubmit` inside a
 * transition keeps the server action, validation and `isPending` behavior,
 * but React never schedules an automatic reset, so the fields stay on the
 * values the user saved or entered.
 */
export type FormActionDispatch = (payload: FormData) => void;

export type FormDataReader = (
  form: HTMLFormElement,
  submitter: HTMLElement | null,
) => FormData;

export const readSubmittedFormData: FormDataReader = (form, submitter) =>
  submitter ? new FormData(form, submitter) : new FormData(form);

type SubmitEventLike = Pick<
  FormEvent<HTMLFormElement>,
  "preventDefault" | "currentTarget"
> & {
  nativeEvent?: { submitter?: HTMLElement | null } | Event;
};

export function createNonResettingSubmitHandler(
  dispatch: FormActionDispatch,
  readFormData: FormDataReader = readSubmittedFormData,
  schedule: (callback: () => void) => void = startTransition,
) {
  return (event: SubmitEventLike) => {
    event.preventDefault();
    const form = event.currentTarget;
    const native = event.nativeEvent as { submitter?: HTMLElement | null } | undefined;
    const formData = readFormData(form, native?.submitter ?? null);
    schedule(() => dispatch(formData));
  };
}
