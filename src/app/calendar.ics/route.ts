// Subscribable iCalendar feed of the current season (he). See src/lib/ics.ts.
import { seasonIcsResponse } from "@/lib/ics";

export const dynamic = "force-static";
export const revalidate = 300;

export function GET() {
  return seasonIcsResponse("he");
}
