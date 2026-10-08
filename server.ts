/**
 * Local dev/preview host for the Hotel Breakfast 2 single-page app.
 *
 * ## This file serves static files and nothing else, deliberately
 *
 * It used to expose three `/api/*` routes. All three are gone, removed in the commit that
 * created this header. They are documented here so nobody rebuilds them by accident:
 *
 * 1. `GET /api/sync/status` returned a **hardcoded shared secret in plain text**
 *    - redacted here on purpose, since reproducing it would defeat removing it - together
 *    with a ready-to-run `curl` example, on an unauthenticated route. Publishing the expected
 *    value of a secret removes the point of having one. The same literal was ALSO rendered
 *    into the UI by
 *    `AutomatedSyncManager.tsx`, which means it shipped inside the client JavaScript bundle
 *    and was readable by anyone who loaded the page, signed in or not.
 *
 *    That value must be treated as permanently compromised. It is in this repository's git
 *    history and the repository is public, so removing it here does not un-publish it. It was
 *    never wired to anything that validated it, so nothing was protected by it - but it must
 *    never be used as a real credential.
 *
 * 2. The same route also reported `status: 'active'` for a 05:00 scheduler and named its
 *    sources as an "Opera OHIP REST API", a "Night Audit SFTP Hot Folder" and a "Client
 *    Ingestion Webhook". None of the three existed. Fabricated telemetry is worse than no
 *    telemetry: it tells the next person a feed is healthy when there is no feed.
 *
 * 3. `POST /api/ingest/opera` read the API-key header into a variable and **never checked it**:
 *
 *        const apiKey = req.headers[<the key header>] || req.headers['authorization'];
 *        // ...never referenced again
 *
 *    Any unauthenticated caller could post a 50 MB body and have it parsed. It did not write
 *    to Firestore - it parsed the upload and echoed the result back, including guest names,
 *    meal plans and VIP status from whatever the caller sent - so it was an open compute
 *    endpoint rather than a leak of stored hotel data. It is not needed: imports run through
 *    the app's own import screen and through `scripts/importOpera.ts`.
 *
 * ## Why there are no API routes at all now
 *
 * `firebase.json` sets `hosting.public: "dist"`, which is static hosting. Express cannot run
 * there. Any `/api/*` route defined in this file is therefore reachable in local development
 * and silently absent in production - the worst of both, because the code implies a server
 * that is not there. If a real endpoint is ever needed it belongs in `functions/` as an
 * authenticated Cloud Function, not here.
 *
 * Any such endpoint must: reject a missing `Authorization` header outright, compare tokens in
 * constant time, read its secret from the environment with no hardcoded fallback, be rate
 * limited, and never echo request content back to the caller.
 */

import express, { Request, Response } from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === 'production';

// Bind to loopback in development so the dev server is not exposed to the local network.
// A hotel back-office LAN is not a trusted network. Production static hosting sets its own
// bind address, so only honour 0.0.0.0 when something explicitly asks for it.
const HOST = process.env.HOST || (isProduction ? '0.0.0.0' : '127.0.0.1');

// No body parsers. Nothing here accepts a request body, and the previous 50 MB JSON/text
// limits were the only reason an unauthenticated caller could make this process do work.

async function startServer() {
  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, HOST, () => {
    console.log(`[hotel-breakfast-2] ${isProduction ? 'static' : 'dev'} server on http://${HOST}:${PORT}`);
  });
}

startServer();
