// Initiatives mockups: the page content for each screen (Hebrew, RTL). Injected by shoot.mjs into
// real pages of the local site. All names and initiatives are made up for the mockup.

const svg = (d, extra = "") => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${d}</svg>`;
const I = {
  cal: svg('<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>'),
  pin: svg('<path d="M20 10c0 5-8 12-8 12s-8-7-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>'),
  users: svg('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>'),
  ext: svg('<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  check: svg('<path d="M20 6 9 17l-5-5"/>'),
  clock: svg('<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>'),
  back: svg('<path d="m9 18 6-6-6-6"/>'), // RTL: "back" points right
  fwd: svg('<path d="m15 18-6-6 6-6"/>'),
  lock: svg('<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>'),
  eye: svg('<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>'),
  x: svg('<path d="M18 6 6 18M6 6l12 12"/>'),
  copy: svg('<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>'),
  spark: svg('<path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"/>'),
};
const b = (s) => `<bdi>${s}</bdi>`;
const ltr = (s) => `<bdi dir="ltr">${s}</bdi>`;
const av = (t, c = "", size = "") => `<span class="av ${c} ${size}">${t}</span>`;
const faces = (list) => `<span class="stack">${list.map(([t, c]) => av(t, c, "sm")).join("")}</span>`;
const lead = (name, initials, role = "", c = "") => `<div class="who">${av(initials, c)}<div><b>${name}</b><small>${role}</small></div></div>`;
const head = (eyebrow, title, lede, side = "") => `
  <header class="ini-head"><p class="eyebrow-he text-sm">${eyebrow}</p>
    <div class="ini-head-row"><h1>${title}</h1>${side}</div>
    ${lede ? `<p class="lede">${lede}</p>` : ""}</header>`;

/* ---------- shared example content ---------- */
const HACK = {
  type: "האקתון", title: `האקתון סוכני ${ltr("AI")} לקמפוס`,
  short: "יומיים לבנות סוכן שעוזר לסטודנטים: מערכת שעות, מילואים, מלגות. מנטורים מהתעשייה, אוכל, וחשמל בשפע.",
  when: `חמישי–שישי, ${b("10–11")} בדצמבר`, where: "בניין שרייבר, חדר 006", until: `הרשמה עד ${b("3.12")}`,
};
const READ = {
  type: "קבוצת לימוד", title: `קבוצת קריאה: מאמרים על ${ltr("Agents")}`,
  short: "פעם בשבוע קוראים מאמר אחד ומדברים עליו שעה. בלי הכנה מראש מעבר לקריאה.",
  when: `כל יום שלישי, ${ltr("18:00")}`, where: "בזום",
};
const BOT = {
  type: "פרויקט", title: "בוט שעונה לסטודנטים חדשים",
  short: "בוט בוואטסאפ שעונה על השאלות של השבוע הראשון: איפה, מתי, למי פונים. בונים אותו עד סוף הסמסטר.",
  when: `עד ${b("31.1")}`, where: "מרחוק, ופגישה פעם בשבועיים",
};
const TEEN = {
  type: "התנדבות", title: `סדנת ${ltr("AI")} לתיכוניסטים בדרום`,
  short: "שני מפגשים של שעתיים בתיכון בירוחם. מלמדים לבנות משהו קטן עם מודל שפה, מאפס.",
  when: `ינואר, ${b("2")} מפגשים`, where: "ירוחם (הסעה מהקמפוס)",
};

/* People (all made up). Any member can lead an initiative (DECISIONS 19.11). */
const DANA = ["דנה כהן", "דכ", "הנדסה · שנה 3", ""];
const YOAV = ["יואב מזרחי", "ימ", "מדעי המחשב · שנה 2", "b"];
const TAL = ["טל גבאי", "טג", "ניהול · תואר שני", "c"];
const L = (p) => lead(p[0], p[1], p[2], p[3]);
const F = [["נל", ""], ["אב", "b"], ["מש", "c"], ["רח", "d"], ["תג", "b"]];
const propose = `<span class="btn btn-primary sm">${I.plus}הצעת יוזמה</span>`;
const usersIcon = I.users.replace("<svg", '<svg style="width:1rem;height:1rem;color:var(--brand-purple-soft)"');

/* ---------- the simple card (options 1 and 3) ---------- */
const simpleCard = (x, { joined = false, count, need, fs = F.slice(1, 5), featured = false, full = false, guest = false, by = DANA }) => `
  <li class="ini-card${featured ? " featured" : ""}">
    <div class="between"><span class="chip ${featured ? "purple" : ""}">${x.type}</span><span class="subtle" style="font-size:.8125rem">${x.until ?? ""}</span></div>
    <h3><a class="stretch" href="#">${x.title}</a></h3>
    <p>${x.short}</p>
    <div class="meta"><span>${I.cal}${x.when}</span><span>${I.pin}${x.where}</span></div>
    <div class="joinbar" style="position:relative;z-index:1">
      ${guest ? `<span class="row muted" style="font-size:.875rem">${usersIcon}${b(count)} חברים בפנים${need ? ` · ${need}` : ""}</span>`
              : `<span class="row">${faces(fs)}<span>${b(count)} בפנים${need ? ` · ${need}` : ""}</span></span>`}
      ${full ? '<span class="chip">מלא</span>' : guest ? "" : joined ? `<span class="joined">${I.check}אני בפנים</span>` : '<span class="btn btn-primary sm">אני בפנים</span>'}
    </div>
    <div class="by">${L(by)}</div>
  </li>`;

/* ---------- the sheet any member opens from "הצעת יוזמה" ---------- */
const sheet = (fields, { admin = false } = {}) => `
<div class="scrim"></div>
<div class="sheet ini" role="dialog" aria-label="הצעת יוזמה">
  <span class="handle"></span>
  <h2>הצעת יוזמה</h2>
  <p class="subtle" style="margin:0 0 1rem;font-size:.875rem">${admin ? "את מנהלת, אז היוזמה עולה מיד." : "מנהל יעבור עליה, ואז היא תופיע לכל החברים."}</p>
  <div class="form">${fields}</div>
  <div class="foot"><span class="btn btn-primary">${admin ? "פרסום" : "שליחה לאישור"}</span><span class="btn btn-ghost">ביטול</span></div>
