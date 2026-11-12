# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack
Next.js App Router, TypeScript, Tailwind, shadcn/ui, next-intl, Supabase, motion.dev. Hosted on Vercel Hobby (`tau-ai-club.vercel.app`). Source: docs/PLAN.md.

## Users
- **Primary (confirmed 2026-11-12):** members of the current TAU AI Club cohort (Cohort 02, 2026–27), Tel Aviv University students. Usually on a phone, checking when and where the next meetup is and grabbing the Luma link or the calendar invite.
- **Secondary:** curious outsiders (other students, speakers, sponsors) learning what the club does.

## Product Purpose
The official site of the TAU AI Club. Milestone 1: a bilingual public home that answers "what's next, and what's the season?" Later milestones add member sign-in, profiles, lecture summaries, workshops and admin (docs/PLAN.md).

## Positioning
A student-run AI builders' club at Tel Aviv University. Weekly Wednesday meetups, a "Zero to Hero" Claude workshop series, and talks from industry people. The tone is builder-first ("LET'S BUILD").

## Operating Context
- Events run 18:00–20:00 Asia/Jerusalem, mostly on Wednesdays.
- Registration happens on Luma. The site never runs its own registration.
- Workshops need prep: Claude Code installed, Pro plan, a laptop.
- Content is admin-edited in Supabase.

## Capabilities and Constraints
- Hebrew is the default (RTL). English lives under `/en` (LTR).
- Mobile first.
- Next event = the first published event with `ends_at > now()`.
- Venues can be TBD, and events can be tentative.
- There is no join form. Outsiders are pointed to Instagram (@tau.ai.club) and Luma (confirmed).

## Brand Commitments
- Pixel "TAU AI CLUB" logo, brand tokens in brand/brand-tokens.md (v0.1 draft).
- Club documents use Rubik, Silkscreen and IBM Plex Mono.
- Voice: casual, student, Hebrew-first, plural "you".

## Evidence on Hand
- brand/logo-screenshot.png (low-res only).
- Two club PDFs in brand/.
- Season seed data in docs/PLAN.md §4.
- No photos, testimonials or member counts. Do not fabricate them.

## Product Principles
1. The next event is always one glance away, with no delay at first paint.
2. Hebrew is first-class, not a translation.
3. Show only real schedule facts. Mark anything unknown honestly (TBD, tentative).
4. Members first, outsiders welcome via Instagram and Luma.

## Accessibility & Inclusion
WCAG AA contrast, full RTL/LTR parity, `prefers-reduced-motion` respected.
