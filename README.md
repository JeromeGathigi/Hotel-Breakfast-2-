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
| Staff | a verified `@accor.com` Google account, or a `role: staff` claim | **Door**: Check-in, Floor plan (seating, clearing, merging). At Novotel, **Food Exchange**: Orders, Kitchen, Menu, and marking a dish sold out |
| Manager | `role: manager` claim | + **Management**: In-house manifest, Meal forecast, Breakfast analytics, Food Exchange sales (Novotel), and their CSV exports. **Administration**: Opera import, Settings. Editing the floor plan. On a bill: discounts, comps, removing a payment, voiding a dish already served, reopening a closed bill |
| Admin | `role: admin` claim, or an owner account in `src/lib/access.ts` | + Settings → Data maintenance |

Since 8 Oct 2026, by the owner's decision, managers do the Opera import and keep the floor plan
(administrators only before), and anyone at the door can mark a dish sold out (managers only
before); every sold-out change is written to the audit log. Until the matching `firestore.rules`
is published (FIREBASE_SETUP.md section 1), the database still refuses those three to the newly
allowed roles.

`firestore.rules` enforces the same roles; hiding a screen is not the protection.
`src/lib/access.test.ts` fails if the app and the rules drift apart. Claims are set with
`scripts/setClaims.ts`.

The sidebar is defined once, in `src/navigation.ts`, and `src/navigation.test.ts` pins down what
each role sees at each property. On phones and upright tablets the sidebar sits behind a menu
button. The screen is in the address (`…/#kitchen`), so a kitchen display can be bookmarked, and
each device remembers which property it works for. `/dev/shell-preview.html` shows the frame for
any role without signing in.

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
  (`FX-001`). Items the kitchen has seen are voided with a reason, never deleted - a dish already
  served only by a manager, since taking it off the bill is a comp - and every action is kept on
  the order with who did it.
- **Kitchen** - everything sent and not yet served, oldest first, with how long it has waited.
  The cook taps **Ready** when a dish is up; the order shows it as ready to serve, and tickets that
  are all up wait in green until carried out. An optional chime sounds for each new ticket, and
  the kitchen marks dishes sold out from here.
- **Payments** can be split equally between the guests left to pay; the last pays the odd satang.
- **Count drawer** (Orders, any host) - the float plus the day's cash payments against what is in
  the drawer, by notes and coins or as one total; a difference must be explained, and a recount is
  another record. Bills still open from earlier days are flagged on Orders.
- **Sales** (managers) - revenue, covers, service charge and VAT, discounts and comps, payment
  mix, items, hours, the drawer counts, the room charges to post to Opera, and per person the
  bills they closed and the voids, discounts, comps and cancellations they made; CSV and print.

Prices are the menu's net prices; bills add 10% service charge, then 7% VAT on the total. Bills
and kitchen tickets print through the browser at 80 mm. Not included: guest QR self-ordering,
online payments, delivery partners, printer pairing and posting to Opera - room charges are
listed for the front office to post. Orders need the network: offline, nothing changes and the
host is told so.

## Bookings

Reservations and a waiting list for both restaurants (**Door → Bookings**, every host): a booking
for a time, a party size and a meal service, under a name or an in-house room, with notes and an
optional table; a warning when one table is booked twice within a sitting; late arrivals flagged
after 15 minutes; booked covers by half hour. Walk-ins go on the waiting list with the wait they
were told, and the list times them. Seating a party marks its table occupied on the floor plan;
no-shows and cancellations are recorded, never deleted, and any step can be put back. For
breakfast, the room is still checked in on Check-in, which is what counts the cover.

Try it without signing in at <http://localhost:3000/dev/bookings-preview.html>.

## Borrowed from open-source restaurant systems (8 Oct 2026)

All 1,868 repositories under GitHub's `restaurant-management` topic were listed and the 33
strongest read. About half are food-delivery apps and their clones; the rest are POS, menu, QR
ordering and reservation projects. Ideas borrowed (no code was copied - several are AGPL or GPL):
the kitchen's Ready stage and chime (URY Mosaic, FloCafe, POSR, Satisfecho), reservations and a
waiting list (TastyIgniter, OpenResto, Satisfecho, HotPlate), drawer counts and alerts for
unclosed bills (URY, POSR), equal-share payments (FloCafe), per-person voids and discounts (URY,
POSR), and kitchen-side sold-out marking (POSR, Satisfecho). Left out: guest QR ordering, online
payments and delivery (public write access, payment contracts, couriers), inventory and recipes
(no stock data), priced modifiers (the menu prints none), and a Thai interface (worth its own
project).

Try the orders without signing in at <http://localhost:3000/dev/orders-preview.html> (invented orders, in
memory).

## Each morning

1. Export from Opera, for each hotel: **Guests INH - By Room** (Delimited Data → Tab) and the
   **package forecast**.
2. In the app, **Opera import** (managers): import the guest list, then the forecast. Every import is
   previewed first. The wrong report or the wrong hotel is refused outright; anything unusual -
   yesterday's list, a list half the size of the last one, a file with no RESORT column - has to
   be ticked before the import runs.
3. Importing a guest list **replaces** the previous one: departed rooms leave the door, and the
   previous day's list and check-ins are archived as that day's summary, which is what Analytics
   reads. No scheduled job is needed.

The door shows a banner when its list is not today's, and a pop-up when Opera's forecast and the
list disagree by more than 5 covers or 10%, whichever is larger.

A correction made at the door can be undone from the room's card, and a room marked "not occupied"
by mistake can be put back from the banner listing them.

## Exports

Each CSV sits with the data it holds, for managers: the in-house list on **In-house manifest**,
the forecast on **Meal forecast**, the rooms to confirm on **Settings → Rate codes**, check-ins for
a range of days on **Breakfast analytics**, and orders and room charges on **Food Exchange
sales**. Cells that start like a formula are written as text.

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
| `guests/{room}` | today's in-house list | the import (managers) |
| `metadata/reports` | which file, when, by whom, its stats - drives the "not today's list" banner | the import, written last |
| `metadata/packages` | each reservation's packages, from the forecast | the import |
| `forecasts/{date}` | Opera's package forecast, per day | the import |
| `history/{date}` and `history/{date}/guests/{room}` | a day's summary and its archived list (no notes) | the next day's import |
| `checkins/{date}/rooms/{id}` | one per room per service; breakfast is `{room}`, other services `{room}~{service}` | the door |
| `overrides/{room}` | corrections made at the door; each applies to one reservation on one day | the door |
| `tables/{id}`, `layouts/{id}` | the floor plan and live occupancy | managers (plan), staff (occupancy only) |
| `auditLogs/{id}` | append-only, each entry written as its author; read by managers (Settings) | everyone |
| `orders/{date-seq}` | Food Exchange orders, with their items, payments and history; never deleted | staff (discounts, comps, removing a payment, voiding a served dish, reopening: managers) |
| `counters/orders-{date}` | the day's last order number | staff, in the same transaction as the order |
| `cashCounts/{date-time}` | drawer counts against the day's cash payments; never edited | any host, as themselves |
| `bookings/{id}` | reservations and the waiting list, each with its history; never deleted | any host, as themselves |
| `menuState/availability` | dishes marked sold out; each change also in the audit log | anyone at the door, as themselves |
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
