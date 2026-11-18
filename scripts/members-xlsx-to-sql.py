"""Club member list (.xlsx) -> SQL that loads members, the allowlist and prefilled profiles.

    python scripts/members-xlsx-to-sql.py <members.xlsx> <out.sql> [--fix-typos]

The sheet's header row is found automatically (the row with "מייל"); expected columns:
    # | תפקיד | שם | טלפון | מייל | מגדר | פקולטה | חוג / תוכנית | שנה | לינקדאין
תפקיד "מנהל/ת" -> admin, anything else -> member. Gender is ignored.

The SQL is idempotent: run it in Supabase -> SQL Editor (as postgres). Per row it
  * adds the member + primary email, or updates the name/role of an existing email;
  * prefills the profile (faculty, program, year, LinkedIn) without overwriting anything
    the member already filled in;
  * stores phone + contact email (= the list email) in member_contacts with BOTH
    "show to other members" toggles OFF, again without overwriting the member's choices.

PRIVACY: the output holds real names, emails and phones. It must never be written inside
this repository (the script refuses), committed, or pasted anywhere public. The report
printed at the end names rows by number and problem only, never their personal data.
Standard library only (no openpyxl needed).
"""
import os
import re
import sys
import urllib.parse
import zipfile
import xml.etree.ElementTree as ET

NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
REL = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
PHONE_RE = re.compile(r"^\+?[0-9][0-9 ()-]{5,22}$")
LINKEDIN_RE = re.compile(r"^https://([a-z]{2,3}\.)?linkedin\.com/[A-Za-z0-9_/%.-]+$")
KNOWN_DOMAINS = {"gmail.com", "mail.tau.ac.il", "tau.ac.il", "post.tau.ac.il", "outlook.com", "hotmail.com", "yahoo.com", "icloud.com", "walla.co.il"}
TYPO_DOMAINS = {
    "gmal.com": "gmail.com", "gmial.com": "gmail.com", "gamil.com": "gmail.com", "gmai.com": "gmail.com",
    "gmail.co": "gmail.com", "gmail.con": "gmail.com", "gnail.com": "gmail.com", "gmaill.com": "gmail.com",
    "mail.tau.ac": "mail.tau.ac.il", "mail.tau.il": "mail.tau.ac.il", "mail.tau.ac.li": "mail.tau.ac.il",
}
HEBREW_YEARS = {"א": 1, "ב": 2, "ג": 3, "ד": 4, "ה": 5, "ו": 6}


def col_index(ref):
    letters = re.match(r"[A-Z]+", ref).group(0)
    n = 0
    for ch in letters:
        n = n * 26 + (ord(ch) - 64)
    return n - 1


def read_first_sheet(path):
    with zipfile.ZipFile(path) as z:
        shared = []
        if "xl/sharedStrings.xml" in z.namelist():
            root = ET.fromstring(z.read("xl/sharedStrings.xml"))
            for si in root.findall("m:si", NS):
                shared.append("".join(t.text or "" for t in si.iter(f"{{{NS['m']}}}t")))
        wb = ET.fromstring(z.read("xl/workbook.xml"))
        first = wb.find("m:sheets/m:sheet", NS)
        rels = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
        target = next(r.get("Target") for r in rels if r.get("Id") == first.get(REL))
        target = target.lstrip("/")
        sheet_path = target if target.startswith("xl/") else f"xl/{target}"
        root = ET.fromstring(z.read(sheet_path))
    rows = []
    for row in root.iter(f"{{{NS['m']}}}row"):
        cells = {}
        for c in row.findall("m:c", NS):
            t = c.get("t")
            v = c.find("m:v", NS)
            if t == "s" and v is not None:
                val = shared[int(v.text)]
            elif t == "inlineStr":
                val = "".join(x.text or "" for x in c.iter(f"{{{NS['m']}}}t"))
            else:
                val = v.text if v is not None else None
            cells[col_index(c.get("r"))] = val
        width = max(cells) + 1 if cells else 0
        rows.append((int(row.get("r")), [cells.get(i) for i in range(width)]))
    return rows


