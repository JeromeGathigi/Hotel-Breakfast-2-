import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as XLSX from 'xlsx';

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const storage = admin.storage();

interface ParsedGuest {
  roomNumber: string;
  guestName: string;
  arrivalDate: string;
  departureDate: string;
  mealPlan: string;
  adults: number;
  children: number;
  infants: number;
  resvNameId: string;
  hotelId: 'novotel' | 'ibis';
  vipStatus?: string | null;
  vipLevel?: string | null;
  companyName?: string;
  rateCode?: string;
  roomCategory?: string;
  packages?: string[];
  lastUpdated: string;
}

/**
 * Determine hotel property from room number or sheet name
 */
function inferHotelId(roomNumber: string, sheetOrFileName: string): 'novotel' | 'ibis' {
  const lowerContext = sheetOrFileName.toLowerCase();
  if (lowerContext.includes('ibis')) return 'ibis';
  if (lowerContext.includes('novotel')) return 'novotel';

  const num = parseInt(roomNumber.replace(/\D/g, ''), 10);
  if (!isNaN(num)) {
    // Standard hotel partitioning: Rooms 800+ or specific blocks often belong to ibis
    if (num >= 800 && num <= 999) return 'ibis';
  }
  return 'novotel';
}

/**
 * Helper to split array into chunks (Firestore batches max at 500 operations)
 */
function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return chunks;
}

/**
 * Parses raw Excel/CSV buffer into standardized guest manifest records
 */
function parseWorkbookBuffer(buffer: Buffer, filename: string): { guests: ParsedGuest[]; stats: any } {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const guests: ParsedGuest[] = [];
  const seenRooms = new Set<string>();

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows: any[] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    if (!rows || rows.length < 2) continue;

    // Find header row index
    let headerIdx = -1;
    for (let i = 0; i < Math.min(rows.length, 15); i++) {
      const rowStr = rows[i].map((c: any) => String(c).toLowerCase()).join(' ');
      if (rowStr.includes('room') && (rowStr.includes('name') || rowStr.includes('guest'))) {
        headerIdx = i;
        break;
      }
    }

    if (headerIdx === -1) continue;

    const headers: string[] = rows[headerIdx].map((h: any) => String(h).trim().toLowerCase());
    const findCol = (keys: string[]) => headers.findIndex((h) => keys.some((k) => h.includes(k)));

    const colRoom = findCol(['room', 'rm', 'unit']);
    const colName = findCol(['guest name', 'name', 'guest']);
    const colArr = findCol(['arrival', 'arr', 'check in', 'in']);
    const colDep = findCol(['departure', 'dep', 'check out', 'out']);
    const colAdults = findCol(['adult', 'adl', 'pax']);
    const colChildren = findCol(['child', 'chd', 'kids']);
    const colRate = findCol(['rate', 'rate code', 'rtc']);
    const colMeal = findCol(['meal', 'package', 'board', 'plan']);
    const colVip = findCol(['vip', 'vip status']);
    const colCompany = findCol(['company', 'comp', 'group']);
    const colResv = findCol(['resv', 'conf', 'reservation', 'id']);

    for (let r = headerIdx + 1; r < rows.length; r++) {
      const row = rows[r];
      if (!row || row.length === 0) continue;

      const rawRoom = colRoom !== -1 ? String(row[colRoom] || '').trim() : '';
      if (!rawRoom || rawRoom.toLowerCase() === 'room' || rawRoom.toLowerCase().includes('total')) {
        continue;
      }

      const roomNumber = rawRoom.replace(/[^\w-]/g, '');
      if (!roomNumber) continue;

      const guestName = colName !== -1 ? String(row[colName] || 'Guest').trim() : 'Guest';
      const arrival = colArr !== -1 ? String(row[colArr] || '').trim() : '';
      const departure = colDep !== -1 ? String(row[colDep] || '').trim() : '';
      const adults = colAdults !== -1 ? parseInt(String(row[colAdults]), 10) || 1 : 1;
      const children = colChildren !== -1 ? parseInt(String(row[colChildren]), 10) || 0 : 0;
      const rateCode = colRate !== -1 ? String(row[colRate] || '').trim() : '';
      const mealPlan = colMeal !== -1 ? String(row[colMeal] || 'BB').trim() : 'BB';
      const vipStatus = colVip !== -1 ? String(row[colVip] || '').trim() : null;
      const companyName = colCompany !== -1 ? String(row[colCompany] || '').trim() : '';
      const resvNameId = colResv !== -1 ? String(row[colResv] || '').trim() : `RES-${roomNumber}`;

      const hotelId = inferHotelId(roomNumber, `${sheetName} ${filename}`);

      if (!seenRooms.has(`${hotelId}-${roomNumber}`)) {
        seenRooms.add(`${hotelId}-${roomNumber}`);
        guests.push({
          roomNumber,
          guestName,
          arrivalDate: arrival,
          departureDate: departure,
          adults,
          children,
          infants: 0,
          mealPlan,
          resvNameId,
          hotelId,
          rateCode,
          vipStatus: vipStatus || null,
          companyName,
          lastUpdated: new Date().toISOString(),
        });
      }
    }
  }

  return {
    guests,
    stats: {
      totalGuests: guests.length,
      totalAdults: guests.reduce((a, b) => a + b.adults, 0),
      totalChildren: guests.reduce((a, b) => a + b.children, 0),
    },
  };
}

