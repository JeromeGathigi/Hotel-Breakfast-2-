# Hotel Breakfast 2

The breakfast door for **Novotel Chiang Mai Nimman Journeyhub** (Opera resort `HB4F8`) and
**ibis Chiang Mai** (`HB9U9`). A host types a room number at the restaurant door, sees whether
breakfast is included and for how many, and checks the guests in, optionally at a table. Managers
compare the morning with Opera's forecast and review the month.

React 19 + Vite + Tailwind 4 on Firebase (Google sign-in, Firestore). No server code: the app is
static hosting, and the Opera imports run in the browser or from `scripts/` with the Admin SDK.

## Who sees what

| Role | How someone gets it | Screens |
|---|---|---|
| Staff | a verified `@accor.com` Google account, or a `role: staff` claim | Check-in, Floor plan; at Novotel also the Food Exchange menu, Orders and Kitchen |
| Manager | `role: manager` claim | + In-house manifest, Meal forecast, Analytics, Sales (Novotel), Settings; discounts, comps, sold-out dishes, reopening a closed bill |
| Admin | `role: admin` claim, or an owner account in `src/lib/access.ts` | + Import & export, floor-plan editing, Settings → Data maintenance |

`firestore.rules` enforces the same roles; hiding a screen is not the protection.
`src/lib/access.test.ts` fails if the app and the rules drift apart. Claims are set with
`scripts/setClaims.ts`.

## How breakfast is decided

Opera's guest list has no meal-plan column. Each room is decided from the strongest evidence
available (`src/lib/entitlement.ts`):

1. a correction made at the door today, recorded with who made it;
2. Opera's package forecast for that reservation (`BF`, `BF350NET`, `BFCOMP`, ...; `MBREAK` and
   `MBUFF` are meeting packages, never breakfast covers);
3. a front-office note on the reservation ("RB", "BF", "room only", ...);
4. the property's own breakfast rate list (`src/lib/meals.ts`);
5. Accor's global rate referential (`src/lib/rateReferential.ts`).

What none of these settles is shown as **Check rate**. The door still lets the guest in, the room
is counted under "needs checking", and a pop-up lists the rate codes to confirm. Guests arriving
today are shown "Breakfast from tomorrow" and are not counted in this morning's expected covers.

Calibrated against Opera's own forecast for 2 Sep 2026: Novotel 99 covers against Opera's 98,
ibis 41 against 43.

## Food Exchange orders

A la carte ordering for the Food Exchange (lunch and dinner), modelled on the outlet's POS trial
and adapted to the hotel:

- **Orders** - open an order for a table, an in-house room or takeaway; add dishes from the menu
  with a note for the kitchen (allergies); send them; take payments - cash, card, QR, charged to an
  in-house room, or complimentary - split across methods; close. Order numbers restart daily
  (`FX-001`). Items the kitchen has seen are voided with a reason, never deleted, and every action
  is kept on the order with who did it.
- **Kitchen** - everything sent and not yet served, oldest first, with how long it has waited.
- **Sales** (managers) - revenue, covers, service charge and VAT, discounts and comps, payment
  mix, items, hours, staff, voids and cancellations, and the room charges to post to Opera; CSV
  and print.

Prices are the menu's net prices; bills add 10% service charge, then 7% VAT on the total. Bills
and kitchen tickets print through the browser at 80 mm. Not included: guest QR self-ordering,
online payments, delivery partners, printer pairing and posting to Opera - room charges are
listed for the front office to post. Orders need the network: offline, nothing changes and the
host is told so.

Try it without signing in at <http://localhost:3000/dev/orders-preview.html> (invented orders, in
memory).

## Each morning

1. Export from Opera, for each hotel: **Guests INH - By Room** (Delimited Data → Tab) and the
   **package forecast**.
2. In the app, **Import & export**: import the guest list, then the forecast. Every import is
   previewed first. The wrong report or the wrong hotel is refused outright; anything unusual -
   yesterday's list, a list half the size of the last one, a file with no RESORT column - has to
   be ticked before the import runs.
3. Importing a guest list **replaces** the previous one: departed rooms leave the door, and the
   previous day's list and check-ins are archived as that day's summary, which is what Analytics
   reads. No scheduled job is needed.

