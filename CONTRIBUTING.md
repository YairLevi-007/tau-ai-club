# Contributing to the TAU AI Club site

Thanks for helping. This is the public code of the club's website. Every change comes in as a pull
request, and the club decides whether to merge it. There is no promise that a pull request is merged,
so for anything big, open an issue first and ask.

## Run the site on your computer

You need [Node.js](https://nodejs.org) 24 and [pnpm](https://pnpm.io). No account, no keys and no
`.env` file are needed: the site runs on fake season data that is already in the repo.

```bash
pnpm install
pnpm dev:fixtures
```

Open <http://localhost:3000> (Hebrew, the default) or <http://localhost:3000/en> (English).
The members area and sign-in are switched off locally; that is normal.

## Run the checks

Do this before you open a pull request. It is the same thing GitHub runs.

```bash
pnpm exec playwright install chromium   # once, downloads the test browser
node tests/run-all.mjs
```

That runs the database checks, ESLint, TypeScript, then the browser tests. It takes several minutes,
stops at the first failure and ends with one line: `ALL PASSED` or `FAILED at <step>`. Logs are in
`node_modules/.cache/run-all/`. To run only some steps: `node tests/run-all.mjs --only=db,tsc,eslint`
(names: `db`, `tsc`, `eslint`, `m1`, `m2`, `m3`). If you changed anything under `supabase/`,
run `pnpm db:check` too.

## Open a pull request

1. Fork the repository on GitHub and create a branch (`fix/short-name` or `feat/short-name`).
2. Make one change per pull request, and keep it small. Say what you changed and why.
3. Run the checks above.
4. Push your branch and open a pull request against `main`. GitHub then runs the checks and shows pass or fail
   on the page. The first time you contribute, a maintainer has to click "Approve and run" before they start.
5. A maintainer reviews it. Please reply to comments on the pull request.

## Rules of the house

- **Never commit secrets or real member data** (keys, `.env` files, names, emails, phone numbers). The site needs none to run.
- **Read `docs/DECISIONS.md`.** It lists what the club already decided (design, who sees what, how sign-in works).
  A pull request that goes against it will not be merged.
- **Hebrew and English.** Interface text lives in `messages/he.json` and `messages/en.json`; add every key to both. Club content (events, speakers) lives in the database, not in components.
- **Right-to-left.** Use logical CSS (`ms-`, `me-`, `ps-`, `pe-`, `start-`, `text-start`), never `ml-`, `mr-`, `left-` or `right-`.
- **Design.** Colours and fonts come from `src/app/tokens.css` through Tailwind names. No raw hex values in components, and the brand tokens are frozen.
- **No paid services or AI APIs** on the site.
- More background is in `CLAUDE.md` (conventions) and `docs/PLAN.md`.
