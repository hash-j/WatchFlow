export type LibraryActionState = {
  status: "idle" | "success" | "error";
  message: string | null;
};

export const initialLibraryActionState: LibraryActionState = {
  status: "idle",
  message: null,
};

export type BulkLibraryActionState = LibraryActionState & {
  requestId: number;
  affected: number;
  skipped: number;
};

export const initialBulkLibraryActionState: BulkLibraryActionState = {
  ...initialLibraryActionState,
  requestId: 0,
  affected: 0,
  skipped: 0,
};
