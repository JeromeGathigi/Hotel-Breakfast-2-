-- =============================================================================
-- Hotel Breakfast 2 - analytics model for Metabase
--
-- Dialect: BigQuery Standard SQL. Postgres deltas are noted inline; the model is
-- deliberately portable because the landing zone is the one open decision.
--
-- WHY THIS FILE EXISTS
-- --------------------
-- Metabase cannot read Firestore. Its bundled drivers are athena, bigquery,
-- clickhouse, databricks, druid, hive, mongo, oracle, presto, redshift,
-- snowflake, sparksql, sqlserver, starburst and vertica, plus core Postgres and
-- MySQL. Metabase's own "Driver: Firebase" issue (#4213) was closed in favour of
-- routing through BigQuery. So the operational store stays Firestore and the
-- analytics layer is a separate, relational copy. This is that copy.
--
-- THE THREE DECISIONS THAT SHAPE EVERYTHING BELOW
-- -----------------------------------------------
-- 1. NO GUEST PII CROSSES THIS BOUNDARY.
--    Firestore's Guest carries guestName, accompanyingGuests, preferences,
--    specialRequests and free-text notes written by the front office about named
--    individuals; CheckIn carries checkedGuestNames and recordedBy. None of it
--    appears here, and that is not an oversight.
--    Metabase hands broad ad-hoc query access to whoever can log in. A revenue
--    manager asking "how many covers did we do on Tuesday" needs counts, never
--    names. Every question this model has to answer is answerable from counts, so
--    carrying the names would add risk with no analytical return.
--    The door tool keeps reading Firestore directly for the operational case,
--    where a host genuinely does need the guest in front of them by name.
--
-- 2. BREAKFAST ENTITLEMENT IS THREE-VALUED, NOT A BOOLEAN.
--    'included' | 'excluded' | 'unverified'. The app previously decided this by
--    substring-matching a rate code and collapsing everything it could not answer
--    to "no", which silently refused breakfast to guests who were owed it -
--    measured at 60 adults on one real export. A boolean column here would
--    reintroduce exactly that, because someone would eventually write
--    COUNT(CASE WHEN entitled THEN 1 END) and quietly lose the unknowns.
--    Keeping three values forces every query to say what it does with them.
--
-- 3. BUSINESS DATE IS NOT CALENDAR DATE.
--    The hotel day rolls at 04:00 Asia/Bangkok. A check-in stamped 02:40 belongs
--    to the previous business date. Every fact below is keyed on business_date,
--    already resolved upstream by src/lib/businessDate.ts. Never re-derive it from
--    a timestamp in SQL, and never use CURRENT_DATE() as a business date.
-- =============================================================================


-- =============================================================================
-- DIMENSIONS
-- =============================================================================

-- Two properties. The resort code is how the Opera export identifies them, and is
-- the only correct way to route a file - never room-number ranges, which an
-- earlier version of the importer used.
CREATE OR REPLACE TABLE dim_hotel (
  hotel_id      STRING NOT NULL,   -- 'novotel' | 'ibis'
  resort_code   STRING NOT NULL,   -- 'HB4F8'   | 'HB9U9'
  hotel_name    STRING NOT NULL,
  brand         STRING NOT NULL,
  city          STRING NOT NULL,
  -- Under-12 at ibis, under-16 at Novotel eat free. Whether they count as booked
  -- pax is still an open question for the F&B manager; until it is answered, do
  -- not bake an assumption into a query - use fact_room_night.children directly
  -- so the choice is visible at the point of use.
  free_child_under_age INT64 NOT NULL,
  timezone      STRING NOT NULL    -- 'Asia/Bangkok'
);