</div>`;
const baseFields = `
    <label class="field">סוג<span class="seg"><span class="on">האקתון</span><span>פרויקט</span><span>קבוצת לימוד</span><span>התנדבות</span><span>אחר</span></span></label>
    <label class="field">כותרת<span class="in focus">${HACK.title}</span></label>
    <label class="field">כמה מילים<span class="in area" style="min-height:4.5rem">${HACK.short}</span></label>
    <div class="two-col">
      <label class="field">מתי<span class="in">${HACK.when}</span></label>
      <label class="field">איפה<span class="in">${HACK.where}</span></label>
    </div>
    <label class="field">כמה מקומות <small>ריק = בלי הגבלה</small><span class="in mono">40</span></label>`;

/* =====================================================================
   OPTION 1 · "פשוט, לחברים": members only, a short card + "אני בפנים"
   ===================================================================== */
const o1ListBody = (opts = {}) => `
<div class="ini">
  ${head("אזור החברים", "יוזמות", "דברים שחברי המועדון מזמינים אתכם לעשות יחד. לוחצים \"אני בפנים\", ומי שמוביל מעדכן אתכם. יש לכם רעיון? הציעו יוזמה.", propose)}
  <nav class="filters" aria-label="סינון"><a aria-current="true">הכל</a><a>האקתון</a><a>פרויקט</a><a>קבוצת לימוד</a><a>התנדבות</a><a>שלי</a></nav>
  <ul class="ini-list two">
    ${simpleCard(HACK, { count: 23, need: "עוד מקום ל-17", featured: true, joined: opts.joined })}
    ${simpleCard(READ, { count: 9, need: "עוד מקום ל-1", fs: F.slice(0, 4), by: YOAV })}
    ${simpleCard(BOT, { count: 4, need: "מחפשים עוד 2", fs: F.slice(2, 5), by: TAL })}
    ${simpleCard(TEEN, { count: 6, full: true, fs: F.slice(0, 3), by: YOAV })}
  </ul>
