import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { csvCell, parseCheckinTime, parseCsv, readLumaCsv } from "../../src/lib/attendance/luma-csv";

// Attendance from Luma's guest export (free check-in; no Luma API).
//  * CSV reading: pure, runs everywhere. The fixture is synthetic (example.test / club.test);
//    real exports never go in the repo (.gitignore: *luma*.csv, *guests*.csv).
//  * Guards: the export endpoint and the admin pages refuse guests; no Supabase needed.
//  * Matching, RLS and "non-members are never stored": scripts/rls-m2-attendance.mjs (db:check).
//  * The admin flow needs E2E_ADMIN_STATE (an admin storageState) and a dev Supabase.

const SAMPLE = readFileSync(path.join(__dirname, "fixtures", "attendance-sample.csv"), "utf8");

test.describe("reading Luma's guest export", () => {
  test("CSV: quotes, doubled quotes, CRLF, BOM, and ; or tab as the delimiter", () => {
    expect(parseCsv('﻿a,b\r\n"x, y","say ""hi"""\r\n\r\n')).toEqual([
      ["a", "b"],
      ["x, y", 'say "hi"'],
    ]);
    expect(parseCsv("a;b\n1;2")).toEqual([["a", "b"], ["1", "2"]]);
    expect(parseCsv("a\tb\n1\t2")).toEqual([["a", "b"], ["1", "2"]]);
    expect(parseCsv('a,b\n"multi\nline",2')).toEqual([["a", "b"], ["multi\nline", "2"]]);
  });

  test("the sample export: columns found, statuses counted, only email/going/check-in kept", () => {
    const csv = readLumaCsv(SAMPLE);
    expect(csv.error).toBeNull();
    expect(csv.columns).toEqual({ email: "email", name: "name", status: "approval_status", checkin: "checked_in_at" });
    expect(csv.total).toBe(7);
    expect(csv.statuses).toEqual({ approved: 5, declined: 1, waitlist: 1 });
    expect(csv.rows[0]).toEqual({ email: "alice@club.test", going: true, checked_in: true, checked_in_at: "2026-11-11T16:05:12.000Z" });
    expect(csv.rows[1]).toEqual({ email: "bob@club.test", going: true, checked_in: false, checked_in_at: null }); // lower-cased
    expect(csv.rows[2].checked_in_at).toBe("2026-11-11T16:20:00.000Z"); // no zone: UTC
    expect(csv.rows.filter((r) => r.going).length).toBe(5);
    // Nothing else from the file (names, phones, QR links) is in what goes to the server.
    expect(JSON.stringify(csv.rows)).not.toMatch(/Alice Member|972|qr|Stranger/);
    expect(Object.keys(csv.rows[0]).sort()).toEqual(["checked_in", "checked_in_at", "email", "going"]);
  });

  // 25.11: the shape of Luma's current Guests export (35 columns), exported before the session:
  // everyone "approved", no check-ins yet, Hebrew names, Apple private-relay emails, one row
  // without amount/currency. Synthetic copy of the shape only; no real guest is in it.
  test("Luma's 35-column Guests export, exported before the session", () => {
    const csv = readLumaCsv(readFileSync(path.join(__dirname, "fixtures", "attendance-approved-before.csv"), "utf8"));
    expect(csv.error).toBeNull();
    expect(csv.columns).toEqual({ email: "email", name: "name", status: "approval_status", checkin: "checked_in_at" });
    expect(csv.total).toBe(41);
    expect(csv.rows).toHaveLength(41);
    expect(csv.statuses).toEqual({ approved: 41 });
    expect(csv.rows.every((r) => r.going && !r.checked_in && r.checked_in_at === null)).toBe(true);
    expect(csv.rows.every((r) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(r.email))).toBe(true);
    expect(csv.rows.filter((r) => r.email.endsWith("@privaterelay.appleid.com")).length).toBeGreaterThan(0);
    expect(csv.rows[1].email).toBe("bob@club.test"); // lower-cased
    expect(JSON.stringify(csv.rows)).not.toMatch(/[֐-׿]|luma\.com|\$0/);
  });

  test("other header spellings, a yes/no check-in column, no status column", () => {
    const a = readLumaCsv("Name,Email Address,Registration Status,Check-in Time\nA,a@x.test,Going,2026-11-11 18:05\nB,b@x.test,Not Going,\n");
    expect(a.columns).toEqual({ email: "Email Address", name: "Name", status: "Registration Status", checkin: "Check-in Time" });
    expect(a.rows.map((r) => [r.going, r.checked_in])).toEqual([[true, true], [false, false]]);
    const b = readLumaCsv("email,checked_in\na@x.test,Yes\nb@x.test,No\n");
    expect(b.rows).toEqual([
      { email: "a@x.test", going: true, checked_in: true, checked_in_at: null },
      { email: "b@x.test", going: true, checked_in: false, checked_in_at: null },
    ]);
  });

  test("files that aren't a guest export are refused", () => {
    expect(readLumaCsv("").error).toBe("empty");
    expect(readLumaCsv("email\n").error).toBe("empty");
    expect(readLumaCsv("name,phone\nA,1\n").error).toBe("no_email");
  });

  test("check-in times and export cells", () => {
    expect(parseCheckinTime("2026-11-11T16:05:00+02:00")).toBe("2026-11-11T14:05:00.000Z");
    expect(parseCheckinTime("2026-11-11 16:05 UTC")).toBe("2026-11-11T16:05:00.000Z");
    expect(parseCheckinTime("Nov 11, 4pm")).toBeNull();
    expect(csvCell('a "b", c')).toBe('"a ""b"", c"');
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell(null)).toBe("");
  });
});

