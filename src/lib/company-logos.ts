/**
 * Company logos for the badge on speaker and founder photos (docs/DECISIONS.md, 18.11).
 * Matched by a word in the company name, so "Rotate · Check Point" finds Check Point.
 * Files in public/companies/: Google is its official four-colour G; MongoDB and AWS from Simple Icons; the rest from each
 * company's own site icon. `bleed`: the icon already has its own square background.
 * "stealth" is drawn in code (the purple padlock from the Stealth Startup logo).
 */
export type CompanyLogo = { src: string; bleed?: boolean } | { stealth: true };

const LOGOS: [RegExp, CompanyLogo][] = [
  [/\bstealth\b/i, { stealth: true }],
  [/\b(aws|amazon)\b/i, { src: "/companies/aws.svg" }],
  [/\bmongodb\b/i, { src: "/companies/mongodb.svg" }],
  [/\bgoogle\b/i, { src: "/companies/google.svg" }],
  [/\bcheck ?point\b/i, { src: "/companies/check-point.png" }],
  [/\bai21\b/i, { src: "/companies/ai21.png", bleed: true }],
  [/\baleph\b/i, { src: "/companies/aleph.png", bleed: true }],
  [/\bsilverfort\b/i, { src: "/companies/silverfort.png" }],
  [/\bxplg\b/i, { src: "/companies/xplg.png" }],
  [/\binvesting\.com\b/i, { src: "/companies/investing.png", bleed: true }],
];

export function companyLogo(company: string | null | undefined): CompanyLogo | null {
  if (!company) return null;
  return LOGOS.find(([re]) => re.test(company))?.[1] ?? null;
}