/**
 * 1. Cloud Storage Trigger
 * Fires whenever a new file is uploaded to the reports storage bucket
 * (e.g. gs://<project-id>.appspot.com/opera-reports/...)
 */
export const processUploadedOperaReport = functions.storage
  .object()
  .onFinalize(async (object) => {
    const filePath = object.name;
    const bucketName = object.bucket;

    if (!filePath) return;

    const lowerPath = filePath.toLowerCase();
    const isSupported =
      lowerPath.endsWith('.xlsx') ||
      lowerPath.endsWith('.xls') ||
      lowerPath.endsWith('.csv') ||
      lowerPath.endsWith('.tsv') ||
      lowerPath.endsWith('.txt');

    if (!isSupported) {
      console.log(`Skipping non-report file: ${filePath}`);
      return;
    }

    console.log(`Processing Opera report upload: ${filePath} from bucket: ${bucketName}`);

    const bucket = storage.bucket(bucketName);
    const [fileBuffer] = await bucket.file(filePath).download();

    const { guests, stats } = parseWorkbookBuffer(fileBuffer, filePath);
    console.log(`Parsed ${guests.length} guest records from ${filePath}`);

    if (guests.length === 0) {
      console.warn(`No valid room records found in ${filePath}`);
      return;
    }

    // Partition by hotel
    const novotelGuests = guests.filter((g) => g.hotelId === 'novotel');
    const ibisGuests = guests.filter((g) => g.hotelId === 'ibis');

    const commitHotelGuests = async (hid: 'novotel' | 'ibis', list: ParsedGuest[]) => {
      if (list.length === 0) return;

      const batches = chunkArray(list, 400);
      for (const batchList of batches) {
        const writeBatch = db.batch();
        for (const guest of batchList) {
          const ref = db.doc(`hotels/${hid}/guests/${guest.roomNumber}`);
          writeBatch.set(ref, guest, { merge: true });
        }
        await writeBatch.commit();
      }

      // Update hotel report metadata
      await db.doc(`hotels/${hid}/metadata/reports`).set(
        {
          lastUploaded: admin.firestore.FieldValue.serverTimestamp(),
          filename: filePath,
          uploadedBy: 'cloud-storage-trigger',
          stats: {
            totalRooms: list.length,
            totalAdults: list.reduce((a, b) => a + b.adults, 0),
            totalChildren: list.reduce((a, b) => a + b.children, 0),
          },
        },
        { merge: true }
      );

      // Add audit trail entry
      await db.collection(`hotels/${hid}/audit`).add({
        action: 'STORAGE_AUTO_SYNC',
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        details: `Automated sync: Imported ${list.length} rooms from storage bucket file "${filePath}"`,
        source: 'gcs-trigger',
      });
    };

    await Promise.all([
      commitHotelGuests('novotel', novotelGuests),
      commitHotelGuests('ibis', ibisGuests),
    ]);

    console.log(`Successfully completed automated sync for ${filePath}. Novotel: ${novotelGuests.length}, ibis: ${ibisGuests.length}`);
  });