test.describe("attendance is admin-only", () => {
  test("the export refuses guests and forged cookies", async ({ request }) => {
    const url = "/api/admin/attendance?cohort=00000000-0000-4000-8000-000000000001";
    const guest = await request.get(url);
    expect(guest.status()).toBe(403);
    expect(guest.headers()["cache-control"]).toContain("no-store");
    expect(await guest.text()).not.toContain(",");
    const forged = await request.get(url, { headers: { cookie: "sb-abcdefgh-auth-token=base64-eyJmYWtlIjp0cnVlfQ" } });
    expect(forged.status()).toBe(403);
  });

  test("the attendance pages redirect guests to sign-in", async ({ page }) => {
    await page.goto("/en/admin/attendance");
    await expect(page).toHaveURL(/\/en\/login\?next=%2Fadmin%2Fattendance/);
    await expect(page.getByTestId("attendance-grid")).toHaveCount(0);
    await page.goto("/admin/attendance/00000000-0000-4000-8000-000000000001");
    await expect(page).toHaveURL(/\/login\?next=/);
  });
});

test.describe("attendance as an admin", () => {
  test.skip(!process.env.E2E_ADMIN_STATE, "needs E2E_ADMIN_STATE (admin storageState) and a dev Supabase");
  test.use({ storageState: process.env.E2E_ADMIN_STATE });

  test("upload the export on an event → preview with counts and columns; discard saves nothing", async ({ page }) => {
    await page.goto("/en/admin/events");
    await page.locator('a[href*="/admin/events/"]:not([href$="/new"])').first().click();
    const panel = page.getByTestId("attendance-panel");
    await expect(panel).toBeVisible();
    await panel.getByTestId("attendance-file").setInputFiles(path.join(__dirname, "fixtures", "attendance-sample.csv"));
    const preview = panel.getByTestId("attendance-preview");
    await expect(preview).toBeVisible();
    await expect(preview.getByTestId("preview-columns")).toContainText("approval_status");
    await expect(preview.getByTestId("preview-columns")).toContainText("checked_in_at");
    await expect(preview.getByTestId("preview-guests")).toBeVisible();
    await preview.getByRole("button", { name: "Discard" }).click();
    await expect(preview).toHaveCount(0);
  });

  test("the season grid and the CSV export", async ({ page }) => {
    await page.goto("/en/admin/attendance");
    await expect(page.getByRole("heading", { name: "Attendance" })).toBeVisible();
    const res = await page.request.get((await page.getByTestId("attendance-export").getAttribute("href"))!);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("text/csv");
    const body = await res.text();
    expect(body).toContain("member,");
    expect(body).not.toMatch(/@/); // names and statuses only, never emails
  });
});
