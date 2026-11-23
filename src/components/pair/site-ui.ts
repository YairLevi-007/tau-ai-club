// pAIr's doorway to the site's UI pieces (docs/PAIR.md). Safe in client components: nothing here
// may import server-only code, or next-intl navigation (that's site-nav.ts), so pure pAIr pieces
// load in plain Node tests. pAIr files import site code (`@/…`) only from here, site-nav.ts or
// `@/lib/pair/site`; tests/m3/pair-boundary.spec.ts enforces it.
// The site keeps these names and meanings stable, or updates pAIr in the same change.

export { TIME_ZONE, type Locale } from "@/i18n/routing";
export { formatShortDate, loc } from "@/lib/event-format";
export { cn } from "@/lib/utils";
export { dangerBtn, hintClass, inputClass, panelClass, panelTitle, smallBtn } from "@/components/admin/styles";
export { AdminHeader } from "@/components/admin/admin-header";
export { ActionForm, type ActionState } from "@/components/admin/action-form";
export { BidiText } from "@/components/events/bidi-text";
export { MemberAvatar } from "@/components/members/member-avatar";
export { ProfileSubline } from "@/components/members/profile-subline";
export { LinkedInIcon } from "@/components/site/linkedin-icon";
export { FlyerChip } from "@/components/events/flyer-bits";
