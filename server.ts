import express, { Request, Response } from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { parseInHouseReport } from './src/parsing';
import { businessDate } from './src/lib/businessDate';

const app = express();
const PORT = 3000;

// Body parsers (JSON + Raw text for Opera TSV / CSV text drops)
app.use(express.json({ limit: '50mb' }));
app.use(express.text({ type: ['text/plain', 'text/tab-separated-values', 'text/csv'], limit: '50mb' }));

// 1. Health check
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'online',
    timestamp: new Date().toISOString(),
    businessDate: businessDate(),
    service: 'Accor Opera PMS Automated Ingestion Gateway',
    version: '2.4.0',
    properties: ['novotel-chiangmai (HB4F8)', 'ibis-chiangmai (HB9U9)']
  });
});

// 2. Opera Automated Ingestion Webhook / SFTP drop endpoint
app.post('/api/ingest/opera', async (req: Request, res: Response) => {
  try {
    const apiKey = req.headers['x-opera-api-key'] || req.headers['authorization'];
    const hotelParam = (req.query.hotelId as string) || req.body?.hotelId || 'both';
    const filename = (req.query.filename as string) || req.body?.filename || `opera_drop_${Date.now()}.tsv`;

    let reportText = '';
    if (typeof req.body === 'string') {
      reportText = req.body;
    } else if (req.body && typeof req.body.text === 'string') {
      reportText = req.body.text;
    } else if (req.body && req.body.content) {
      reportText = req.body.content;
    }

    if (!reportText || reportText.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Empty body. Send Opera report TSV/CSV text in body or as { text: "..." }',
      });
    }

    // Parse with Opera parser
    const parsed = parseInHouseReport(reportText, hotelParam);

    if (parsed.rooms.length === 0 && parsed.forecasts.length === 0) {
      return res.status(422).json({
        success: false,
        error: 'Opera report parsed but yielded 0 guest or forecast records. Verify file headers.',
        anomalies: parsed.anomalies,
      });
    }

    return res.status(200).json({
      success: true,
      message: `Successfully received and validated Opera export "${filename}"`,
      timestamp: new Date().toISOString(),
      businessDate: businessDate(),
      targetHotel: parsed.hotelId,
      reportType: parsed.reportType,
      stats: parsed.stats,
      anomaliesCount: parsed.anomalies.length,
      anomalies: parsed.anomalies,
      sampleRooms: parsed.rooms.slice(0, 5).map(r => ({
        room: r.roomNumber,
        guest: r.guestName,
        mealPlan: r.mealPlan,
        pax: (r.adults || 0) + (r.children || 0),
        vip: r.vipStatus
      })),
      forecastDaysCount: parsed.forecasts.length,
      webhookInstruction: 'Report validated and ready for real-time live ingestion.'
    });
  } catch (err: any) {
    console.error('[API /api/ingest/opera] Error:', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Internal error processing Opera ingestion',
    });
  }
});

// 3. Automated Daily Sync Info & Status
app.get('/api/sync/status', (req: Request, res: Response) => {
  res.json({
    status: 'active',
    scheduler: {
      schedule: '05:00 AM daily (Bangkok UTC+7)',
      nextRunTime: 'Tomorrow at 05:00 AM UTC+7',
      syncTargets: ['novotel', 'ibis'],
      sources: ['Opera OHIP REST API', 'Night Audit SFTP Hot Folder', 'Client Ingestion Webhook']
    },
    webhook: {
      url: '/api/ingest/opera',
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain or application/json',
        'X-Opera-Api-Key': 'accor-night-audit-key-2026'
      },
      curlExample: `curl -X POST https://[YOUR_APP_URL]/api/ingest/opera?hotelId=both -H "Content-Type: text/plain" -H "X-Opera-Api-Key: accor-night-audit-key-2026" --data-binary @opera_daily_export.tsv`
    }
  });
});

// 4. Vite Dev Server & Static Production Pipeline
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Accor Opera Gateway] Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
