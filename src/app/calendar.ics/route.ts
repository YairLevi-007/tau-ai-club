// iCalendar feed of the current season (he). See src/lib/ics.ts. Members only while the
// members area is on (src/lib/calendar-access.ts).
import type { NextRequest } from "next/server";
import { seasonIcsResponse } from "@/lib/ics";
import { calendarAllowed, calendarDenied } from "@/lib/calendar-access";

export async function GET(request: NextRequest) {
  if (!(await calendarAllowed(request))) return calendarDenied();
  return seasonIcsResponse("he");
}
