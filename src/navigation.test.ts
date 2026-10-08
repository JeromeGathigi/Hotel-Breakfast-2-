import { describe, expect, it } from 'vitest';
import { NAV, NAV_GROUPS, canSee, isView, navGroups, type View } from './navigation';
import type { Role } from './lib/access';

const seen = (role: Role, hotel: string): View[] => navGroups(role, hotel).flatMap((g) => g.items.map((i) => i.id));

describe('what each role sees', () => {
  it('gives door staff the door and, at Novotel, the Food Exchange', () => {
    expect(seen('staff', 'novotel')).toEqual(['door', 'floor', 'orders', 'kitchen', 'menu']);
    expect(seen('staff', 'ibis')).toEqual(['door', 'floor']);
  });

  it('adds the reports and settings for a manager, but not the Opera import', () => {
    expect(seen('manager', 'novotel')).toEqual(['door', 'floor', 'orders', 'kitchen', 'menu', 'manifest', 'forecast', 'analytics', 'sales', 'settings']);
    expect(seen('manager', 'ibis')).toEqual(['door', 'floor', 'manifest', 'forecast', 'analytics', 'settings']);
  });

  it('adds the Opera import for an administrator', () => {
    expect(seen('admin', 'novotel')).toEqual(['door', 'floor', 'orders', 'kitchen', 'menu', 'manifest', 'forecast', 'analytics', 'sales', 'import', 'settings']);
    expect(seen('admin', 'ibis')).toContain('import');
  });

  it('shows nothing to an account without a role', () => {
    expect(seen('none', 'novotel')).toEqual([]);
    expect(canSee('door', 'none', 'novotel')).toBe(false);
  });

  it('never shows a Food Exchange screen at ibis, whatever the role', () => {
    for (const role of ['staff', 'manager', 'admin'] as const) {
      for (const v of ['orders', 'kitchen', 'menu', 'sales'] as const) expect(canSee(v, role, 'ibis')).toBe(false);
    }
  });

  it('keeps the groups in order and every screen in exactly one of them', () => {
    expect(navGroups('admin', 'novotel').map((g) => g.group)).toEqual([...NAV_GROUPS]);
    expect(new Set(NAV.map((n) => n.id)).size).toBe(NAV.length);
    expect(NAV.every((n) => NAV_GROUPS.includes(n.group))).toBe(true);
  });
});

describe('isView', () => {
  it('accepts screen ids and nothing else, so a typed address cannot open an unknown screen', () => {
    expect(isView('kitchen')).toBe(true);
    expect(isView('')).toBe(false);
    expect(isView('admin')).toBe(false);
  });
});