-- A conformed date dimension. business_date is the grain of every fact.
CREATE OR REPLACE TABLE dim_date (
  business_date   DATE NOT NULL,
  iso_year        INT64 NOT NULL,
  iso_week        INT64 NOT NULL,
  month_start     DATE NOT NULL,
  month_name      STRING NOT NULL,
  day_of_week     INT64 NOT NULL,  -- 1 = Monday
  day_name        STRING NOT NULL,
  is_weekend      BOOL NOT NULL,
  -- Marked separately because the ASPAC weekday/weekend rate split in
  -- dim_rate_code is defined against the hotel's week, not the calendar's.
  is_thai_public_holiday BOOL
);

-- ---------------------------------------------------------------------------
-- The most valuable table here. Accor's Global Rate Referential, 573 codes,
-- generated from the same workbook as src/lib/rateReferential.ts by
-- scripts/generate-rate-referential.py so the app and the warehouse can never
-- disagree about what a rate means.
--
-- THREE TRAPS ARE ENCODED IN THIS TABLE. Read them before writing a query.
--
--  * plan = 'ASPAC' (9 codes: RC1, RC3, RC3L/M/S, RC4, RC4L/M/S)
--    The workbook text begins "RO (Room Only) on weekdays" and ends
--    "ASPAC: BB on all days of the week". Chiang Mai is ASPAC, so these ARE
--    breakfast every day. Reading only the first words inverts the answer, and
--    the codes' own names say COMPLIMENTARY BREAKFAST, agreeing with the override.
--    includes_breakfast is therefore TRUE for them.
--
--  * plan = 'CONTRACT' (3 codes: BGCI, BGPG, BGRE)
--    Accor's own text is "Accoriding the contract" - their typo, preserved. No
--    rate table can resolve these; inclusion lives on the group block contract,
--    reachable only via block_code. includes_breakfast is NULL, meaning unknown,
--    which is not the same as FALSE. BGRE alone was 38 rooms on one real export.
--
--  * plan = 'PACKAGE' (14 codes)
--    Depends on what the package bundles. Also NULL.
--
-- And never join or filter this table with LIKE. The Novotel resort code is
-- literally HB4F8; a loose '%HB%' match reads it as Half Board. Equality only.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE TABLE dim_rate_code (
  rate_code        STRING NOT NULL,  -- exact match key, upper case
  rate_name        STRING,           -- e.g. 'FLEXIBLE RATE - BREAKFAST INCLUDED'
  rate_family      STRING,           -- e.g. 'Group rate', 'Rack rate', 'Wholesaler/FIT'
  meal_plan        STRING NOT NULL,  -- 'RO'|'BB'|'HB'|'FB'|'AI'|'ASPAC'|'CONTRACT'|'PACKAGE'
  includes_breakfast BOOL,           -- NULL = the rate cannot answer. See above.
  includes_lunch     BOOL,           -- only FB and AI
  includes_dinner    BOOL,           -- HB and above
  is_in_global_referential BOOL NOT NULL,
  -- Property-local codes are absent from Accor's global file and configured in
  -- the property's own Opera: C01MRO (the Murata block), LDR, C20, TRIPRO,
  -- CREWESR, MASTBB and others. They arrive here with
  -- is_in_global_referential = FALSE and includes_breakfast = NULL until someone
  -- with Opera rate-code access confirms them. On one real export that was 93
  -- Novotel and 95 ibis pax - so this is not a rounding error.
  referential_version DATE            -- edition of the workbook, e.g. 2026-07-22
);

-- Opera package/product codes from the package-forecast export.
-- MBREAK is a meeting MORNING COFFEE BREAK and MBUFF a meeting buffet. Neither is
-- a breakfast cover. An earlier version of the app counted MBREAK as breakfast.
CREATE OR REPLACE TABLE dim_product (
  product_code   STRING NOT NULL,  -- 'BF','BF350NET','BF260NET','BFCOMP','BFI200N','CNFBB','MBREAK','MBUFF','DINNER','DINNVT'
  product_label  STRING NOT NULL,
  meal_service   STRING NOT NULL,  -- 'breakfast'|'lunch'|'dinner'|'meeting_break'|'other'
  is_breakfast   BOOL NOT NULL,    -- TRUE only for BF, BF350NET, BF260NET, BFCOMP, BFI200N, CNFBB
  hotel_id       STRING            -- some codes are property-specific (BF350NET Novotel, BF260NET ibis)
);

