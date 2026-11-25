// Settings shared by the Google Search Console node's dialog (in the
// browser) and its executor, so nothing here may import server code.

// Read-only: performance, URL inspection, sites and sitemaps. Added to the
// "Google account" credential's scopes (lib/google-oauth.ts).
export const SEARCH_CONSOLE_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";

// Google allows 25,000 rows; more than this would not fit a run's data
export const SEARCH_CONSOLE_MAX_ROWS = 1000;

export const SEARCH_CONSOLE_DIMENSIONS = [
  { value: "query", label: "Query (the words people searched)" },
  { value: "page", label: "Page" },
  { value: "country", label: "Country" },
  { value: "device", label: "Device" },
  { value: "date", label: "Date" },
  { value: "searchAppearance", label: "Search appearance" },
];

export const SEARCH_CONSOLE_TYPES = [
  { value: "web", label: "Web" },
  { value: "image", label: "Image" },
  { value: "video", label: "Video" },
  { value: "news", label: "News" },
  { value: "discover", label: "Discover" },
  { value: "googleNews", label: "Google News" },
];
