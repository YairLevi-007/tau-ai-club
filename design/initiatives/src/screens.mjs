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
const lead = (name, initials, role = "ראש המועדון", c = "") => `<div class="who">${av(initials, c)}<div><b>${name}</b><small>${role}</small></div></div>`;
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

/* =====================================================================
   OPTION 1 · "לוח מודעות": members only, a short post + one link out
   ===================================================================== */
const o1Card = (x, { isNew = false, posted, link }) => `
  <li class="ini-card${isNew ? " featured" : ""}">
    <div class="between"><span class="row">${isNew ? '<span class="chip solid">חדש</span>' : ""}<span class="chip">${x.type}</span></span>
      <span class="subtle" style="font-size:.8125rem">פורסם ${b(posted)}</span></div>
    <h3><a class="stretch" href="#">${x.title}</a></h3>
    <p>${x.short}</p>
    <div class="meta"><span>${I.cal}${x.when}</span><span>${I.pin}${x.where}</span></div>
    <div class="between" style="padding-top:.25rem">${lead(x.lead ?? "דנה כהן", x.li ?? "דכ")}
      <a class="btn btn-primary sm" style="position:relative;z-index:1" href="#">${link}${I.ext}</a></div>
  </li>`;

export const o1List = `
<div class="ini">
  ${head("אזור החברים", "יוזמות", "דברים שראשי המועדון מזמינים אתכם לעשות יחד. כל יוזמה מסבירה איך מצטרפים.")}
  <ul class="ini-list">
    ${o1Card(HACK, { isNew: true, posted: "17.11", link: "לטופס ההרשמה" })}
    ${o1Card({ ...READ, lead: "יואב מזרחי", li: "ימ" }, { posted: "12.11", link: "לקבוצת הוואטסאפ" })}
    ${o1Card(TEEN, { posted: "5.11", link: "לטופס ההרשמה" })}
  </ul>
</div>`;

export const o1Item = `
<div class="ini">
  <a class="back" href="#">${I.back}כל היוזמות</a>
  <div class="detail">
    <div class="grid" style="display:grid;gap:1.25rem">
      <div class="row"><span class="chip solid">חדש</span><span class="chip">${HACK.type}</span><span class="subtle" style="font-size:.8125rem">פורסם ${b("17.11")}</span></div>
      <h1>${HACK.title}</h1>
      <div class="meta" style="font-size:.9375rem"><span>${I.cal}${HACK.when}</span><span>${I.pin}${HACK.where}</span></div>
      <div class="prose">
        <p>${HACK.short}</p>
        <p>מתחלקים לצוותים של שלושה–ארבעה. אפשר להגיע עם צוות או לבד, ונמצא לכם צוות במקום. בסוף יום שישי כל צוות מציג חמש דקות, והסוכן הכי שימושי עולה לאוויר לכל הסטודנטים.</p>
        <h2>מה צריך להביא</h2>
        <ul><li>מחשב נייד ומטען</li><li>רעיון אחד שמציק לכם בקמפוס (לא חובה)</li></ul>
      </div>
    </div>
    <aside class="ini-card featured">
      <p class="eyebrow-he text-sm">איך מצטרפים</p>
      <a class="btn btn-primary" href="#" style="width:100%">לטופס ההרשמה${I.ext}</a>
      <p class="subtle" style="font-size:.8125rem;margin-top:-.25rem">נפתח בגוגל פורמס, מחוץ לאתר. ${HACK.until}.</p>
      <hr class="hr">
      <p class="eyebrow-he text-sm">מי מוביל</p>
      ${lead("דנה כהן", "דכ")}
    </aside>
  </div>
</div>`;