-- Function and dining spaces. Novotel only for meeting rooms; ibis has no
-- function space in scope. Sourced from src/lib/functionSpace.ts, which already
-- normalises 28 real spellings of these seven names.
CREATE OR REPLACE TABLE dim_venue (
  venue_id     STRING NOT NULL,  -- 'MR1'..'MR4','FX','GB','REC'
  venue_name   STRING NOT NULL,  -- 'Meeting Room 1', 'Food Exchange', 'Gourmet Bar', ...
  hotel_id     STRING NOT NULL,
  venue_type   STRING NOT NULL,  -- 'meeting'|'restaurant'|'bar'|'recreation'
  seated_capacity INT64          -- NULL until the restaurant manager confirms seat counts
);


-- =============================================================================
-- FACTS
-- =============================================================================

-- ---------------------------------------------------------------------------
-- GRAIN: one row per hotel x business_date x room, as the in-house report saw it.
--
-- This is a PERIODIC SNAPSHOT, not a transaction log. The Opera "Guests INH - By
-- Room" export is a picture of who is in the house on one business date; it is
-- not additive across dates, so never SUM adults across business_date without
-- meaning "room nights".
--
-- Each import is a full replace for its business_date, so an upstream
-- cancellation disappears here rather than lingering.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE TABLE fact_room_night (
  hotel_id           STRING NOT NULL,
  business_date      DATE   NOT NULL,
  room_number        STRING NOT NULL,

  rate_code          STRING,          -- -> dim_rate_code. May be blank in the export.
  block_code         STRING,          -- the key to a group contract, for plan='CONTRACT'
  room_category      STRING,
  company_name       STRING,          -- an ORGANISATION, not a person. Safe to keep.

  adults             INT64 NOT NULL,
  children           INT64 NOT NULL,
  infants            INT64,

  -- Resolved by src/lib/meals.ts assessBreakfast() at load time, so the app and
  -- the warehouse agree. See decision 2 in the header: three values, and
  -- 'unverified' must never be silently folded into 'excluded'.
  breakfast_entitlement STRING NOT NULL,  -- 'included'|'excluded'|'unverified'
  -- Why we reached that answer, so a query can separate a confirmed refusal from
  -- a guess: 'referential'|'aspac'|'contract'|'package'|'pattern'|'explicit'|'unlisted'|'blank'
  entitlement_basis     STRING NOT NULL,

  -- Accor ALL tier as exported: 1,2,3,5,7 were the values actually present. The
  -- numeric-to-name mapping (Classic/Silver/Gold/Platinum/Diamond) is NOT
  -- confirmed against Accor's scheme, so it stays numeric here rather than
  -- inventing labels that would then be reported as fact.
  loyalty_tier       INT64,
  is_vip             BOOL,

  -- Parser-detected data quality, not a business fact.
  issue_type         STRING,          -- 'no-adults'|'over-capacity'|'unentitled'|'no-details'|NULL

  -- Lineage. Every row must be traceable to the file that produced it.
  source_filename    STRING NOT NULL,
  source_sha256      STRING NOT NULL, -- makes a re-import idempotent
  loaded_at          TIMESTAMP NOT NULL
)
PARTITION BY business_date
CLUSTER BY hotel_id, breakfast_entitlement;
-- Postgres: drop PARTITION/CLUSTER and add
--   PRIMARY KEY (hotel_id, business_date, room_number)
--   plus an index on (hotel_id, business_date, breakfast_entitlement).


