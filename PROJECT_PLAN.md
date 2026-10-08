# Hotel Breakfast 2 - where it stands

Updated 8 Oct 2026, after an audit of the layout, services and permissions. 358 tests pass, the
typecheck is clean, and `npm run build` succeeds. The Firestore rules, orders included, were
published on 8 Oct; the five rule changes since are not yet. The code is on GitHub `main`; none of
it is deployed to the app staff open.

## Done in the 7 Oct audit

**Breakfast is decided from evidence, not guessed.** `src/lib/entitlement.ts` weighs, in order: a
correction made at the door, Opera's per-reservation packages (read from the forecast export),
front-office notes, the property's own breakfast rate list, and Accor's referential. Anything
unresolved is "Check rate" - the guest is let in and the room counted separately. Checked against
Opera's own forecast on the 2 Sep exports: Novotel 99 covers against 98, ibis 41 against 43.
On 3 Sep the app granted Novotel 24 adults and ibis 10.

**The door was rebuilt for a host with one hand free** (`src/door/`). Search first, 44px targets,
VIP badge per the spec's codes, notes on the card, a line saying *why* a room has breakfast,
partial check-ins ("1 of 2 in"), group check-in, undo, and a correction dialog for rooms Opera
lists with no adults or no guest details. Two pop-ups, acknowledged once per device per day: rate
codes to confirm, and Opera's forecast disagreeing with the list by more than max(5, 10%).
`src/door/DoorView.tsx` is presentational; the same screen renders in the dev-only preview at
`/dev/door-preview.html` with invented rooms and no Firebase.

**Imports replace, archive and refuse.** One plan (`src/lib/guestImport.ts`) behind both the
Import screen and `scripts/importOpera.ts`. A guest-list import removes departed rooms - before,
they stayed on the door with their breakfast until someone else took the room - archives the
previous day with its check-ins, and writes that day's summary for Analytics. The hotel comes from
the file's RESORT column; the wrong report, the wrong hotel, yesterday's list and a list half the
size are refused or must be ticked. The CLI used to fall back to the Firebase project id as the
hotel, writing guests to `hotels/polished-bonfire-cdtd0`; it now routes by the file, and its
watcher sets refused files aside with the reason.

**Roles match the rules.** `src/lib/access.ts` and `firestore.rules` read the same `role` claim
(admin / manager / staff), require verified email, and a test fails if they drift. The previous
rules read boolean claims nothing set, refused every host's audit entry, and made seating a guest
admin-only. Navigation is per role; Settings holds data status, rate codes, the audit log, access
and data maintenance.

**The data layer is the Firebase SDK and nothing else.** Firestore's own offline cache instead of a
hand-rolled localStorage store; a write that cannot be confirmed in 4 seconds is reported as
queued, and a later failure still reaches the screen; sign-out clears the device.

**Food Exchange orders (8 Oct).** After a read-only look at the outlet's Papaya POS trial: Orders
(table, room or takeaway; menu with notes; send to kitchen; void with a reason; split payments
including charge-to-room and comps; close, cancel, reopen; a history on every order), a Kitchen
screen, and a Sales report with the room charges to post to Opera. Discounts, comps, removing a
payment and reopening are a manager's, enforced in the rules too; an order's history can only
grow. Guest self-ordering, online payments, delivery partners and printer pairing were left out:
they need public write access, payment contracts or hardware.

**Smaller things that were wrong.** Check-in times, Analytics' hour buckets and table occupancy
used the device's time zone; everything is Bangkok time now, from one business-date module with
the 04:00 rollover. Analytics reads the daily summaries instead of
~12,000 documents per view and no longer fills gaps with invented numbers. CSV exports are
protected against formula injection. The floor plan no longer seeds tables from the browser.
`xlsx` (unfixed advisories), `papaparse` and three other unused dependencies were removed. Opera's
drop folders are git-ignored.

## Done in the 8 Oct layout, services and permissions audit