export const o1Post = `
<div style="display:grid;gap:2rem">
  <header style="display:grid;gap:.75rem"><div class="between">
    <div style="display:grid;gap:.25rem"><a class="back" href="#">${I.back}כל היוזמות</a><h1 style="margin:0;font-size:1.875rem;font-weight:800">יוזמה חדשה</h1></div>
  </div></header>
  <div class="ini post-grid">
    <form class="ini-card form">
      <label class="field">כותרת<span class="in focus">${HACK.title}</span></label>
      <label class="field">כותרת באנגלית <small>לא חובה. אם ריק, באתר האנגלי יופיע העברי.</small><span class="in" dir="ltr">Campus AI agents hackathon</span></label>
      <label class="field">סוג<span class="seg"><span class="on">האקתון</span><span>פרויקט</span><span>קבוצת לימוד</span><span>התנדבות</span><span>אחר</span></span></label>
      <label class="field">כמה מילים<span class="in area">${HACK.short}</span></label>
      <div class="two-col">
        <label class="field">מתי<span class="in">${HACK.when}</span></label>
        <label class="field">איפה<span class="in">${HACK.where}</span></label>
      </div>
      <label class="field">קישור להצטרפות <small>וואטסאפ, גוגל פורמס, לומה. החברים יוצאים מהאתר אליו.</small><span class="in mono" dir="ltr">forms.gle/…</span></label>
      <label class="field">טקסט הכפתור<span class="in">לטופס ההרשמה</span></label>
      <label class="field">מי מוביל<span class="in">דנה כהן</span></label>
      <div class="toggle">מוצג לחברים עכשיו<i></i></div>
      <div class="row"><span class="btn btn-primary">פרסום</span><span class="btn btn-ghost">שמירה בלי לפרסם</span></div>
    </form>
    <div><p class="preview-label">ככה זה ייראה בלשונית</p><ul class="ini-list">${o1Card(HACK, { isNew: true, posted: "היום", link: "לטופס ההרשמה" })}</ul></div>
  </div>
</div>`;

/* =====================================================================
   OPTION 2 · "אני בפנים": members only, join on the site, heads post from the tab
   ===================================================================== */
const F = [["נל", ""], ["אב", "b"], ["מש", "c"], ["רח", "d"], ["תג", "b"]];
const o2Card = (x, { joined = false, count, need, faces: fs = F.slice(1, 5), featured = false, full = false }) => `
  <li class="ini-card${featured ? " featured" : ""}">
    <div class="between"><span class="chip ${featured ? "purple" : ""}">${x.type}</span><span class="subtle" style="font-size:.8125rem">${x.until ?? ""}</span></div>
    <h3><a class="stretch" href="#">${x.title}</a></h3>
    <p>${x.short}</p>
    <div class="meta"><span>${I.cal}${x.when}</span><span>${I.pin}${x.where}</span></div>
    <div class="joinbar" style="position:relative;z-index:1">
      <span class="row">${faces(fs)}<span>${b(count)} בפנים${need ? ` · ${need}` : ""}</span></span>
      ${full ? '<span class="chip">מלא</span>' : joined ? `<span class="joined">${I.check}אני בפנים</span>` : '<span class="btn btn-primary sm">אני בפנים</span>'}
    </div>
  </li>`;

const o2ListBody = (opts = {}) => `
<div class="ini">
  ${head("אזור החברים", "יוזמות", "דברים שראשי המועדון מזמינים אתכם לעשות יחד. לוחצים \"אני בפנים\", והמוביל מעדכן אתכם.",
    opts.head ? `<span class="btn btn-primary sm">${I.plus}יוזמה חדשה</span>` : "")}
  <nav class="filters" aria-label="סינון"><a aria-current="true">הכל</a><a>האקתון</a><a>פרויקט</a><a>קבוצת לימוד</a><a>התנדבות</a><a>שלי</a></nav>
  <ul class="ini-list two">
    ${o2Card(HACK, { count: 23, need: "עוד מקום ל-17", featured: true, joined: opts.joined })}
    ${o2Card(READ, { count: 9, need: "עוד מקום ל-1", faces: F.slice(0, 4) })}
    ${o2Card(BOT, { count: 4, need: "מחפשים עוד 2", faces: F.slice(2, 5) })}
    ${o2Card(TEEN, { count: 6, full: true, faces: F.slice(0, 3) })}
  </ul>
</div>`;

export const o2List = o2ListBody({ head: true });