def clean(v):
    if v is None:
        return ""
    # Invisible characters that sneak in from copy-paste (zero-width, bidi marks, BOM).
    s = re.sub(r"[\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]", "", str(v)).strip()
    # Numbers stored as floats ("5.0") from Excel.
    if re.fullmatch(r"\d+\.0", s):
        s = s[:-2]
    return re.sub(r"\s+", " ", s)


def sql(v):
    if v is None or v == "":
        return "null"
    if isinstance(v, int):
        return str(v)
    return "'" + str(v).replace("'", "''") + "'"


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    fix_typos = "--fix-typos" in sys.argv
    if len(args) != 2:
        print(__doc__)
        sys.exit(2)
    src, out = args
    repo = os.path.realpath(os.path.join(os.path.dirname(__file__), ".."))
    if os.path.realpath(out).startswith(repo + os.sep):
        sys.exit("Refusing to write member data inside the repository. Write it to tau-ai-club-private/.")

    rows = read_first_sheet(src)
    header_at = next((i for i, (_, r) in enumerate(rows) if any(clean(c) == "מייל" for c in r)), None)
    if header_at is None:
        sys.exit('No header row with "מייל" found.')
    header = [clean(c) for c in rows[header_at][1]]
    col = {name: header.index(name) for name in header if name}
    need = ["תפקיד", "שם", "טלפון", "מייל", "פקולטה", "חוג / תוכנית", "שנה", "לינקדאין"]
    missing = [n for n in need if n not in col]
    if missing:
        sys.exit(f"Missing columns: {missing}")

    people, flags, seen = [], [], {}
    for rownum, r in rows[header_at + 1:]:
        get = lambda name: clean(r[col[name]]) if col[name] < len(r) else ""
        email, name = get("מייל").lower(), get("שם")
        if not email and not name:
            continue
        if not name:
            flags.append((rownum, "skipped: no name"))
            continue
        if not EMAIL_RE.match(email) or len(email) > 254:
            flags.append((rownum, "skipped: email missing or not a valid address"))
            continue
        domain = email.split("@", 1)[1]
        if domain in TYPO_DOMAINS:
            if fix_typos:
                email = email.split("@", 1)[0] + "@" + TYPO_DOMAINS[domain]
                flags.append((rownum, f"email domain '{domain}' corrected to '{TYPO_DOMAINS[domain]}' (--fix-typos)"))
            else:
                flags.append((rownum, f"email domain '{domain}' looks like a typo of '{TYPO_DOMAINS[domain]}' (kept as is; no code can reach it)"))
        elif domain not in KNOWN_DOMAINS:
            flags.append((rownum, f"unusual email domain '{domain}' (check it)"))
        if email in seen:
            flags.append((rownum, f"skipped: same email as row {seen[email]}"))
            continue
        seen[email] = rownum

        role = "admin" if "מנהל" in get("תפקיד") else "member"

        phone = get("טלפון")
        if phone and not PHONE_RE.match(phone):
            flags.append((rownum, "phone not in a valid format (left empty)"))
            phone = ""

        year_raw = get("שנה")
        year = None
        m = re.fullmatch(r"(?:שנה\s*)?([א-ו])['׳]?", year_raw)
        if m:
            year = HEBREW_YEARS[m.group(1)]
        elif re.fullmatch(r"(?:שנה\s*)?([1-9]|10)", year_raw):
            year = int(re.search(r"\d+", year_raw).group(0))
        elif year_raw:
            flags.append((rownum, f"year '{year_raw}' isn't a year of study 1-10 (left empty)"))

        li = get("לינקדאין")
        if li:
            li = re.sub(r"\s+", "", li)
            li = re.sub(r"[?#].*$", "", li)
            if not re.match(r"^https?://", li):
                li = "https://" + li
            li = re.sub(r"^http://", "https://", li)
            li = re.sub(r"^https://(?:[a-z]{2,3}\.)?linkedin\.com", "https://www.linkedin.com", li, flags=re.I)
            # Hebrew (non-ASCII) profile slugs: percent-encode, as LinkedIn itself does.
            li = urllib.parse.quote(li, safe=":/-_.%")
            if not LINKEDIN_RE.match(li) or len(li) > 200:
                flags.append((rownum, "LinkedIn isn't a linkedin.com profile URL the site accepts (left empty)"))
                li = ""

        people.append({
            "email": email, "name": name[:120], "role": role,
            "faculty": get("פקולטה")[:120], "program": get("חוג / תוכנית")[:160],
            "year": year, "linkedin": li, "phone": phone,
        })

    values = ",\n".join(
        "  (" + ", ".join([sql(p["email"]), sql(p["name"]), sql(p["role"]), sql(p["faculty"]), sql(p["program"]),
                         sql(p["year"]), sql(p["linkedin"]), sql(p["phone"])]) + ")"
        for p in people
    )
    script = f"""-- GENERATED by scripts/members-xlsx-to-sql.py. Contains personal data: keep it private,
-- never commit it. Run in Supabase -> SQL Editor. Safe to run again (idempotent).
begin;

create temp table import_rows (
  email text, full_name text, role text, faculty text, program text,
  year smallint, linkedin text, phone text
) on commit drop;

insert into import_rows (email, full_name, role, faculty, program, year, linkedin, phone) values
{values};

do $$
declare
  r        record;
  v_member uuid;
  n_new    int := 0;
  n_upd    int := 0;
begin
  for r in select * from import_rows loop
    select me.member_id into v_member
      from public.member_emails me where me.email = r.email::extensions.citext;
    if v_member is null then
      insert into public.members (full_name, role) values (r.full_name, r.role::public.member_role)
        returning id into v_member;
      insert into public.member_emails (email, member_id, is_primary)
        values (r.email::extensions.citext, v_member, true);
      n_new := n_new + 1;
    else
      update public.members m set full_name = r.full_name, role = r.role::public.member_role
        where m.id = v_member;
      n_upd := n_upd + 1;
    end if;

    -- Prefill; never overwrite what the member already filled in.
    insert into public.profiles as p (member_id, faculty, program, year, links)
    values (v_member, nullif(r.faculty, ''), nullif(r.program, ''), r.year,
            case when coalesce(r.linkedin, '') = '' then '{{}}'::jsonb
                 else jsonb_build_object('linkedin', r.linkedin) end)
    on conflict (member_id) do update set
      faculty = coalesce(p.faculty, excluded.faculty),
      program = coalesce(p.program, excluded.program),
      year    = coalesce(p.year, excluded.year),
      links   = case when p.links ? 'linkedin' then p.links else p.links || excluded.links end;

    -- Contact details: both "show to other members" toggles OFF. Never overwrite the member's own.
    insert into public.member_contacts (member_id, phone, contact_email, share_phone, share_email)
    values (v_member, nullif(r.phone, ''), r.email::extensions.citext, false, false)
    on conflict (member_id) do nothing;
  end loop;
  raise notice 'members: % new, % updated', n_new, n_upd;
end;
$$;

commit;

select
  (select count(*) from public.members) as members,
  (select count(*) from public.members where role = 'admin') as admins,
  (select count(*) from public.member_emails) as allowlisted_emails,
  (select count(*) from public.member_contacts) as contact_rows;
"""
    with open(out, "w", encoding="utf-8", newline="\n") as f:
        f.write(script)

    sys.stdout.reconfigure(encoding="utf-8")
    admins = sum(1 for p in people if p["role"] == "admin")
    print(f"wrote {out}")
    print(f"rows: {len(people)} ({admins} admin, {len(people) - admins} member)")
    print(f"with phone: {sum(1 for p in people if p['phone'])}, LinkedIn: {sum(1 for p in people if p['linkedin'])}, "
          f"year: {sum(1 for p in people if p['year'])}, program: {sum(1 for p in people if p['program'])}")
    print("flags (sheet row number: problem):" if flags else "flags: none")
    for rownum, msg in flags:
        print(f"  row {rownum}: {msg}")


if __name__ == "__main__":
    main()
