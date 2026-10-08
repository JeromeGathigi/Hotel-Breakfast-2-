/**
 * Cloud Functions for Hotel Breakfast 2 - currently EMPTY, deliberately.
 *
 * ## Why there is nothing here
 *
 * This Firebase project is on the **Spark (free) plan**. Cloud Functions, Cloud Scheduler
 * and Cloud Storage triggers all require the Blaze plan, so nothing in this folder can
 * deploy. It is kept as a placeholder, and typechecked in CI, so that the day the project
 * moves to Blaze there is a correct starting point rather than a resurrected mess.
 *
 * ## What used to be here, and why it was removed
 *
 * Three functions were removed in the commit that created this file. None could run on
 * Spark, so none was ever live - but all three were hazards waiting for a plan upgrade.
 *
 * 1. `processUploadedOperaReport` (a Cloud Storage trigger) and `operaInboundWebhook`
 *    (a public HTTPS endpoint) both parsed uploads with a *second, private* parser,
 *    `parseWorkbookBuffer`, which had none of the fixes in `src/parsing/`:
 *
 *      - matched column names by substring - the hazard that lets a `CODE` alias bind to
 *        `BLOCK_CODE`, and the Novotel resort code is literally `HB4F8`
 *      - defaulted `adults` to 1, inventing a guest where the report said zero
 *      - defaulted the meal plan to `BB`, GRANTING BREAKFAST to any row it could not
 *        classify
 *      - guessed which hotel a guest belonged to from room-number ranges
 *      - did no comment scanning, so BF / MBREAK / CNFBB entitlements were invisible
 *
 *    Both wrote to `hotels/{id}/guests` - the same collection the tested parser writes.
 *    Had this deployed, one file arriving in the bucket would have silently replaced
 *    correct guest data with that parser output.
 *
 * 2. `operaInboundWebhook` authentication was broken, not merely weak:
 *
 *        const expectedKey = process.env.OPERA_WEBHOOK_KEY || <a hardcoded fallback secret>;
 *        if (authHeader && authHeader.replace('Bearer ', '').trim() !== expectedKey) { 401 }
 *
 *    With no `Authorization` header the condition short-circuits and the request proceeds
 *    - an unauthenticated public write into guest data. The fallback secret was also
 *    hardcoded in a public repository, so the expected value was published.
 *
 * 3. `scheduledMorningOperaSync` ran at 05:00 Asia/Bangkok but only wrote a heartbeat
 *    document, keyed by `new Date().toISOString()` - the UTC date, which at 05:00 Bangkok
 *    is still the previous day. It did not perform the daily reset or archive.
 *
 * ## Where that work lives now
 *
 * The daily reset, archive and aggregate run as `scripts/dailyReset.ts` on the property
 * back-office PC via a Windows scheduled task, and the Opera import runs as
 * `scripts/watchOpera.ts`. Both use the single tested parser in `src/parsing/` and the
 * Asia/Bangkok business date in `src/lib/businessDate.ts`. See `PROJECT_PLAN.md`.
 *
 * ## If this project moves to Blaze
 *
 * Port `scripts/dailyReset.ts` to an `onSchedule` v2 function at 04:00 Asia/Bangkok. Do
 * not write a new parser: extract `src/parsing/`, `src/lib/businessDate.ts`,
 * `src/lib/meals.ts`, `src/lib/rateReferential.ts` and `src/types.ts` into a `shared/` folder and
 * import them here. That extraction is cheap - `src/types.ts` has no imports at all and
 * the parser depends only on it - but it is pointless until something here can deploy.
 *
 * Any HTTPS endpoint added here must reject a missing `Authorization` header, compare the
 * token in constant time, have no hardcoded fallback, and be rate limited.
 */

export {};
