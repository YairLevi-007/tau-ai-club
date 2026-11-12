# Home page copy: Milestone 1 (draft v0.1)

Voice: casual, student, Hebrew-first, plural "you" (אתם). Short and verb-led. English mirrors the meaning, not the words.
Keys match the comp (`design/home-comp.html`) and should become next-intl message keys under `home.*` / `common.*`.
⚠ = needs the club to confirm (spelling or fact).

## Header
| Key | Hebrew | English |
|---|---|---|
| `common.langSwitch` | EN | עב |
| `common.instagramLabel` (aria) | אינסטגרם | Instagram |
| `common.logoLabel` (aria) | מועדון ה-AI של אוניברסיטת תל אביב, לדף הבית | TAU AI Club home |

## Hero
| Key | Hebrew | English |
|---|---|---|
| `home.hero.line1` | בונים עם AI, | Building with AI, |
| `home.hero.line2` | ביחד. | together. |
| `home.hero.pitch` | מועדון ה-AI של אוניברסיטת תל אביב. הרצאות של אנשים מהתעשייה, סדנאות Zero to Hero, ואנשים שפשוט אוהבים לבנות דברים. | Tel Aviv University's AI club. Talks from people in the industry, Zero to Hero workshops, and a room full of people who like building things. |
| `home.hero.cohort` | COHORT 02 · 2026–27 (Silkscreen, Latin in both locales) | COHORT 02 · 2026–27 |
| `home.hero.when` | רביעי · 18:00 | Wednesdays · 18:00 |

Alternatives for line 1/2, if the club wants a different headline:
- "AI זה לא קסם. / בואו לבנות." · "AI isn't magic. / Come build."
- "מאפס ל-AI. / כל רביעי." · "Zero to AI. / Every Wednesday."

## Next event card
| Key | Hebrew | English |
|---|---|---|
| `event.next.label` | המפגש הבא | Next up |
| `event.relative.today` | היום | Today |
| `event.relative.tomorrow` | מחר | Tomorrow |
| `event.relative.inDays` | בעוד {n} ימים | In {n} days |
| `event.series` | סדנה {n} מתוך {total} בסדרת Zero to Hero | Workshop {n} of {total} in the Zero to Hero series |
| `event.speakerWith` | עם {name} | with {name} |
| `event.venue.tbd` | מיקום ייקבע | Venue TBA |
| `event.venue.roomTbd` | החדר ייקבע | Room TBA |
| `event.prep.title` | מה להביא: | Bring: |
| `event.prep.claudeCode` | Claude Code מותקן | Claude Code installed |
| `event.prep.pro` | מנוי Pro | A Pro plan |
| `event.prep.laptop` | לפטופ | Your laptop |
| `event.cta.luma` | הרשמה ב-Luma | Register on Luma |
| `event.cta.calendar` | הוסיפו ליומן | Add to calendar |
| `event.cta.details` | לפרטים | Details |

Empty state (no upcoming event, e.g. after the closing night):
| `event.next.none.title` | העונה נגמרה 🎉 נתראה במחזור הבא | That's a wrap for this season. See you next cohort |
| `event.next.none.body` | עקבו אחרינו באינסטגרם כדי לשמוע ראשונים. | Follow us on Instagram to hear first. |

The 🎉 is the one emoji the site gets. Drop it if you'd rather keep the site emoji-free.

## Season timeline
| Key | Hebrew | English |
|---|---|---|
| `home.season.title` | העונה | The season |
| `home.season.sub` | מחזור 02 · נובמבר עד ינואר. כל המפגשים ב-18:00. | Cohort 02 · November to January. Every meetup starts at 18:00. |
| `event.state.past` | עבר | Past |
| `event.state.next` | הבא | Next |
| `event.state.tentative` | טנטטיבי | Tentative |
| `event.venue.tbd` | מיקום ייקבע | Venue TBA |
| months | נובמבר · דצמבר · ינואר (Rubik) | NOV · DEC · JAN (Silkscreen) |
| weekdays | א׳ … ש׳ | Sun … Sat |

## Footer
| Key | Hebrew | English |
|---|---|---|
| `home.follow.text` | לא במחזור? עקבו אחרינו באינסטגרם, שם מעדכנים על אירועים פתוחים והמחזור הבא. | Not in the cohort? Follow us on Instagram for open events and the next cohort. |
| `common.signoff` | LET'S BUILD | LET'S BUILD |

## Season seed strings (for the DB seed)
| Date | title_he / title_en | speaker he / en | venue he / en |
|---|---|---|---|
| 11.11 | פתיחת המחזור / Cohort opening | שי יהל / Shai Yahel (spelled as in the club PDF) | אולם ברודקום ⚠ / Broadcom Hall |
| 18.11 | Zero to Hero 1: Claude (both) | עוז ⚠ / Oz ⚠ (full name?) | בקמפוס / On campus (room TBA) |
| 25.11 | Zero to Hero 2: Claude | עוז / Oz | מרכז היזמות ⚠ / Entrepreneurship Center |
| 2.12 | יזמות וטכנולוגיה / Entrepreneurship & Tech | אור מכבי ⚠ / Or Maccabi | משרדי MongoDB / MongoDB offices |
| 16.12 | Zero to Hero 3: Claude | עוז / Oz | מחוץ לקמפוס / Off campus (TBA) |
| 23.12 | יזמות וטכנולוגיה / Entrepreneurship & Tech | רועי מרגלית ⚠ / Roee Margalit | TBA |
| 30.12 | צמיחה והון / Growth & Capital | תומר דיארי ⚠ / Tomer Diari | משרדי Aleph / Aleph offices |
| 3.1 (Sun ⚠) | אירוע משותף / Joint event (tentative) | אורי גושן ⚠ / Ori Goshen | אולם ברודקום / Broadcom Hall |
| 6.1 | ערב סיום: Corporate, עם Google / Closing night: Corporate, with Google | — | TBA |

## Writing rules for the rest of the site
- Plural "you" (אתם / תביאו / הוסיפו), never gendered singular. "אני מגיע/ה" is avoided because of the slash.
- Keep English tech terms in English: AI, Claude Code, Agents, LLM, Luma, Pro.
- Wrap numbers, dates and times in `<bdi>`.
- No hype words (מהפכני, revolutionary), no exclamation marks in UI, at most one emoji per page.
- Error/empty copy names the situation and the next step: "עוד אין פרטים על המיקום. נעדכן כאן ובאינסטגרם."
