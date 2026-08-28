<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Opera Guest Meal Checker

This app is a hotel breakfast host tool for checking guest entitlement, uploading the Opera room report, and recording who actually ate breakfast.

## Local setup

1. Install dependencies:
   `npm install`
2. Copy `.env.example` to `.env.local` and fill in the Firebase values for your development project.
3. Start the app:
   `npm run dev`

## Firebase configuration

The app reads Firebase configuration from `VITE_FIREBASE_*` environment variables in `.env.local`.

Do not commit real Firebase credentials. The production project key should be rotated once Firestore rules are locked and the app is migrated to a separate dev project.

## Daily Opera sync

The app can auto-import a daily Opera Guest In-house export from a watched folder. This is designed for a hotel breakfast workflow where the Opera export lands in a shared folder each morning, then the script refreshes Firestore and updates the guest list for the current breakfast business day.

Required environment values in `.env.local`:

```bash
VITE_FIREBASE_PROJECT_ID="your-project-id"
OPERA_HOTEL_ID="novotel"
OPERA_WATCH_DIR="C:/OperaExports/incoming"
OPERA_ARCHIVE_DIR="C:/OperaExports/processed"
FIREBASE_SERVICE_ACCOUNT_PATH="C:/path/to/firebase-service-account.json"
```

You can also use Google Application Default Credentials instead of a JSON key file:

```bash
gcloud auth application-default login
```

Then run the watcher:

```bash
npm run opera:watch
```

Drop a Guest In-house `.txt` or `.csv` file into the incoming folder and the script will parse it with the same logic used by the app, overwrite the current hotel guest set, and archive the file.

For a one-off import:

```bash
OPERA_IMPORT_DIR="C:/OperaExports/incoming" npm run opera:import
```

This is the easiest way to automate a 05:00 refresh with Windows Task Scheduler or a small cron job.

## Admin claims

Use the helper script in `scripts/setClaims.ts` to grant `staff` and `admin` custom claims to a hotel-domain email.

Example:
`node --loader tsx scripts/setClaims.ts your.user@hotel.com staff admin`

This avoids relying on the hardcoded personal Gmail admin path used in older builds.