export const o2Item = `
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
      <div class="lead-only">
        <span class="t">${I.eye}רק המוביל רואה את זה</span>
        <div class="between"><b style="font-size:.9375rem">מי בפנים ${b("(23)")}</b><span class="btn btn-ghost sm">${I.copy}העתקת המיילים</span></div>
        <ul class="people">
          <li>${`<div class="who">${av("נל", "", "sm")}<b>נועה לוי</b></div>`}<span class="mono">היום</span></li>
          <li>${`<div class="who">${av("אב", "b", "sm")}<b>אביגיל בן שושן</b></div>`}<span class="mono">${b("18.11")}</span></li>
          <li>${`<div class="who">${av("מש", "c", "sm")}<b>מיכאל שגיא</b></div>`}<span class="mono">${b("18.11")}</span></li>
        </ul>
      </div>
    </div>
    <aside class="ini-card featured">
      <div class="spots"><div class="between"><b style="font-size:1.125rem">${b("23")} בפנים</b><span>מקום ל-${b("40")}</span></div><div class="bar"><i style="width:57%"></i></div></div>
      <span class="row">${faces(F)}<span class="muted" style="font-size:.875rem">ועוד ${b("18")}</span></span>
      <span class="joined" style="justify-content:center;width:100%">${I.check}אני בפנים</span>
      <a class="link" href="#" style="justify-content:center;min-height:2.75rem;color:var(--fg-subtle);font-weight:500">לא אוכל להגיע</a>
      <hr class="hr">
      <p class="eyebrow-he text-sm">מי מוביל</p>
      ${lead("דנה כהן", "דכ")}
    </aside>
  </div>
  <div class="toast">${I.check}<span>נרשמת. דנה תעדכן את כל מי שבפנים במייל.</span></div>
</div>`;

export const o2Post = o2ListBody({ head: true }) + `
<div class="scrim"></div>
<div class="sheet ini" role="dialog" aria-label="יוזמה חדשה">
  <span class="handle"></span>
  <h2>יוזמה חדשה</h2>
  <p class="subtle" style="margin:0 0 1rem;font-size:.875rem">מופיעה מיד בלשונית לכל החברים.</p>
  <div class="form">
    <label class="field">סוג<span class="seg"><span class="on">האקתון</span><span>פרויקט</span><span>קבוצת לימוד</span><span>התנדבות</span></span></label>
    <label class="field">כותרת<span class="in focus">${HACK.title}</span></label>
    <label class="field">כמה מילים<span class="in area" style="min-height:4.5rem">${HACK.short}</span></label>
    <div class="two-col">
      <label class="field">מתי<span class="in">${HACK.when}</span></label>
      <label class="field">כמה מקומות <small>ריק = בלי הגבלה</small><span class="in mono">40</span></label>
    </div>
  </div>
  <div class="foot"><span class="btn btn-primary">פרסום</span><span class="btn btn-ghost">ביטול</span></div>
</div>`;

/* =====================================================================
   OPTION 3 · "מה בונים במועדון": everyone sees it, members pick a role
   ===================================================================== */
const stage = (k) => ({ recruit: '<span class="stage recruit">מגייסים</span>', work: '<span class="stage work">בעבודה</span>', done: '<span class="stage done">הושלם</span>' })[k];
const o3Card = (x, { st, roles, result, guest = true, featured = false }) => `
  <li class="ini-card${featured ? " featured" : ""}${st === "done" ? " quiet" : ""}">
    <div class="between"><span class="row">${stage(st)}<span class="chip">${x.type}</span></span></div>
    <h3><a class="stretch" href="#">${x.title}</a></h3>
    <p>${x.short}</p>
    ${roles ? `<div class="row" style="gap:.375rem"><span class="subtle" style="font-size:.8125rem">מחפשים:</span>${roles.map((r) => `<span class="chip ok">${r}</span>`).join("")}</div>` : ""}
    <div class="between" style="padding-top:.25rem">${lead(x.lead ?? "יואב מזרחי", x.li ?? "ימ", "ראש המועדון", "b")}
      ${result ? `<a class="link" href="#" style="position:relative;z-index:1">לתוצאה${I.fwd}</a>` : `<span class="subtle" style="font-size:.875rem">${guest ? "" : ""}</span>`}</div>
  </li>`;

