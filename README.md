# BunkerWatch

Competitor Barge Intelligence. From IMO Numbers to Vessel-Level Supply Activity.

BunkerWatch turns the manual "check 30 competitor barge IMOs one at a time"
workflow into: track competitors → import authorised STS data → filter by
date/competitor/operation → see every vessel supplied.

The app runs on **local demo data out of the box** — no backend required —
and switches to a real Supabase project the moment you set two environment
variables. No credentials are ever hardcoded.

---

## 1. Local development

```bash
npm install
npm run dev
```

Opens on `http://localhost:5173`. With no `.env` file, it runs entirely on
generated demo data (persisted to your browser's localStorage) — a small
**DEMO DATA** badge appears in the sidebar so it's never confused with real
imported data.

---

## 2. Provisioning a real Supabase project

I can't create a live Supabase project on your behalf — that has to happen
in your own Supabase account. It takes about five minutes:

1. Go to https://supabase.com/dashboard and create a new project (choose a
   region close to you, e.g. `me-central-1` or `ap-south-1`).
2. Once it's provisioned, open **SQL Editor** and run the entire contents of
   [`supabase/schema.sql`](./supabase/schema.sql). This creates every table,
   index, and Row Level Security policy from the spec in one pass.
3. Create your organization and your own user profile row:
   ```sql
   insert into organizations (id, name) values (gen_random_uuid(), 'Your Company') returning id;
   -- copy the returned id, then:
   insert into user_profiles (id, organization_id, full_name, role)
   values (auth.uid(), '<org id from above>', 'Your Name', 'ADMIN');
   ```
   (Run the second statement while logged in via Supabase Auth, or substitute
   a real `auth.users.id` if inserting manually.)
4. In **Project Settings → API**, copy the **Project URL** and **anon public
   key**.
5. Copy `.env.example` to `.env` and paste them in:
   ```
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJ...
   ```
6. Restart `npm run dev`. The sidebar badge disappears and the app now reads
   and writes through `SupabaseDataProvider` against your real project —
   every page is unchanged, since no page talks to Supabase directly (see
   `src/services/data/DataProvider.ts`).

Never commit `.env` — it's already in `.gitignore`.

---

## 3. Deploying to Cloudflare Pages

```bash
npm run build
```

Then in the Cloudflare dashboard: **Pages → Create project → connect your
repo**, with build command `npm run build` and output directory `dist`. Add
`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as **Environment Variables**
in the Pages project settings (not in the repo) so production reads from
your live project.

---

## 4. CSV / XLSX import format

The importer auto-detects columns by header name and lets you remap any of
them manually before import. Recognised header aliases:

| Internal field | Accepted headers |
|---|---|
| Barge IMO | `IMO`, `Barge IMO`, `Barge` |
| Barge Name | `Barge Name`, `Barge` |
| Receiving Vessel | `Vessel`, `Vessel Name`, `Receiving Vessel`, `Receiving Vessel Name` |
| Receiving IMO | `Receiving IMO`, `Receiving Vessel IMO` |
| Operation | `Operation`, `Operation Type` |
| Date | `Date`, `Operation Date` |
| Start / End | `Start`, `Start Time`, `End`, `End Time` |
| Location | `Location`, `Area` |
| Lat / Lng | `Latitude`, `Lat`, `Longitude`, `Lon`, `Lng` |

A row is rejected (not silently modified) if its barge IMO fails check-digit
validation, doesn't match a barge you've already added under **Barges**, or
is missing a date or receiving vessel. Rejected rows are listed with the
specific reason in the import preview. Duplicate detection uses
`source_provider` + `source_record_id` when available, otherwise a
fingerprint of barge IMO + date + operation + receiving vessel + location +
start time (see `src/lib/fingerprint.ts`) — never vessel name alone.

Unrecognised operation-type labels are classified as `OTHER_STS` rather than
guessed into Bunkering or Supply (`src/lib/normalizeOperation.ts`).

---

## 5. Data provider architecture

```
MaritimeDataProvider (interface, src/services/data/DataProvider.ts)
    ├── DemoDataProvider       — in-memory/localStorage, used with no env vars set
    └── SupabaseDataProvider   — real Postgres via supabase-js