-- ---------------------------------------------------------------------------
-- GRAIN: one row per hotel x business_date x room x meal_service - what was
-- actually served. This IS additive: SUM(adults_ate) is covers.
--
-- Deliberately excluded: recordedBy, checkedGuestNames, authorizingStaff. Who
-- served whom is an operational and HR matter, and putting a staff member's name
-- next to a productivity count in an ad-hoc BI tool invites exactly the use it
-- should not have. If per-shift analysis is ever genuinely needed, add a
-- surrogate staff_key to a separate, access-controlled dimension.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE TABLE fact_meal_checkin (
  hotel_id        STRING NOT NULL,
  business_date   DATE   NOT NULL,
  room_number     STRING NOT NULL,
  meal_service    STRING NOT NULL,   -- 'breakfast'|'lunch'|'dinner'

  served_at       TIMESTAMP NOT NULL, -- true instant; business_date already resolved
  adults_ate      INT64 NOT NULL,
  children_ate    INT64 NOT NULL,
  infants_ate     INT64,

  venue_id        STRING,             -- -> dim_venue
  table_number    STRING,

  -- When staff seated more pax than the room was entitled to, and why. These are
  -- the codes from OVER_CAPACITY_REASONS: STAFF_APPROVED, ROOM_CHARGE,
  -- CHILD_COMPLIMENTARY, VIP_BENEFIT, CONFERENCE_EXTRA, OTHER. Reported as an
  -- array so a cover can carry more than one reason.
  over_capacity_reasons ARRAY<STRING>,
  -- The free-text "other reason" is NOT carried: it is staff prose that can name
  -- a guest.

  loaded_at       TIMESTAMP NOT NULL
)
PARTITION BY business_date
CLUSTER BY hotel_id, meal_service;
-- Postgres: over_capacity_reasons becomes TEXT[]; drop PARTITION/CLUSTER.


-- ---------------------------------------------------------------------------
-- GRAIN: one row per hotel x snapshot_date x stay_date x product_code.
--
-- snapshot_date is in the grain ON PURPOSE. A forecast is as-of data: the answer
-- to "how many breakfasts on 15 October" changes every day until 15 October
-- arrives. Without snapshot_date you can only ever see the latest guess and can
-- never ask how the forecast moved, which is most of what a revenue manager
-- wants from it.
--
-- Loading note. The export writes ONE ROW PER PACKAGE UNIT, with TOTAL_PKGS = 1
-- and SUMTOTAL_PKGS repeated identically on every duplicate row for a
-- (date, product) pair. Deduplicate on (STAY_DATE_CHAR, PRODUCT_ID) and read
-- SUMTOTAL_PKGS once. Summing SUMTOTAL_PKGS across the duplicates multiplies the
-- forecast by its own row count. The file also ends with a nested second report
-- block - a 21-column header, then a 16-column summary header, then one summary
-- row - which the loader must detect and stop at.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE TABLE fact_package_forecast (
  hotel_id       STRING NOT NULL,
  snapshot_date  DATE   NOT NULL,   -- business date the forecast was exported
  stay_date      DATE   NOT NULL,   -- date being forecast
  product_code   STRING NOT NULL,   -- -> dim_product

  packages       INT64  NOT NULL,   -- SUMTOTAL_PKGS for this (stay_date, product)

  source_filename STRING NOT NULL,
  loaded_at      TIMESTAMP NOT NULL
)
PARTITION BY stay_date
CLUSTER BY hotel_id, snapshot_date;


