# functions/ — not deployed

This folder is **empty on purpose** and nothing in it is deployed.

## Why

The Firebase project is on the **Spark (free) plan**. Cloud Functions, Cloud Scheduler and
Cloud Storage triggers all require the **Blaze** plan. Until the project moves to Blaze,
nothing here can run.

It is kept, and typechecked in CI, so that a move to Blaze starts from a correct baseline
rather than from resurrected code.

## Where the automation actually runs

On the property's always-on back-office PC, as Windows scheduled tasks:

| Script | Schedule | Job |
|---|---|---|
| `scripts/dailyReset.ts` | 04:00 Asia/Bangkok | archive yesterday, clear guests, write the daily aggregate |
| `scripts/watchOpera.ts` | every 5 minutes | import any new Opera export dropped in the synced folder |

Both use the single tested parser in `src/parsing/` and the Asia/Bangkok business date in
`src/lib/businessDate.ts`. See `PROJECT_PLAN.md`.

## If you move to Blaze

1. Port `scripts/dailyReset.ts` to an `onSchedule` v2 function at 04:00 `Asia/Bangkok`.
2. **Do not write a new parser.** Extract `src/parsing/`, `src/lib/businessDate.ts`,
   `src/lib/meals.ts`, `src/lib/stats.ts` and `src/types.ts` into a `shared/` folder and
   import them from here. The extraction is cheap: `src/types.ts` has no imports at all and
   the parser depends only on it.
3. `getFirestore()` with no argument connects to the `(default)` database, which on this
   project is a **different, empty** database. Always pass the id from
   `FIRESTORE_DATABASE_ID`, and throw at cold start if it is unset.
4. Any HTTPS endpoint must reject a **missing** `Authorization` header, compare the token in
   constant time, have no hardcoded fallback secret, and be rate limited. The endpoint
   removed from this folder failed all four.

## History

See the comment block in `src/index.ts` for what was removed and why.