/**
 * 2. Scheduled Cron Function
 * Runs every morning at 05:00 AM local time (Asia/Bangkok)
 * Can poll an external GCS folder or SFTP bridge for the morning report
 */
export const scheduledMorningOperaSync = functions.pubsub
  .schedule('0 5 * * *')
  .timeZone('Asia/Bangkok')
  .onRun(async (context) => {
    console.log('Morning Opera Sync Triggered at 05:00 AM');
    
    // Log scheduled heartbeats
    const today = new Date().toISOString().split('T')[0];
    await db.doc(`system/sync-logs/daily/${today}`).set(
      {
        lastScheduledCheck: admin.firestore.FieldValue.serverTimestamp(),
        status: 'READY_FOR_MORNING_SERVICE',
      },
      { merge: true }
    );
    return null;
  });

/**
 * 3. Secure HTTPS Webhook Endpoint
 * Allows night audit scripts, curl, or automated hotel servers to POST Excel / CSV payloads directly
 */
export const operaInboundWebhook = functions.https.onRequest(async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed. Use POST.' });
    return;
  }

  // Optional simple Bearer token check
  const authHeader = req.headers.authorization;
  const expectedKey = process.env.OPERA_WEBHOOK_KEY || 'opera-accor-secret-key-2026';
  
  if (authHeader && authHeader.replace('Bearer ', '').trim() !== expectedKey) {
    res.status(401).json({ error: 'Unauthorized webhook request' });
    return;
  }

  try {
    let buffer: Buffer;

    if (Buffer.isBuffer(req.body)) {
      buffer = req.body;
    } else if (typeof req.body === 'string') {
      buffer = Buffer.from(req.body, 'utf-8');
    } else if (req.body?.fileBase64) {
      buffer = Buffer.from(req.body.fileBase64, 'base64');
    } else {
      res.status(400).json({ error: 'Missing file payload. Send raw binary, CSV text, or { fileBase64: "..." }' });
      return;
    }

    const filename = (req.query.filename as string) || 'inbound_webhook_report.xlsx';
    const { guests, stats } = parseWorkbookBuffer(buffer, filename);

    if (guests.length === 0) {
      res.status(422).json({ error: 'No readable room records found in payload.' });
      return;
    }

    const novotelGuests = guests.filter((g) => g.hotelId === 'novotel');
    const ibisGuests = guests.filter((g) => g.hotelId === 'ibis');

    for (const [hid, list] of Object.entries({ novotel: novotelGuests, ibis: ibisGuests }) as ['novotel' | 'ibis', ParsedGuest[]][]) {
      if (list.length === 0) continue;
      const batches = chunkArray(list, 400);
      for (const batchList of batches) {
        const writeBatch = db.batch();
        for (const guest of batchList) {
          const ref = db.doc(`hotels/${hid}/guests/${guest.roomNumber}`);
          writeBatch.set(ref, guest, { merge: true });
        }
        await writeBatch.commit();
      }
    }

    res.status(200).json({
      success: true,
      message: `Successfully processed ${guests.length} rooms.`,
      counts: {
        novotel: novotelGuests.length,
        ibis: ibisGuests.length,
        total: guests.length,
      },
    });
  } catch (err: any) {
    console.error('Webhook processing error:', err);
    res.status(500).json({ error: err.message || 'Internal server error processing report.' });
  }
});
