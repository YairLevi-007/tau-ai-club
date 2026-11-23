// pAIr's doorway to the site's locale-aware navigation (docs/PAIR.md). Safe in client components.
// Kept apart from site-ui.ts because next-intl's navigation loads only inside Next.js: pure pAIr
// pieces (pair-matrix, pair-bits, …) import site-ui.ts and stay testable in plain Node.

export { Link, redirect } from "@/i18n/navigation";