</div>`;
export const o1List = o1ListBody();

const leadBox = `
      <div class="lead-only">
        <span class="t">${I.eye}רק מי שמוביל רואה את זה</span>
        <div class="between"><b style="font-size:.9375rem">מי בפנים ${b("(23)")}</b><span class="btn btn-ghost sm">שליחת עדכון לכולם</span></div>
        <ul class="people">
          <li><div class="who">${av("נל", "", "sm")}<b>נועה לוי</b></div><span class="mono">היום</span></li>
          <li><div class="who">${av("אב", "b", "sm")}<b>אביגיל בן שושן</b></div><span class="mono">${b("18.11")}</span></li>
          <li><div class="who">${av("מש", "c", "sm")}<b>מיכאל שגיא</b></div><span class="mono">${b("18.11")}</span></li>
        </ul>
        <p class="subtle" style="margin:0;font-size:.8125rem">העדכון יוצא במייל מהאתר. כתובות המייל של החברים לא מוצגות.</p>
      </div>`;

export const o1Item = `
<div class="ini">
  <a class="back" href="#">${I.back}כל היוזמות</a>
  <div class="detail">
    <div style="display:grid;gap:1.25rem">
      <div class="row"><span class="chip purple">${HACK.type}</span><span class="subtle" style="font-size:.8125rem">${HACK.until}</span></div>
      <h1>${HACK.title}</h1>
      <div class="meta" style="font-size:.9375rem"><span>${I.cal}${HACK.when}</span><span>${I.pin}${HACK.where}</span></div>
      <div class="prose">
        <p>${HACK.short}</p>
        <p>מתחלקים לצוותים של שלושה–ארבעה. אפשר להגיע עם צוות או לבד, ונמצא לכם צוות במקום. בסוף יום שישי כל צוות מציג חמש דקות.</p>
      </div>
      ${leadBox}
    </div>
    <aside class="ini-card featured">
      <div class="spots"><div class="between"><b style="font-size:1.125rem">${b("23")} בפנים</b><span>מקום ל-${b("40")}</span></div><div class="bar"><i style="width:57%"></i></div></div>
      <span class="row">${faces(F)}<span class="muted" style="font-size:.875rem">ועוד ${b("18")}</span></span>
      <span class="joined" style="justify-content:center;width:100%">${I.check}אני בפנים</span>
      <a class="link" href="#" style="justify-content:center;color:var(--fg-subtle);font-weight:500">לא אוכל להגיע</a>
      <hr class="hr">
      <p class="eyebrow-he text-sm">מי מוביל</p>
      ${L(DANA)}
    </aside>
  </div>
  <div class="toast">${I.check}<span>נרשמת. דנה תשלח עדכונים לכל מי שבפנים.</span></div>