-- ---------------------------------------------------------------------------
-- GRAIN: one row per hotel x business_date x venue x event.
--
-- An event spanning several days produces one row per day it occupies, so venue
-- occupancy by date is a simple count. Cancelled events are KEPT with
-- status='cancelled' rather than deleted: a room the kitchen believes is booked
-- is an operational problem, and silently vanishing bookings is worse than a
-- visible cancellation.
--
-- Note CXL (the function workbook) and CLX (GRC) are the same cancellation,
-- transposed between two source files. Both normalise to 'cancelled'.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE TABLE fact_function_event (
  hotel_id       STRING NOT NULL,
  business_date  DATE   NOT NULL,
  venue_id       STRING NOT NULL,   -- -> dim_venue
  event_key      STRING NOT NULL,   -- stable id from the source

  event_name     STRING,
  company_name   STRING,            -- an organisation; the source's Group Name
  program        STRING,            -- the package, e.g. 'Full Day Meeting' - 116 distinct values
  status         STRING NOT NULL,   -- 'definite'|'tentative'|'prospect'|'cancelled'

  start_time     TIME,
  end_time       TIME,
  service_period STRING,            -- 'breakfast'|'lunch'|'dinner'|NULL, derived from start hour

  pax            INT64,
  revenue_thb    NUMERIC,           -- function revenue; NULL when the source is blank, never 0

  source_filename STRING NOT NULL,
  loaded_at      TIMESTAMP NOT NULL
)
PARTITION BY business_date
CLUSTER BY hotel_id, venue_id;


-- =============================================================================
-- VIEWS - the questions the business actually asks
--
-- These exist so nobody has to reassemble the reconciliation by hand in the
-- Metabase query builder and get the three-valued entitlement wrong.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- The number the business argues about: what Opera forecast, what the rate codes
-- entitle, and what was actually served - side by side, per hotel per day.
--
-- On the 2 September exports these three disagreed badly, which is the whole
-- reason this view is the first thing built:
--   Novotel  entitled_confirmed 20 | unverified 93 | Opera forecast 98
--   ibis     entitled_confirmed  7 | unverified 95 | Opera forecast 43
-- The unverified column is not noise to be hidden; it IS the finding.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW vw_breakfast_reconciliation AS
WITH entitlement AS (
  SELECT
    hotel_id,
    business_date,
    COUNTIF(breakfast_entitlement = 'included')   AS rooms_included,
    COUNTIF(breakfast_entitlement = 'excluded')   AS rooms_excluded,
    COUNTIF(breakfast_entitlement = 'unverified') AS rooms_unverified,
    SUM(IF(breakfast_entitlement = 'included',   adults + children, 0)) AS pax_included,
    SUM(IF(breakfast_entitlement = 'excluded',   adults + children, 0)) AS pax_excluded,
    SUM(IF(breakfast_entitlement = 'unverified', adults + children, 0)) AS pax_unverified,
    SUM(adults + children) AS pax_in_house
  FROM fact_room_night
  GROUP BY hotel_id, business_date
),
forecast AS (
  -- The latest snapshot for each stay date. Anything earlier is history, and is
  -- what makes forecast drift analysable.
  SELECT
    f.hotel_id,
    f.stay_date AS business_date,
    SUM(f.packages) AS forecast_breakfast_packages
  FROM fact_package_forecast f
  JOIN dim_product p USING (product_code)
  WHERE p.is_breakfast
    AND f.snapshot_date = (
      SELECT MAX(snapshot_date)
      FROM fact_package_forecast x
      WHERE x.hotel_id = f.hotel_id AND x.stay_date = f.stay_date
    )
  GROUP BY f.hotel_id, f.stay_date
),
served AS (
  SELECT
    hotel_id,
    business_date,
    SUM(adults_ate + children_ate) AS pax_served,
    COUNT(DISTINCT room_number)    AS rooms_served
  FROM fact_meal_checkin
  WHERE meal_service = 'breakfast'
  GROUP BY hotel_id, business_date
)
SELECT
  e.hotel_id,
  e.business_date,
  e.pax_in_house,
  e.pax_included,
  e.pax_excluded,
  e.pax_unverified,
  e.rooms_unverified,
  f.forecast_breakfast_packages,
  s.pax_served,
  s.rooms_served,
  -- How far the rate codes are from Opera's own package count. A large positive
  -- gap means the unverified rooms are probably entitled; that is how BGRE at
  -- Novotel and C01MRO at ibis were first identified as likely.
  f.forecast_breakfast_packages - e.pax_included AS forecast_minus_confirmed,
  -- Did more people eat than we believed were entitled?
  s.pax_served - e.pax_included                  AS served_minus_confirmed
