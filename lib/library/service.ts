import type { LibraryMovie } from "../movies/types";
import { validateTmdbId } from "../movies/validation";
import { AuthenticationRequiredError } from "./errors";
import { isDatabaseIdentifier } from "./mapping";

export type AuthenticatedLibrarySession = {
  userId: string;
  client: unknown;
};

export type AddLibraryMovieResult = "added" | "duplicate";

export interface LibraryDependencies {
  authenticate(): Promise<AuthenticatedLibrarySession | null>;
  resolveSharedMovie(
    session: AuthenticatedLibrarySession,
    tmdbId: number,
  ): Promise<{ id: string }>;
  insertUserMovie(
    session: AuthenticatedLibrarySession,
    movieId: string,
  ): Promise<AddLibraryMovieResult>;
  listUserMovies(
    session: AuthenticatedLibrarySession,
  ): Promise<LibraryMovie[]>;
  getUserMovie(
    session: AuthenticatedLibrarySession,
    movieId: string,
  ): Promise<LibraryMovie | null>;
}

async function requireSession(dependencies: LibraryDependencies) {
  const session = await dependencies.authenticate();

  if (!session?.userId) {
    throw new AuthenticationRequiredError();
  }

  return session;
}

export async function addMovieToLibrary(
  tmdbId: number,
  dependencies: LibraryDependencies,
) {
  const session = await requireSession(dependencies);
  const validTmdbId = validateTmdbId(tmdbId);
  const sharedMovie = await dependencies.resolveSharedMovie(
    session,
    validTmdbId,
  );

  return dependencies.insertUserMovie(session, sharedMovie.id);
}

export async function listLibraryMovies(dependencies: LibraryDependencies) {
  const session = await requireSession(dependencies);
  return dependencies.listUserMovies(session);
}

export async function getLibraryMovie(
  movieId: string,
  dependencies: LibraryDependencies,
) {
  const session = await requireSession(dependencies);

  if (!isDatabaseIdentifier(movieId)) {
    return null;
  }

  return dependencies.getUserMovie(session, movieId);
}
