import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { OWNER_ADMIN_EMAILS, STAFF_EMAIL_DOMAIN, canEditFloorPlan, canImport, canMaintainData, canManage, canMarkSoldOut, canUseDoor, resolveRole } from './access';

const rules = readFileSync(join(process.cwd(), 'firestore.rules'), 'utf8').split('\r\n').join('\n');
const setClaims = readFileSync(join(process.cwd(), 'scripts', 'setClaims.ts'), 'utf8');

describe('resolveRole', () => {
  it('reads the role claim that scripts/setClaims.ts writes', () => {
    for (const role of ['admin', 'manager', 'staff'] as const) {
      expect(resolveRole({ email: 'x@gmail.com', emailVerified: true, claims: { role } })).toBe(role);
    }
  });

  it('still honours the legacy boolean claims', () => {
    expect(resolveRole({ email: 'x@gmail.com', claims: { admin: true } })).toBe('admin');
    expect(resolveRole({ email: 'x@gmail.com', claims: { staff: true } })).toBe('staff');
  });

  it('keeps the owner an administrator, and only with a verified address', () => {
    expect(resolveRole({ email: 'jeromegathigi@gmail.com', emailVerified: true })).toBe('admin');
    expect(resolveRole({ email: 'JeromeGathigi@gmail.com ', emailVerified: true })).toBe('admin');
    expect(resolveRole({ email: 'jeromegathigi@gmail.com', emailVerified: false })).toBe('none');
  });

  it('gives verified Accor addresses door access and nothing more', () => {
    expect(resolveRole({ email: 'host@accor.com', emailVerified: true })).toBe('staff');
    expect(resolveRole({ email: 'host@accor.com', emailVerified: false })).toBe('none');
    expect(resolveRole({ email: 'host@accor.com.evil.example', emailVerified: true })).toBe('none');
    expect(resolveRole({ email: 'manager.trainee@gmail.com', emailVerified: true })).toBe('none');
  });

  it('no longer promotes the two addresses only the old client list knew', () => {
    // gm@novotel-chiangmai.com and manager@ibis-chiangmai.com were "admins" in the UI only; the
    // database refused them. They now get exactly what the database gives them: nothing, until a
    // claim is set.
    expect(resolveRole({ email: 'gm@novotel-chiangmai.com', emailVerified: true })).toBe('none');
    expect(resolveRole({ email: 'manager@ibis-chiangmai.com', emailVerified: true })).toBe('none');
  });

  it('nests the capabilities', () => {
    expect([canManage('manager'), canManage('staff')]).toEqual([true, false]);
    expect([canUseDoor('staff'), canUseDoor('none')]).toEqual([true, false]);
    expect([canMaintainData('admin'), canMaintainData('manager')]).toEqual([true, false]);
  });

  it("follows the owner's 8 Oct decisions: managers import and keep the floor plan; anyone at the door sells out a dish", () => {
    expect([canImport('manager'), canImport('staff')]).toEqual([true, false]);
    expect([canEditFloorPlan('manager'), canEditFloorPlan('staff')]).toEqual([true, false]);
    expect([canMarkSoldOut('staff'), canMarkSoldOut('none')]).toEqual([true, false]);
  });
});

describe('the app and firestore.rules agree', () => {
  it('on the owner admin list, exactly', () => {
    const m = rules.match(/mail\(\) in \[([^\]]+)\]/);
    expect(m, 'rules must list the owner admins').toBeTruthy();
    const inRules = m![1].split(',').map((s) => s.trim().replace(/^'|'$/g, ''));
    expect(inRules.sort()).toEqual([...OWNER_ADMIN_EMAILS].sort());
  });

  it('on the staff domain', () => {
    expect(rules).toContain(`'^[^@]+@${STAFF_EMAIL_DOMAIN.replace('.', '[.]')}$'`);
  });

  it('on the claim the script writes', () => {
    expect(setClaims).toMatch(/\{ role \}/);
    expect(rules).toMatch(/claims\(\)\.get\('role', ''\)/);
  });

  it('requires a verified address wherever email decides access', () => {
    expect(rules).toMatch(/verified\(\) && mail\(\) in/);
    expect(rules).toMatch(/verified\(\) && mail\(\)\.matches/);
  });

  it('lets staff write audit entries only as themselves, never edit them, and leaves reading them to managers', () => {
    const block = rules.slice(rules.indexOf('match /auditLogs/'));
    expect(block).toMatch(/allow read: if isManager\(\);/);
    expect(block).toMatch(/allow create: if isStaff\(\) && writtenAsSelf\('userEmail'\)/);
    expect(block).toMatch(/allow update, delete: if false/);
  });

  it("keeps a bill's manager-only changes out of a host's reach", () => {
    const block = rules.slice(rules.indexOf('match /orders/'), rules.indexOf('match /counters/'));
    const hostBranch = block.slice(block.indexOf('isManager() ||'));
    for (const guarded of [
      'request.resource.data.discount == resource.data.discount',
      'request.resource.data.compThb == resource.data.compThb',
      "request.resource.data.get('servedVoidThb', 0) == resource.data.get('servedVoidThb', 0)",
      'request.resource.data.payments.size() >= resource.data.payments.size()',
    ]) {
      expect(hostBranch).toContain(guarded);
    }
    expect(block).toMatch(/allow delete: if false/);
  });

  it('gives the same people the same writes as the app', () => {
    const block = (path: string, next: string) => rules.slice(rules.indexOf(`match /${path}`), rules.indexOf(`match /${next}`));
    // Imports (canImport): managers.
    for (const [path, next] of [['guests/', 'metadata/'], ['metadata/', 'forecasts/'], ['forecasts/', 'history/'], ['history/{date} {', 'history/{date}/guests/'], ['history/{date}/guests/', 'checkins/']]) {
      expect(block(path, next), path).toMatch(/allow write: if isManager\(\);/);
    }
    // The floor plan (canEditFloorPlan): managers; hosts change occupancy only.
    expect(block('tables/', 'layouts/')).toMatch(/allow create, delete: if isManager\(\);/);
    expect(block('tables/', 'layouts/')).toMatch(/allow update: if isManager\(\) \|\| \(\s*isStaff\(\) &&/);
    expect(block('layouts/', 'auditLogs/')).toMatch(/allow write: if isManager\(\);/);
    // Sold out (canMarkSoldOut): anyone at the door, as themselves; never deleted.
    expect(block('menuState/', 'daily_summaries/')).toMatch(/allow create, update: if isStaff\(\) && writtenAsSelf\('updatedBy'\);/);
    expect(block('menuState/', 'daily_summaries/')).toMatch(/allow delete: if false;/);
    // Data maintenance (canMaintainData) is the only thing left to administrators.
    expect(rules.match(/allow [a-z, ]+: if isAdmin\(\);/g)).toEqual(['allow delete: if isAdmin();']);
  });

  it('has no catch-all match', () => {
    expect(rules).not.toMatch(/\{allChildren=\*\*\}/);
  });
});
