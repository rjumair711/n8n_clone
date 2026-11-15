// Google Calendar "List Events" without the network: checking the time
// range, shaping Google's events into a small output, and the "is this
// slot free?" answer a booking bot needs.

export const CALENDAR_LIST_DEFAULT_MAX = 50;
export const CALENDAR_LIST_MAX = 250; // Google's own page size limit

export const clampMaxResults = (value: unknown): number => {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n <= 0) return CALENDAR_LIST_DEFAULT_MAX;
  return Math.min(n, CALENDAR_LIST_MAX);
};

/** An ISO time for Google, or an error naming the field. Empty is allowed. */
export const toIsoTime = (label: string, value: string): string | undefined => {
  const text = value.trim();
  if (!text) return undefined;
  // JavaScript reads some loose text ("tomorrow at 5") as a date, so only
  // ISO dates (2026-12-31, 2026-12-31T10:00, with or without an offset) pass
  const date = new Date(text);
  // A date put in as {{$now}} renders as "Sun Nov 15 2026 10:00:00 GMT+0500 (...)"
  const isoLike = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?)?(Z|[+-]\d{2}:?\d{2})?$/i.test(text);
  const dateString = /^[A-Z][a-z]{2} [A-Z][a-z]{2} \d{2} \d{4} \d{2}:\d{2}:\d{2} GMT[+-]\d{4}/.test(text);
  if (!(isoLike || dateString) || Number.isNaN(date.getTime())) {
    throw new Error(`${label} "${text}" is not a date and time. Use ISO format, for example 2026-12-31T10:00:00+05:00`);
  }
  return date.toISOString();
};

export const checkRange = (timeMin?: string, timeMax?: string) => {
  if (timeMin && timeMax && new Date(timeMax).getTime() <= new Date(timeMin).getTime()) {
    throw new Error("End of range must be after Start of range");
  }
};

type GoogleTime = { dateTime?: string | null; date?: string | null; timeZone?: string | null } | null | undefined;

type GoogleEvent = {
  id?: string | null;
  summary?: string | null;
  description?: string | null;
  location?: string | null;
  status?: string | null;
  transparency?: string | null;
  htmlLink?: string | null;
  start?: GoogleTime;
  end?: GoogleTime;
  attendees?: { email?: string | null; responseStatus?: string | null }[] | null;
};

export type ListedEvent = {
  id: string;
  summary: string;
  description: string;
  location: string;
  start: string;
  end: string;
  allDay: boolean;
  status: string;
  busy: boolean;
  htmlLink: string;
  attendees: { email: string; responseStatus: string }[];
};

const timeOf = (time: GoogleTime) => time?.dateTime ?? time?.date ?? "";

/**
 * An event blocks the time unless it was cancelled or is marked "Free"
 * (transparency "transparent") in Google Calendar.
 */
export const isBusy = (event: GoogleEvent) =>
  event.status !== "cancelled" && event.transparency !== "transparent";

export const shapeEvent = (event: GoogleEvent): ListedEvent => ({
  id: event.id ?? "",
  summary: event.summary ?? "",
  description: event.description ?? "",
  location: event.location ?? "",
  start: timeOf(event.start),
  end: timeOf(event.end),
  allDay: !event.start?.dateTime && !!event.start?.date,
  status: event.status ?? "",
  busy: isBusy(event),
  htmlLink: event.htmlLink ?? "",
  attendees: (event.attendees ?? []).map((attendee) => ({
    email: attendee.email ?? "",
    responseStatus: attendee.responseStatus ?? "",
  })),
});

/** The node's output for a list of Google events. */
export const summarizeEvents = (items: GoogleEvent[], truncated: boolean) => {
  const events = items.map(shapeEvent);
  const busyCount = events.filter((event) => event.busy).length;
  return {
    events,
    count: events.length,
    busyCount,
    // Only meaningful with a range: nothing in it blocks the time
    isFree: busyCount === 0,
    ...(truncated ? { truncated: true } : {}),
  };
};
