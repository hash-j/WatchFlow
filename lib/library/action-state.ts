export type LibraryActionState = {
  status: "idle" | "success" | "error";
  message: string | null;
};

export const initialLibraryActionState: LibraryActionState = {
  status: "idle",
  message: null,
};
