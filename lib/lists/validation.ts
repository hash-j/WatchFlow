import { z } from "zod";

import { LIBRARY_MOVIE_STATUSES } from "@/lib/movies/types";

const normalizeName = (value: string) =>
  value.trim().replace(/\s+/g, " ");

export const listUuidSchema = z
  .string()
  .trim()
  .uuid("The selected list record was invalid.");

export const userMovieUuidSchema = z
  .string()
  .trim()
  .uuid("The selected library record was invalid.");

export const listMovieUuidSchema = z
  .string()
  .trim()
  .uuid("The selected list movie was invalid.");

export const listNameSchema = z
  .string()
  .transform(normalizeName)
  .pipe(
    z
      .string()
      .min(1, "Enter a list name.")
      .max(80, "List name must be 80 characters or fewer."),
  );

export const listDescriptionSchema = z
  .string()
  .transform((value) => value.trim())
  .pipe(
    z
      .string()
      .max(500, "Description must be 500 characters or fewer."),
  )
  .transform((value) => value || null);

export const createListSchema = z.object({
  name: listNameSchema,
  description: listDescriptionSchema,
});

export const updateListSchema = createListSchema.extend({
  listId: listUuidSchema,
});

function uniqueUuidArray(
  itemSchema: typeof listUuidSchema | typeof userMovieUuidSchema,
  {
    emptyAllowed,
    emptyMessage,
    maximum,
  }: { emptyAllowed: boolean; emptyMessage: string; maximum: number },
) {
  const baseSchema = z
    .array(itemSchema)
    .max(maximum, `Choose no more than ${maximum} items at a time.`);
  const sizedSchema = emptyAllowed
    ? baseSchema
    : baseSchema.min(1, emptyMessage);

  return sizedSchema.superRefine((values, context) => {
      if (new Set(values).size !== values.length) {
        context.addIssue({
          code: "custom",
          message: "The selection contained duplicate records.",
        });
      }
    });
}

export const userMovieIdsSchema = uniqueUuidArray(userMovieUuidSchema, {
  emptyAllowed: false,
  emptyMessage: "Select at least one movie.",
  maximum: 100,
});

export const listIdsSchema = uniqueUuidArray(listUuidSchema, {
  emptyAllowed: true,
  emptyMessage: "",
  maximum: 500,
});

export const addMoviesToListSchema = z.object({
  listId: listUuidSchema,
  userMovieIds: userMovieIdsSchema,
});

export const moveListItemSchema = z.object({
  listMovieId: listMovieUuidSchema,
  direction: z.enum(["up", "down"], {
    error: "Choose a valid list movement.",
  }),
});

export const removeListMovieSchema = z.object({
  listMovieId: listMovieUuidSchema,
});

export const setMovieListMembershipsSchema = z.object({
  userMovieId: userMovieUuidSchema,
  listIds: listIdsSchema,
});

export const deleteListSchema = z.object({
  listId: listUuidSchema,
  confirmation: z
    .string()
    .trim()
    .min(1, "Enter the list name to confirm deletion."),
});

export const listPickerSchema = z.object({
  query: z
    .string()
    .trim()
    .max(100, "Search must be 100 characters or fewer.")
    .catch(""),
  status: z.enum(["all", ...LIBRARY_MOVIE_STATUSES]).catch("all"),
  favourite: z.enum(["all", "favourites"]).catch("all"),
});

export function parseListPickerState(input: {
  listQuery?: string | string[];
  listStatus?: string | string[];
  listFavourite?: string | string[];
}) {
  const first = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value[0] : value;

  return listPickerSchema.parse({
    query: first(input.listQuery) ?? "",
    status: first(input.listStatus) ?? "all",
    favourite: first(input.listFavourite) ?? "all",
  });
}

export function flattenListValidationErrors(error: z.ZodError) {
  return error.flatten().fieldErrors as Record<string, string[]>;
}