</div>`;

export const o1Post = o1ListBody() + sheet(baseFields);

/* =====================================================================
   OPTION 2 · "עם תפקידים, לחברים": members only, stages + roles
   ===================================================================== */
const stage = (k) => ({ recruit: '<span class="stage recruit">מגייסים</span>', work: '<span class="stage work">בעבודה</span>', done: '<span class="stage done">הושלם</span>' })[k];
const roleCard = (x, { st, roles, result, featured = false, by = YOAV, count }) => `
  <li class="ini-card${featured ? " featured" : ""}${st === "done" ? " quiet" : ""}">
    <div class="between"><span class="row">${stage(st)}<span class="chip">${x.type}</span></span>${count ? `<span class="subtle" style="font-size:.8125rem">${b(count)} בפנים</span>` : ""}</div>
    <h3><a class="stretch" href="#">${x.title}</a></h3>
    <p>${x.short}</p>
    ${roles ? `<div class="row" style="gap:.375rem"><span class="subtle" style="font-size:.8125rem">מחפשים:</span>${roles.map((r) => `<span class="chip ok">${r}</span>`).join("")}</div>` : ""}
    <div class="between by">${L(by)}
      ${result ? `<a class="link" href="#">לתוצאה${I.fwd}</a>` : ""}</div>
  </li>`;
const DONE = { type: "פרויקט", title: "מדריך פרומפטים לסטודנטים", short: `עשרים פרומפטים שעובדים לסיכום, תרגול ומבחנים. נכתב על ידי ${b("6")} חברים, ומשמש כבר יותר מ-${b("1,200")} סטודנטים.` };

export const o2List = `
<div class="ini">
  ${head("אזור החברים", "יוזמות", "מה חברי המועדון בונים עכשיו. כל יוזמה מחפשת אנשים לתפקידים, ואתם בוחרים במה לעזור. יש לכם רעיון? הציעו יוזמה.", propose)}
  <nav class="filters" aria-label="סינון"><a aria-current="true">הכל</a><a>מגייסים</a><a>בעבודה</a><a>הושלמו</a><a>שלי</a></nav>
  <ul class="ini-list two">
    ${roleCard(BOT, { st: "recruit", roles: [`פיתוח ×${b("2")}`, "עיצוב", "כתיבה"], featured: true, by: TAL, count: 4 })}
    ${roleCard(HACK, { st: "recruit", roles: ["צוותים", `מנטורים ×${b("3")}`], by: DANA, count: 23 })}
    ${roleCard(READ, { st: "work", count: 9 })}
    ${roleCard(DONE, { st: "done", result: true, by: DANA })}
  </ul>
</div>`;

export const o2Item = `
<div class="ini">
  <a class="back" href="#">${I.back}כל היוזמות</a>
  <div class="detail">
    <div style="display:grid;gap:1.25rem">
      <div class="row">${stage("recruit")}<span class="chip">${BOT.type}</span></div>
      <h1>${BOT.title}</h1>
      <div class="meta" style="font-size:.9375rem"><span>${I.cal}${BOT.when}</span><span>${I.pin}${BOT.where}</span></div>
      <div class="prose">
        <p>${BOT.short}</p>
        <p>הבוט עונה מתוך מסמך אחד שאנחנו כותבים יחד. אם הוא לא יודע, הוא מפנה לאדם. בונים את זה בחלקים קטנים, כל אחד בשעות שנוחות לו.</p>
      </div>
      <div class="stages" aria-label="שלבים" style="gap:.5rem;align-items:center">
        <span class="stage recruit">מגייסים</span><span class="subtle">←</span><span class="stage work" style="opacity:.6">בעבודה</span><span class="subtle">←</span><span class="stage done" style="opacity:.6">הושלם</span>
      </div>
    </div>
    <aside class="ini-card featured">
      <p class="eyebrow-he text-sm">במה אפשר לעזור</p>
      <ul class="roles">
        <li><div><b>פיתוח</b><div class="n">${b("1")} מתוך ${b("2")}</div></div><span class="row">${faces([["מש", "c"]])}<span class="btn btn-primary">אני על זה</span></span></li>
        <li><div><b>עיצוב</b><div class="n">${b("0")} מתוך ${b("1")}</div></div><span class="btn btn-primary">אני על זה</span></li>
        <li class="full"><div><b>כתיבה</b><div class="n">מלא</div></div>${faces([["אב", "b"]])}</li>
        <li><div><b>בדיקות</b><div class="n">כל מי שרוצה</div></div><span class="joined" style="height:2.5rem;font-size:.875rem">${I.check}אני על זה</span></li>
      </ul>
      <hr class="hr">
      <p class="eyebrow-he text-sm">מי מוביל</p>
      ${L(TAL)}
    </aside>
  </div>
