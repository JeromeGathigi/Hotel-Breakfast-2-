import { describe, expect, it } from 'vitest';
import { assessFreshness, STALE_AFTER_HOURS } from './freshness';

const NOW = new Date('2026-09-01T02:00:00Z'); // 09:00 Asia/Bangkok, mid-service
const TODAY = '2026-09-01';

describe('assessFreshness', () => {
  it('is critical when no report has ever been imported', () => {
    const f = assessFreshness({ metadataDate: null, today: TODAY, now: NOW });
    expect(f.level).toBe('critical');
    expect(f.message).toMatch(/has ever been imported/);
  });

  it('is ok when the list belongs to today and the import is recent', () => {
    const f = assessFreshness({
      metadataDate: TODAY,
      lastUploaded: new Date('2026-09-01T00:00:00Z'),
      today: TODAY,
      now: NOW,
    });
    expect(f.level).toBe('ok');
    expect(f.message).toBe('');
  });

  it('warns when the list belongs to a previous business date', () => {
    // REGRESSION: on 31 Aug 2026 the live list was a day old AND parsed from the wrong
    // report, and the header showed a green "Live" indicator throughout.
    const f = assessFreshness({
      metadataDate: '2026-08-31',
      lastUploaded: new Date('2026-08-31T03:34:00Z'),
      today: TODAY,
      now: NOW,
    });
    expect(f.level).toBe('warn');
    expect(f.message).toMatch(/2026-08-31/);
    expect(f.message).toMatch(/not today/);
  });

  it('escalates to critical once the import is older than the stale window', () => {
    const f = assessFreshness({
      metadataDate: '2026-08-30',
      lastUploaded: new Date(NOW.getTime() - (STALE_AFTER_HOURS + 2) * 36e5),
      today: TODAY,
      now: NOW,
    });
    expect(f.level).toBe('critical');
    expect(f.message).toMatch(/automated sync has probably stopped|hours ago/);
  });

  it('does not cry wolf just inside the stale window', () => {
    // A 04:00 schedule plus retry jitter must not raise a false alarm at 24h.
    const f = assessFreshness({
      metadataDate: TODAY,
      lastUploaded: new Date(NOW.getTime() - 25 * 36e5),
      today: TODAY,
      now: NOW,
    });
    expect(f.level).toBe('ok');
  });
});

describe('while the read is still in flight', () => {
  /*
   * Found by loading the running app signed out on 8 Sep 2026 and screenshotting two
   * consecutive frames. Frame 1 said "No Opera report has ever been imported - import this
   * morning's export"; frame 2, from the SAME load, said "You do not have permission -
   * importing will not fix it". The first frame was just the mount state, where metadataDate
   * and readError are both null, reading as a successful read of an empty property.
   *
   * The nine-finding pass fixed the steady state and missed the loading state entirely,
   * because every existing test constructs a settled one.
   */
  it('asserts nothing before the subscription has come back', () => {
    const pending = assessFreshness({
      metadataDate: null,
      readError: null,
      today: '2026-09-08',
      metadataSettled: false,
    });

    expect(pending.level).toBe('pending');
    expect(pending.label).toBe('Checking');
    // The retracted instruction. It must not appear while the answer is unknown.
    expect(pending.message).not.toMatch(/Import this morning/);
    expect(pending.message).not.toMatch(/has ever been imported/);
    expect(pending.message).not.toMatch(/permission/i);
  });

  it('is not mistaken for a healthy list', () => {
    // 'pending' must stay outside 'ok', or the banner hides and a blank screen reads as fine.
    const pending = assessFreshness({ metadataDate: null, today: '2026-09-08', metadataSettled: false });
    expect(pending.level).not.toBe('ok');
    expect(pending.message).not.toBe('');
  });

  it('yields to the real verdict once settled', () => {
    const denied = assessFreshness({
      metadataDate: null,
      today: '2026-09-08',
      readError: { code: 'permission-denied', message: 'Missing or insufficient permissions.' },
      metadataSettled: true,
    });
    expect(denied.label).toBe('No access');

    const missing = assessFreshness({
      metadataDate: null,
      today: '2026-09-08',
      readError: null,
      metadataSettled: true,
    });
    expect(missing.label).toBe('No data');

    const current = assessFreshness({
      metadataDate: '2026-09-08',
      today: '2026-09-08',
      metadataSettled: true,
    });
    expect(current.level).toBe('ok');
  });

  it('defaults to settled, so no existing caller silently becomes pending', () => {
    // metadataSettled is optional. If the default were false, every screen that assesses
    // freshness without the live subscription would show "Checking" forever.
    expect(assessFreshness({ metadataDate: null, today: '2026-09-08' }).label).toBe('No data');
    expect(
      assessFreshness({ metadataDate: '2026-09-08', today: '2026-09-08' }).level
    ).toBe('ok');
  });

  it('a settled error still wins over a null metadata date', () => {
    // Ordering guard: `pending` is tested first, but once settled the readError branch must
    // still precede the "nobody imported" branch. This is the original F-09 defect.
    const r = assessFreshness({
      metadataDate: null,
      today: '2026-09-08',
      readError: { code: 'permission-denied' },
      metadataSettled: true,
    });
    expect(r.message).toMatch(/importing will not fix it/i);
  });
});