**The sidebar follows the work.** Door (check-in, floor plan), Food Exchange (orders, kitchen,
menu; Novotel only), Management, Administration - defined once in `src/navigation.ts`, with a test
of what each role sees. Phones and upright tablets get a top bar and a menu instead of a page of
navigation above the door; the screen is in the address; each device remembers its property.

**Exports moved to the managers who may use them.** They sat on the administrators' import
screen, now **Opera import**, though they only read data a manager may read.

**Messages match the roles.** The door told managers to import files only an administrator can
import; it now says who can. Settings → Access lists each role's duties from `src/lib/access.ts`.

**Services that were missing or broken.** A correction made at the door could not be undone - the
function existed but nothing called it; a room marked "not occupied" by mistake stayed hidden all
day. Changing a table's status on the floor plan changed only the table tapped, leaving the rest
of a merged group occupied and impossible to separate. The seated time showed as
`2026-10-08T00:42:13.120Z`. The kitchen and sales screens downloaded the whole in-house guest
list they never use. The menu now marks sold-out dishes.

**One permission gap closed.** A host could void a dish the guest had already eaten - a comp by
another name - while comps were a manager's. Now it is a manager's too, recorded in `servedVoidThb`
and enforced by the rules (once published), and Sales marks those voids "after serving". The audit
log is readable by managers only, as the screen that shows it always was.

**The owner's decisions, same day.** Managers do the Opera import and keep the floor plan
(administrators only before); anyone at the door marks a dish sold out - from an order's menu or
from the kitchen screen's new Sold out list - and each change goes to the audit log. Administrators
keep only data maintenance.

## Waiting on the owner

| | Why |
|---|---|
| **Publish the new app** where staff open it - AI Studio / Cloud Run | Firebase Hosting is not available on the Starter Tier, and GitHub does not update the live app |
| **Publish `firestore.rules`** (FIREBASE_SETUP.md section 1) - paste and Publish in the console | five changes: two narrower, and the three the owner decided on 8 Oct; Claude's console attempt was stopped by its safety check |
| **Grant manager roles** (`scripts/setClaims.ts`) | nobody has one yet, so the Opera import, the floor plan, discounts, comps, reopening a bill and voiding a served dish need an owner account |
| **Approve deleting the dead files** (below) | the deletion was blocked by a safety check; they are unimported and excluded from the build |
| Admin key for `scripts/` (FIREBASE_SETUP.md) | roles beyond staff, and unattended imports |
| Settings → Data maintenance, then a real import | production holds only junk and test data |
| Repository visibility | public, and its history holds a sample file with guest names |
| Should the second admin named in the spec (a personal Gmail account) be added? | not added without confirmation; a personal address does not belong in this public repo either |

Files awaiting approval to delete: `src/parsing/__fixtures__/sampleData.ts`,
`src/lib/excelFolderParser.ts`, `src/lib/historicalSeeder.ts`, and in `src/components/`:
`BulkFolderUploader`, `AutomatedSyncManager`, `DataQualityModal`, `GuestSearch`, `CheckInModal`,
`BatchCheckInModal`, `ReportUploader`, `OperaAuditModal` (`.tsx`); plus `functions/`,
`tailwind.config.cjs` and `firebase-blueprint.json`. `src/tests/no_fabricated_data.test.ts` keeps
the source files unimported until then.

## Waiting on the property

| Question | Who |
|---|---|
| Does `MBREAK` include the guest's own breakfast, or only a meeting break? Rooms with nothing else show "Check rate" | F&B manager |
| Codes still unknown without the forecast - `C01MRO`, `C20`, `TRIPRO`, `TRIPRB`, `FLMRAF`, `FLRAFB`, `MASTBB` | Opera rate-code access |
| Seats per table, both restaurants | restaurant manager |
| Do children count as booked covers? (Under-12 at ibis, under-16 at Novotel eat free) | F&B manager |
| Is `Function Room Block.xlsx` still maintained, and do tentative events count? | owner, F&B manager |

The forecast import answers most rate questions room by room, which is why the door asks for it
when too many rooms are unverified.