</div>`;

export const o2Post = o2List + sheet(`
    <label class="field">כותרת<span class="in">${BOT.title}</span></label>
    <label class="field">כמה מילים<span class="in area" style="min-height:4.5rem">${BOT.short}</span></label>
    <div class="field">במה צריך עזרה <small>כמה אנשים בכל תפקיד. ריק = כל מי שרוצה.</small>
      <div style="display:grid;gap:.5rem">
        <div class="role-edit"><span class="in">פיתוח</span><span class="in mono">2</span><span class="x">${I.x}</span></div>
        <div class="role-edit"><span class="in">עיצוב</span><span class="in mono">1</span><span class="x">${I.x}</span></div>
        <div class="role-edit"><span class="in focus">כתיבה</span><span class="in mono">1</span><span class="x">${I.x}</span></div>
        <span class="btn btn-ghost sm" style="justify-self:start">${I.plus}עוד תפקיד</span>
      </div></div>
    <label class="field">עד מתי<span class="in">${BOT.when}</span></label>`);

/* =====================================================================
   OPTION 3 · "פתוח לכולם": guests see it (no member names), members join
   ===================================================================== */
export const o3List = `
<div class="ini">
  ${head("מחזור 02", "יוזמות", "מה חברי המועדון עושים יחד, מעבר למפגשים. חברי המועדון מצטרפים ומציעים יוזמות מכאן.")}
  <nav class="filters" aria-label="סינון"><a aria-current="true">פתוחות</a><a>הושלמו</a></nav>
  <ul class="ini-list two">
    ${simpleCard(HACK, { count: 23, need: "עוד מקום ל-17", featured: true, guest: true })}
    ${simpleCard(BOT, { count: 4, need: "מחפשים עוד 2", guest: true, by: TAL })}
    ${simpleCard(READ, { count: 9, need: "עוד מקום ל-1", guest: true, by: YOAV })}
    ${roleCard(DONE, { st: "done", result: true, by: DANA })}
  </ul>
  <div class="guest-join"><p class="muted" style="margin:0">רוצים להצטרף ליוזמה או להציע אחת? זה לחברי המועדון. <a class="link" href="#" style="display:inline;min-height:auto">כניסה לחברים</a></p></div>
</div>`;

export const o3Item = `
<div class="ini">
  <a class="back" href="#">${I.back}כל היוזמות</a>
  <div class="detail">
    <div style="display:grid;gap:1.25rem">
      <div class="row"><span class="chip purple">${HACK.type}</span><span class="subtle" style="font-size:.8125rem">${HACK.until}</span></div>
      <h1>${HACK.title}</h1>
      <div class="meta" style="font-size:.9375rem"><span>${I.cal}${HACK.when}</span><span>${I.pin}${HACK.where}</span></div>
      <div class="prose">
        <p>${HACK.short}</p>
        <p>מתחלקים לצוותים של שלושה–ארבעה. אפשר להגיע עם צוות או לבד, ונמצא לכם צוות במקום. בסוף יום שישי כל צוות מציג חמש דקות.</p>
      </div>
    </div>
    <aside class="ini-card featured">
      <div class="spots"><div class="between"><b style="font-size:1.125rem">${b("23")} חברים בפנים</b><span>מקום ל-${b("40")}</span></div><div class="bar"><i style="width:57%"></i></div></div>
      <p class="subtle" style="font-size:.8125rem;margin:0">אורחים רואים כמה, לא מי.</p>
      <a class="btn btn-primary" href="#" style="width:100%">כניסה לחברים כדי להצטרף</a>
      <hr class="hr">
      <p class="eyebrow-he text-sm">מי מוביל</p>
      ${L(DANA)}
    </aside>
  </div>