```

Every page calls `getDataProvider()` — never a concrete class — so a future
`AuthorisedMaritimeApiProvider` (an official S&P/AIS feed, once you have a
licensed connection) can be dropped in without touching any page. This app
never scrapes or reverse-engineers a third-party platform; import CSV/XLSX
exports here, or wire up an authorised API later.

---

## 6. Tests

```bash
npm test
```

Test files live in `src/lib/__tests__/`, covering IMO check-digit
validation, operation-type normalization, date-range inclusivity, and
duplicate fingerprinting — the logic most likely to silently corrupt
competitive analysis if it regresses.

---

## 7. Automatic STS detection from live AIS (optional)

The frontend's **Live Map** page shows live barge positions in-browser once
you enter an AISStream.io key there — that part needs nothing extra.

Turning that into automatic, historical STS detection — the kind that
populates **Competitor Analysis** without manual CSV imports — needs three
things running together, not just an API key:

1. An [AISStream.io](https://aisstream.io) API key (free)
2. A real Supabase project (see section 2 above — this can't run on demo mode)
3. **[`worker/`](./worker)** — a standalone, always-on Node service that
   watches AIS 24/7 and writes detected candidate events into Supabase.
   See `worker/README.md` for what it detects, its limits, and how to
   deploy it somewhere that stays running (Railway, Render, Fly.io, or a
   VPS — not Cloudflare Pages or GitHub Actions, which don't support
   long-lived processes).

Detected events land with `confidence: medium` and are labelled as
AIS-inferred, not asserted as confirmed bunkering — AIS carries no cargo
information, so proximity + stillness is a strong signal, not proof.

---

## 8. Production checklist

- [ ] Real Supabase project provisioned and `schema.sql` applied
- [ ] `.env` set with production Supabase URL/key (Cloudflare Pages env vars, not committed)
- [ ] At least one `ADMIN` user profile created
- [ ] Competitors and barge IMOs entered under **Fleet**
- [ ] First authorised CSV/XLSX import completed and reviewed under **Data Quality**
- [ ] Confirm demo-mode badge is gone in production
- [ ] RLS verified: a second organization's user cannot see your data




---

## 6. Live Map (real-time AIS) — $0 stack

`/live-map` shows every AIS-broadcasting vessel in the Fujairah / Khor Fakkan
bounding box, refreshed every 10 seconds. Tracked barges are drawn larger,
in their competitor's colour, and listed in the side panel; everything else
is coloured by AIS ship type (tanker, cargo, tug/service, other) and can be
toggled. Vessels silent for more than 2 hours drop off the map.

Everything runs on free tiers: AISStream (data), Supabase free (database),
GitHub Actions on this public repo (worker, unlimited minutes), GitHub
Pages (frontend).

Setup, in order:

1. **Database** – run `supabase/migration_live_positions.sql` in the SQL
   Editor (after `schema.sql`). It creates `vessel_positions` (latest fix per
   MMSI), `vessel_position_history` (90-day track points) and read-only RLS.
   The map polls instead of using Realtime, so it stays inside free-tier quotas.
2. **Worker** – `.github/workflows/ais-live.yml` runs the always-on worker as
   a chain of ~5h40m GitHub Actions jobs, each dispatching the next. It uses
   the same three repository secrets as the old poller. Start it once from
   the Actions tab (**AIS Live Worker → Run workflow**); after that it keeps
   itself running. Check a run's log for `[positions] upserted N vessels` —
   if `N` stays 0, AISStream is delivering no data (see the note in
   `worker/README.md`). The old 15-minute poller is now manual-only.
   If you'd rather not run it on Actions, `worker/deploy/oracle-free-vm.md`
   describes the free Oracle Cloud VM alternative.
3. **Frontend** – nothing extra; the page reads through the existing
   `VITE_SUPABASE_*` config. Without it, the page shows a "Demo mode" chip.

History is pruned at 90 days by `prune_vessel_position_history()` —
schedule it with pg_cron (see the comment at the bottom of the migration).