FROM entitlement e
LEFT JOIN forecast f USING (hotel_id, business_date)
LEFT JOIN served   s USING (hotel_id, business_date);


-- ---------------------------------------------------------------------------
-- The work queue for whoever has Opera rate-code access. Every rate code the app
-- could not resolve, ranked by how many people it affects, so the most valuable
-- question gets asked first.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW vw_unresolved_rate_codes AS
SELECT
  n.hotel_id,
  n.rate_code,
  r.rate_name,
  r.rate_family,
  r.meal_plan,
  r.is_in_global_referential,
  COUNT(*)                       AS room_nights,
  SUM(n.adults + n.children)     AS pax_affected,
  COUNT(DISTINCT n.business_date) AS dates_seen,
  MIN(n.business_date)           AS first_seen,
  MAX(n.business_date)           AS last_seen,
  -- Distinguishes "Accor says it depends on a contract" from "we have never
  -- heard of this code", which need different people to answer them.
  ANY_VALUE(n.entitlement_basis) AS basis,
  ARRAY_AGG(DISTINCT n.block_code IGNORE NULLS LIMIT 10) AS block_codes,
  ARRAY_AGG(DISTINCT n.company_name IGNORE NULLS LIMIT 10) AS companies
FROM fact_room_night n
LEFT JOIN dim_rate_code r USING (rate_code)
WHERE n.breakfast_entitlement = 'unverified'
GROUP BY n.hotel_id, n.rate_code, r.rate_name, r.rate_family, r.meal_plan,
         r.is_in_global_referential
ORDER BY pax_affected DESC;


-- ---------------------------------------------------------------------------
-- No-show and attendance. Only over rooms whose entitlement is CONFIRMED, because
-- an attendance rate computed over unverified rooms is not a rate, it is an
-- artefact of how many codes nobody has looked up yet.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW vw_breakfast_attendance AS
SELECT
  n.hotel_id,
  n.business_date,
  SUM(n.adults + n.children)                          AS entitled_pax,
  COALESCE(SUM(c.adults_ate + c.children_ate), 0)     AS served_pax,
  SUM(n.adults + n.children) - COALESCE(SUM(c.adults_ate + c.children_ate), 0) AS no_show_pax,
  SAFE_DIVIDE(
    COALESCE(SUM(c.adults_ate + c.children_ate), 0),
    SUM(n.adults + n.children)
  ) AS attendance_rate
FROM fact_room_night n
LEFT JOIN fact_meal_checkin c
       ON c.hotel_id = n.hotel_id
      AND c.business_date = n.business_date
      AND c.room_number = n.room_number
      AND c.meal_service = 'breakfast'
WHERE n.breakfast_entitlement = 'included'
GROUP BY n.hotel_id, n.business_date;


-- ---------------------------------------------------------------------------
-- Meeting-room usage: the day sheet the F&B team asked for, and the one place
-- revenue_thb belongs. Cancelled events are excluded from totals but remain
-- queryable in fact_function_event.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW vw_function_space_day AS
SELECT
  e.business_date,
  e.hotel_id,
  v.venue_name,
  v.venue_type,
  e.event_name,
  e.company_name,
  e.program,
  e.status,
  e.start_time,
  e.end_time,
  e.service_period,
  e.pax,
  e.revenue_thb,
  SAFE_DIVIDE(e.revenue_thb, e.pax) AS revenue_per_pax_thb
FROM fact_function_event e
JOIN dim_venue v USING (venue_id, hotel_id)
WHERE e.status <> 'cancelled';
