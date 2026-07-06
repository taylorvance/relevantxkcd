export const SEARCH_QUERY_PARAM = "q";

export function readUrlSearchQuery(search: string): string {
  return new URLSearchParams(search).get(SEARCH_QUERY_PARAM)?.trim() ?? "";
}

export function buildSearchQueryUrl(href: string, query: string): string {
  const url = new URL(href);
  const trimmedQuery = query.trim();

  if (trimmedQuery) {
    url.searchParams.set(SEARCH_QUERY_PARAM, trimmedQuery);
  } else {
    url.searchParams.delete(SEARCH_QUERY_PARAM);
  }

  return `${url.pathname}${url.search}${url.hash}`;
}