export const o3List = `
<div class="ini">
  ${head("מחזור 02", "יוזמות", "מה חברי המועדון בונים עכשיו. כל יוזמה מחפשת אנשים לתפקידים מסוימים. חברי המועדון מצטרפים מכאן.")}
  <nav class="filters" aria-label="סינון"><a aria-current="true">הכל</a><a>מגייסים</a><a>בעבודה</a><a>הושלמו</a></nav>
  <ul class="ini-list two">
    ${o3Card(BOT, { st: "recruit", roles: [`פיתוח ×${b("2")}`, "עיצוב", "כתיבה"], featured: true })}
    ${o3Card({ ...HACK, lead: "דנה כהן", li: "דכ" }, { st: "recruit", roles: ["צוותים", `מנטורים ×${b("3")}`] })}
    ${o3Card(READ, { st: "work" })}
    ${o3Card({ type: "פרויקט", title: "מדריך פרומפטים לסטודנטים", short: `עשרים פרומפטים שעובדים לסיכום, תרגול ומבחנים. נכתב על ידי ${b("6")} חברים, ומשמש כבר יותר מ-${b("1,200")} סטודנטים.`, lead: "דנה כהן", li: "דכ" }, { st: "done", result: true })}
  </ul>
  <div class="guest-join"><p class="muted" style="margin:0">רוצים להצטרף ליוזמה? רק חברי המועדון יכולים. ${'<a class="link" href="#" style="display:inline-flex;min-height:auto">כניסה לחברים</a>'}</p></div>
</div>`;

export const o3Item = `
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
      <p class="eyebrow-he text-sm">מה צריך</p>
      <ul class="roles">
        <li><div><b>פיתוח</b><div class="n">${b("1")} מתוך ${b("2")}</div></div><span class="row">${faces([["מש", "c"]])}<span class="btn btn-primary">אני על זה</span></span></li>
        <li><div><b>עיצוב</b><div class="n">${b("0")} מתוך ${b("1")}</div></div><span class="btn btn-primary">אני על זה</span></li>
        <li class="full"><div><b>כתיבה</b><div class="n">מלא</div></div>${faces([["אב", "b"]])}</li>
        <li><div><b>בדיקות</b><div class="n">כל מי שרוצה</div></div><span class="joined" style="height:2.5rem;font-size:.875rem">${I.check}אני על זה</span></li>
      </ul>
      <hr class="hr">
      <p class="eyebrow-he text-sm">מי מוביל</p>
      ${lead("יואב מזרחי", "ימ", "ראש המועדון", "b")}
    </aside>
  </div>
</div>`;

export const o3Post = `
<div style="display:grid;gap:2rem">
  <header style="display:grid;gap:.25rem"><a class="back" href="#">${I.back}כל היוזמות</a><h1 style="margin:0;font-size:1.875rem;font-weight:800">יוזמה חדשה</h1></header>
  <div class="ini post-grid">
    <form class="ini-card form">
      <label class="field">כותרת<span class="in">${BOT.title}</span></label>
      <label class="field">כותרת באנגלית <small>לא חובה</small><span class="in" dir="ltr">A bot for new students</span></label>
      <label class="field">כמה מילים<span class="in area">${BOT.short}</span></label>
      <label class="field">שלב<span class="seg"><span class="on">מגייסים</span><span>בעבודה</span><span>הושלם</span></span></label>
      <div class="field">תפקידים <small>כמה אנשים בכל תפקיד. ריק = כל מי שרוצה.</small>
        <div style="display:grid;gap:.5rem">
          <div class="role-edit"><span class="in">פיתוח</span><span class="in mono">2</span><span class="x">${I.x}</span></div>
          <div class="role-edit"><span class="in">עיצוב</span><span class="in mono">1</span><span class="x">${I.x}</span></div>
          <div class="role-edit"><span class="in">כתיבה</span><span class="in mono">1</span><span class="x">${I.x}</span></div>
          <div class="role-edit"><span class="in focus">בדיקות</span><span class="in ph">ריק</span><span class="x">${I.x}</span></div>
          <span class="btn btn-ghost sm" style="justify-self:start">${I.plus}עוד תפקיד</span>
        </div></div>
      <div class="two-col">
        <label class="field">מתי<span class="in">${BOT.when}</span></label>
        <label class="field">מי מוביל<span class="in">יואב מזרחי</span></label>
      </div>
      <label class="field">קישור לתוצאה <small>כשמסיימים: אתר, קוד, מסמך.</small><span class="in ph">יתווסף בסוף</span></label>
      <div class="toggle">גם אורחים רואים (בלי שמות החברים)<i></i></div>
      <div class="row"><span class="btn btn-primary">פרסום</span><span class="btn btn-ghost">שמירה בלי לפרסם</span></div>
    </form>
    <div><p class="preview-label">ככה זה ייראה בלשונית</p><ul class="ini-list">${o3Card(BOT, { st: "recruit", roles: [`פיתוח ×${b("2")}`, "עיצוב", "כתיבה", "בדיקות"], featured: true })}</ul></div>
  </div>
</div>`;
