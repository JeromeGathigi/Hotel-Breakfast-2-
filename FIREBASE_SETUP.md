# Firebase: current state, and what only the owner can do

Updated 8 Oct 2026. The "verified" items were read in the Firebase console. The only change made
there was publishing the rules, on the owner's instruction (section 1).

## Verified on 7-8 Oct 2026

| | |
|---|---|
| Project | `polished-bonfire-cdtd0`, an **AI Studio Starter Tier** project |
| Database the app uses | `ai-studio-hotelbreakfast2-acad9cf6-2960-4fc6-9358-4df6deffdf81` (named; there is no `(default)` database) |
| Deployed rules | **this repo's `firestore.rules`**, published 8 Oct 2026 through the console (the previous version is kept in its history) |
| Firebase Hosting | **not available** on the Starter Tier ("This product is not available as part of this Starter Tier project") |
| Where the app is served | Google AI Studio (`hotel-breakfast-2testv1.ai.studio`) and Cloud Run (`hotel-breakfast-2-882757139093.asia-southeast1.run.app`), per Authentication → Settings → Authorized domains |
| Scheduled backups | disabled |

What is in production today is junk and test data, not a working day:

| Where | What |
|---|---|
| `hotels/novotel/guests` | 8 documents keyed by room **types** (`KGAGS`, `KGB`, ..., `UNASSIGNED`) from a forecast imported as a guest list on 31 Aug |
| `hotels/*/forecasts` | 34 documents from the old forecast parser, which over-counted |
| `hotels/*/checkins` | 1 check-in that Data maintenance flags as junk |
| `hotels/*/metadata/reports` | both hotels stamped with that same 31 Aug forecast file |
| `hotels/*/tables` | 36 default tables |
| `hotels/*/auditLogs` | 16 entries, all by the owner |

## 1. Rules: published 8 Oct 2026, twice - and seven changes since, NOT yet published

The console still holds the 09:57 version. Changed in this repo since, during the layout and
permissions audit, the owner's decisions that followed it, and the features borrowed from
open-source restaurant systems:

New paths - until published, the database refuses them and the screens say so:

- `bookings`: reservations and the waiting list, written by any host as themselves, history only
  grows, never deleted.
- `cashCounts`: drawer counts, created by any host as themselves, never edited or deleted.

Narrower:

- `auditLogs`: read by managers instead of every staff account. Only Settings, a manager's
  screen, reads the log; hosts keep writing their own entries.
- `orders`: a host's update must leave `servedVoidThb` unchanged, so voiding a dish that was
  already served is a manager's call, as a comp is. Orders made before the field existed read as 0.

Wider, by the owner's decision on 8 Oct 2026:

- `guests`, `metadata`, `forecasts`, `history`: written by managers, who now do the Opera import
  (administrators only before).
- `tables` (create, delete, any field) and `layouts`: managers, who now keep the floor plan.
- `menuState`: anyone at the door, as themselves, marks a dish sold out (managers only before);
  never deleted. The app writes each change to the audit log too.

Publishing them is the owner's step: Claude's attempt through the console was stopped by the
coding assistant's safety check ("Security Weaken"), because three of the changes widen access.
Paste `firestore.rules` into the console as below, then Publish. Until then the app offers these
to managers and hosts, but the database refuses the three widened ones and still lets hosts read
the audit log and void a served dish through anything other than the app.

Published again at 09:57 with the Food Exchange orders' three paths - `orders`, `counters` and
`menuState` - and checked in the Rules Playground: signed out, an order is refused; a verified
`@accor.com` account can read orders, the order counter and the sold-out list but not delete an
order, and still cannot read the manager-only history.


Pasted from this repo and published in the console, then checked in its Rules Playground: signed
out, a guest record is refused; the owner can read and write it; a verified `@accor.com` account
can read it but not write it.

What changed for people using the app: hosts who are not admins can now seat guests at tables
(before, the table update was admin-only and failed the whole check-in), staff audit entries are
accepted, the `role` claim is honoured, and an `@accor.com` address counts only once verified.
The app still served from AI Studio runs older code; its check-ins stamp the signer's own email,
so they still pass, but staff who are not managers can no longer read its synthetic
`daily_summaries` analytics.

To publish a later change to `firestore.rules`, with the Firebase CLI:

```bash
firebase login
```

```bash
firebase deploy --only firestore:rules
```

`firebase.json` names the database, so the rules reach the right one. Or paste `firestore.rules`
into Firestore → the named database → **Security** → Rules → Publish. That is a change to
production, so it is the owner's call.

## 2. Publish the new app

`firebase deploy --only hosting` cannot work here: Hosting is not part of the Starter Tier. The
app people open is the AI Studio / Cloud Run deployment listed above, and pushing to GitHub does
not change it. A new version goes live only when that deployment is updated from this code - or,
after upgrading the project, by serving `dist/` from Firebase Hosting (`firebase.json` is already
set up for it).

## 3. Roles

- Anyone signing in with a **verified `@accor.com`** Google account is staff (the door).
- `jeromegathigi@gmail.com` and `admin@novotel-chiangmai.com` are admins by address
  (`src/lib/access.ts`, mirrored in `firestore.rules`).
- Managers, and any other admin, need a `role` claim:

```bash
npm run firebase:claims -- --list
```

```bash
npm run firebase:claims -- --email=<address> --role=manager --apply
```

A new claim reaches the person on their next sign-in. The script refuses to demote the last admin
and never touches `jeromegathigi@gmail.com`.

The scripts need Admin credentials. Generate a key yourself - Firebase console → Project settings
→ Service accounts → Generate new private key - save it **outside** this repo, and point the
scripts at it:

```bash
setx FIREBASE_SERVICE_ACCOUNT_PATH "C:\opera-sync\service-account.json"
```

Never paste the key's contents anywhere, including into a chat. `.gitignore` blocks
`*service-account*.json` and `.env*`.

## 4. Clear the junk

Signed in as an admin: **Settings → Data maintenance → Scan**. It lists what it found -
synthetic `daily_summaries`, forecasts from the old parser, check-ins for rooms that do not exist,
guest documents that are not rooms - and deletes only after you confirm. Then import a real guest
list and forecast for each hotel.

Or, for the guest documents only:

```bash
npm run firebase:clear-junk
```

```bash
npm run firebase:clear-junk -- --apply
```

The first command is a dry run that prints every id it would keep and delete.

## 5. Worth doing soon

- **Backups.** Scheduled backups are off, and this database holds guest names, room numbers and
  loyalty tiers. Check whether the Starter Tier allows them; if not, that is a reason to upgrade.
- **The web API key** in `firebase-applet-config.json` identifies the project and is designed to
  be public, but it should still be restricted by HTTP referrer and to the Identity Toolkit and
  Firestore APIs (Google Cloud console → APIs & Services → Credentials).
- **The repository is public.** Its history contains a sample-data file with guest names
  (`src/parsing/__fixtures__/sampleData.ts`). Making the repository private stops further
  exposure; removing the file from history needs a history rewrite and a force-push.

## No scheduled jobs needed

The app was redesigned for the no-cost tier. Nothing needs a scheduled job: each guest-list import
archives the previous day and writes its summary, which is what Analytics reads. Unattended
imports run from `npm run opera:watch` on any always-on PC with the Admin key. Upgrading would
still buy scheduled backups, Firebase Hosting, and lift the AI-shared-quota limit the console
warns about.
