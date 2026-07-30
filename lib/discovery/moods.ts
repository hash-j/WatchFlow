import {
  MOOD_KEYS,
  type MoodDefinition,
  type MoodKey,
} from "./types";

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeGenreLabel(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const label = value.replace(/\s+/g, " ").trim();
  return label || null;
}

export function genreComparisonKey(value: unknown) {
  return normalizeGenreLabel(value)?.toLocaleLowerCase("en-US") ?? null;
}

export function normalizeGenreLabels(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const labels = new Map<string, string>();

  for (const item of value) {
    const rawLabel =
      typeof item === "string"
        ? item
        : isRecord(item)
          ? item.name
          : null;
    const label = normalizeGenreLabel(rawLabel);
    const key = genreComparisonKey(label);

    if (label && key && !labels.has(key)) {
      labels.set(key, label);
    }
  }

  return [...labels.values()].sort((left, right) =>
    left.localeCompare(right, "en", { sensitivity: "base" }),
  );
}

export const MOOD_RULES: Record<MoodKey, MoodDefinition> = {
  exciting: {
    key: "exciting",
    label: "Exciting",
    genres: ["Action", "Adventure"],
    maxRuntime: null,
    explanation: "Exciting uses Action and Adventure genres.",
    caution: null,
  },
  relaxing: {
    key: "relaxing",
    label: "Relaxing",
    genres: ["Animation", "Comedy", "Romance"],
    maxRuntime: 130,
    explanation:
      "Relaxing uses Animation, Comedy, and Romance genres with a runtime of 130 minutes or less.",
    caution: null,
  },
  funny: {
    key: "funny",
    label: "Funny",
    genres: ["Comedy"],
    maxRuntime: null,
    explanation: "Funny uses the Comedy genre.",
    caution: null,
  },
  emotional: {
    key: "emotional",
    label: "Emotional",
    genres: ["Drama", "Romance"],
    maxRuntime: null,
    explanation: "Emotional uses Drama and Romance genres.",
    caution: null,
  },
  dark: {
    key: "dark",
    label: "Dark",
    genres: ["Crime", "Horror", "Thriller"],
    maxRuntime: null,
    explanation: "Dark uses Crime, Horror, and Thriller genres.",
    caution: null,
  },
  intense: {
    key: "intense",
    label: "Intense",
    genres: ["Action", "Crime", "Thriller", "War"],
    maxRuntime: null,
    explanation: "Intense uses Action, Crime, Thriller, and War genres.",
    caution: null,
  },
  mind_bending: {
    key: "mind_bending",
    label: "Mind-Bending",
    genres: ["Mystery", "Science Fiction", "Thriller"],
    maxRuntime: null,
    explanation:
      "Mind-Bending uses Mystery, Science Fiction, and Thriller genres.",
    caution: null,
  },
  family_oriented: {
    key: "family_oriented",
    label: "Family-oriented",
    genres: ["Adventure", "Animation", "Family"],
    maxRuntime: null,
    explanation:
      "Family-oriented uses Adventure, Animation, and Family genres.",
    caution:
      "WatchFlow does not store complete certification data, so review the movie details before choosing for children.",
  },
};

export function isMoodKey(value: unknown): value is MoodKey {
  return typeof value === "string" &&
    (MOOD_KEYS as readonly string[]).includes(value);
}

export function matchesMood(
  genres: readonly string[],
  runtimeMinutes: number | null,
  mood: MoodKey,
) {
  const definition = MOOD_RULES[mood];
  const movieGenres = new Set(
    genres
      .map(genreComparisonKey)
      .filter((genre): genre is string => Boolean(genre)),
  );
  const matchesGenre = definition.genres.some((genre) =>
    movieGenres.has(genreComparisonKey(genre)!),
  );

  if (!matchesGenre) {
    return false;
  }

  if (definition.maxRuntime === null) {
    return true;
  }

  return (
    runtimeMinutes !== null &&
    Number.isFinite(runtimeMinutes) &&
    runtimeMinutes > 0 &&
    runtimeMinutes <= definition.maxRuntime
  );
}

