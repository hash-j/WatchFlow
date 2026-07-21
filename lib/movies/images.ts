const TMDB_IMAGE_BASE_URL = "https://image.tmdb.org/t/p";

export function getTmdbImageUrl(
  path: string | null,
  size: "w342" | "w500" | "w780" = "w500",
) {
  if (!path || !path.startsWith("/")) {
    return null;
  }

  return `${TMDB_IMAGE_BASE_URL}/${size}${path}`;
}

export function getMovieReleaseYear(releaseDate: string | null) {
  return releaseDate ? releaseDate.slice(0, 4) : null;
}

export function getYouTubeTrailerUrl(key: string) {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(key)}`;
}