</div>`;

export const o3Post = o1ListBody() + sheet(baseFields + `
    <p class="note-approve">${I.eye}<span>אחרי האישור, גם מי שלא במועדון יראה אותה. בלי שמות של חברים.</span></p>`);

/* =====================================================================
   SAME IN EVERY OPTION · waiting for approval, and where the admin approves
   ===================================================================== */
export const flowPending = `
<div class="ini">
  ${head("אזור החברים", "יוזמות", "", propose)}
  <nav class="filters" aria-label="סינון"><a>הכל</a><a>האקתון</a><a>פרויקט</a><a>קבוצת לימוד</a><a>התנדבות</a><a aria-current="true">שלי</a></nav>
  <section style="display:grid;gap:1rem">
    <h2 class="sec">ההצעות שלי</h2>
    <ul class="ini-list two">
      <li class="ini-card pending">
        <div class="between"><span class="pend">${I.clock}ממתינה לאישור</span><span class="subtle" style="font-size:.8125rem">נשלחה היום, ${ltr("10:42")}</span></div>
        <h3>${HACK.title}</h3>
        <p>${HACK.short}</p>
        <div class="meta"><span>${I.cal}${HACK.when}</span><span>${I.pin}${HACK.where}</span></div>
        <p class="subtle" style="margin:0;font-size:.875rem">רק את רואה אותה עכשיו. כשמנהל יאשר, היא תופיע לכל החברים ותקבלי מייל.</p>
        <div class="row"><span class="btn btn-ghost sm">עריכה</span><span class="btn btn-ghost sm">ביטול ההצעה</span></div>
      </li>
      <li class="ini-card">
        <div class="between"><span class="pend back-to">${I.back}חזרה אלייך עם הערה</span><span class="subtle" style="font-size:.8125rem">${b("14.11")}</span></div>
        <h3>ערב פיצה ומודלים פתוחים</h3>
        <blockquote class="admin-note"><b>מהמנהל:</b> אהבנו! חסר תאריך ומקום, ואז זה עולה.</blockquote>
        <div class="row"><span class="btn btn-primary sm">עריכה ושליחה שוב</span></div>
      </li>
    </ul>
  </section>
  <section style="display:grid;gap:1rem">
    <h2 class="sec">אני בפנים</h2>
    <ul class="ini-list two">${simpleCard(READ, { count: 9, need: "עוד מקום ל-1", fs: F.slice(0, 4), by: YOAV, joined: true })}</ul>
  </section>
  <div class="toast">${I.check}<span>נשלחה לאישור. נעדכן אותך במייל.</span></div>
</div>`;

const queueItem = (x, by, sent) => `
  <li class="ini-card">
    <div class="between"><span class="row"><span class="pend">${I.clock}ממתינה</span><span class="chip">${x.type}</span></span><span class="subtle" style="font-size:.8125rem">נשלחה ${sent}</span></div>
    <h3>${x.title}</h3>
    <p>${x.short}</p>
    <div class="meta"><span>${I.cal}${x.when}</span><span>${I.pin}${x.where}</span></div>
    <div class="between by">${L(by)}
      <span class="row"><span class="btn btn-primary sm">${I.check}אישור ופרסום</span><span class="btn btn-ghost sm">החזרה עם הערה</span><span class="btn btn-ghost sm" style="color:var(--fg-subtle)">דחייה</span></span></div>
  </li>`;

export const flowAdmin = `
<div class="ini" style="gap:1.5rem">
  <header style="display:grid;gap:.5rem"><div class="between"><h1 style="font-size:1.875rem">יוזמות</h1><span class="btn btn-primary sm">${I.plus}יוזמה חדשה</span></div>
    <p class="subtle" style="margin:0;font-size:.9375rem">יוזמה של מנהל עולה מיד. יוזמה של חבר מחכה כאן לאישור.</p></header>
  <nav class="filters" aria-label="סינון"><a aria-current="true">ממתינות לאישור · ${b("2")}</a><a>פורסמו · ${b("4")}</a><a>הוחזרו · ${b("1")}</a></nav>
  <ul class="ini-list">
    ${queueItem(HACK, DANA, `היום, ${ltr("10:42")}`)}
    ${queueItem(BOT, TAL, "אתמול")}
  </ul>
  <div class="ini-card" style="border-color:var(--border-accent)">
    <b style="color:var(--fg)">החזרה עם הערה</b>
    <label class="field">מה לשנות? <small>טל תקבל את ההערה במייל ובלשונית, ותוכל לערוך ולשלוח שוב.</small><span class="in area" style="min-height:4rem">כדאי להוסיף איפה נפגשים בפעם הראשונה.</span></label>
    <div class="row"><span class="btn btn-primary sm">שליחה לטל</span><span class="btn btn-ghost sm">ביטול</span></div>
  </div>
</div>`;
