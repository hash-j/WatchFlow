import type { PickerResult } from "./types";

export type PickerActionState = {
  status: "idle" | "success" | "empty" | "error";
  message: string | null;
  requestId: number;
  result: PickerResult | null;
  warnings: string[];
  libraryTruncated: boolean;
};

export const initialPickerActionState: PickerActionState = {
  status: "idle",
  message: null,
  requestId: 0,
  result: null,
  warnings: [],
  libraryTruncated: false,
};
