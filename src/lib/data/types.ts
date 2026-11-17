// Row shapes as the public (anon) API returns them. Keep in sync with
// supabase/migrations. Replace with `supabase gen types` once the projects exist.

export type EventKind = "opening" | "lecture" | "workshop" | "joint" | "closing" | "other";

export type Cohort = {
  id: string;
  slug: string;
  name_he: string;
  name_en: string;
  tagline_he: string | null;
  tagline_en: string | null;
  starts_on: string;
  ends_on: string;
};

export type Venue = {
  id: string;
  name_he: string;
  name_en: string;
  address_he: string | null;
  address_en: string | null;
  maps_url: string | null;
};

/** Public speaker profile. There is deliberately no contact data on this type. */
export type Speaker = {
  id: string;
  slug: string;
  name_he: string;
  name_en: string;
  company_he: string | null;
  company_en: string | null;
  role_he: string | null;
  role_en: string | null;
  photo_url: string | null;
};

export type ClubEvent = {
  id: string;
  slug: string;
  kind: EventKind;
  series: string | null;
  series_no: number | null;
  title_he: string;
  title_en: string;
  blurb_he: string | null;
  blurb_en: string | null;
  starts_at: string;
  ends_at: string;
  venue_note_he: string | null;
  venue_note_en: string | null;
  luma_url: string | null;
  is_tentative: boolean;
  /** Last edit (DB trigger). Drives the calendar feed's SEQUENCE/LAST-MODIFIED and the sitemap's lastmod. */
  updated_at: string;
  venue: Venue | null;
  event_speakers: { sort: number; speaker: Speaker }[];
};

export type EventState = "past" | "live" | "next" | "upcoming";

export type SeasonEvent = ClubEvent & { state: EventState };

export type Season =
  | { status: "ok"; cohort: Cohort | null; events: SeasonEvent[]; next: SeasonEvent | null; now: string }
  | { status: "unavailable"; reason: "not-configured" | "error" };