The door shows a banner when its list is not today's, and a pop-up when Opera's forecast and the
list disagree by more than 5 covers or 10%, whichever is larger.

Unattended alternative: `npm run opera:watch` imports whatever is dropped into `opera-incoming/`,
with the same checks; anything that would need a tick is moved to `opera-rejected/` with the
reason. It needs Admin credentials - see [FIREBASE_SETUP.md](FIREBASE_SETUP.md).

## Run it locally

```bash
npm install
```

```bash
npm run dev
```

The app opens on <http://localhost:3000>, bound to loopback only. Firebase settings come from
`firebase-applet-config.json`, or from `VITE_FIREBASE_*` variables (see `.env.example`).

To look at the door without signing in, open <http://localhost:3000/dev/door-preview.html>. It
renders the real door screen with twelve invented "PREVIEW GUEST" rooms held in memory, imports
nothing from Firebase, and is not part of the production build. Tests enforce both.

| Command | What it does |
|---|---|
| `npm test` | unit and guard tests (vitest) |
| `npm run lint` | TypeScript typecheck |
| `npm run build` | production build into `dist/` |

## Deploy

Rules, with the Firebase CLI (after `firebase login`):

```bash
firebase deploy --only firestore:rules
```

`firebase.json` names the database explicitly - this project has no `(default)` Firestore
database, and an unnamed rules deploy would go nowhere useful. The current `firestore.rules` was
published on 8 Oct 2026.

The app: `npm run build` produces `dist/`. Firebase Hosting is not available on this project's AI
Studio Starter Tier; the app staff open is published from Google AI Studio and Cloud Run (see
[FIREBASE_SETUP.md](FIREBASE_SETUP.md)), so a new version goes live only when that deployment is
updated from this code. Pushing to GitHub does not change it.

## Data

Firestore database `ai-studio-hotelbreakfast2-acad9cf6-2960-4fc6-9358-4df6deffdf81`, project
`polished-bonfire-cdtd0`. Everything lives under `hotels/{novotel|ibis}/`:

| Path | Holds | Written by |
|---|---|---|
| `guests/{room}` | today's in-house list | admin import |
| `metadata/reports` | which file, when, by whom, its stats - drives the "not today's list" banner | admin import, written last |
| `metadata/packages` | each reservation's packages, from the forecast | admin import |
| `forecasts/{date}` | Opera's package forecast, per day | admin import |
| `history/{date}` and `history/{date}/guests/{room}` | a day's summary and its archived list (no notes) | the next day's import |
| `checkins/{date}/rooms/{id}` | one per room per service; breakfast is `{room}`, other services `{room}~{service}` | the door |
| `overrides/{room}` | corrections made at the door; each applies to one reservation on one day | the door |
| `tables/{id}`, `layouts/{id}` | the floor plan and live occupancy | admin (plan), staff (occupancy only) |
| `auditLogs/{id}` | append-only, each entry written as its author | everyone |
| `orders/{date-seq}` | Food Exchange orders, with their items, payments and history; never deleted | staff (discounts, comps, reopening: managers) |
| `counters/orders-{date}` | the day's last order number | staff, in the same transaction as the order |
| `menuState/availability` | dishes marked sold out | managers |
| `daily_summaries/{date}` | synthetic data from retired code; remove it in Settings → Data maintenance | nobody |

The door keeps working through a Wi-Fi drop: Firestore's own offline cache holds the list, and
check-ins made offline are queued and sent when the connection returns. Signing out clears the
cache from the device.

## Scripts

All need Admin credentials; see [FIREBASE_SETUP.md](FIREBASE_SETUP.md).

| Command | What it does |
|---|---|
| `npm run opera:import -- <file or folder> [--hotel=novotel\|ibis] [--accept] [--dry-run]` | the app's import, from the command line |
| `npm run opera:watch` | runs that import on a folder, continuously |
| `npm run firebase:claims -- --list` | who has signed in, and their role |
| `npm run firebase:claims -- --email=<address> --role=staff\|manager\|admin\|none --apply` | grant or revoke a role |
| `npm run firebase:clear-junk -- --apply` | delete guest documents whose id is not a room number |

`opera-incoming/`, `opera-processed/` and `opera-rejected/` hold guest names and are git-ignored.
