import { describe, it, expect } from 'vitest';
import { VIP_CODES, vipInfo } from './vip';

describe('VIP codes follow the property spec, not the invented table', () => {
  it('has all eight codes, 0 to 7', () => {
    expect(VIP_CODES.map((v) => v.code)).toEqual(['0', '1', '2', '3', '4', '5', '6', '7']);
  });

  it('maps the codes the way the property does', () => {
    // The old table said 2 = Silver, 3 = Gold, 4 = Platinum, 7 = GM Guest. Every one was wrong.
    expect(vipInfo('2')?.description).toMatch(/ALL Gold/);
    expect(vipInfo('3')?.description).toMatch(/ALL Platinum/);
    expect(vipInfo('5')?.description).toMatch(/ALL Diamond/);
    expect(vipInfo('6')?.description).toMatch(/ALL Limitless/);
    expect(vipInfo('7')?.description).toMatch(/head of state/i);
  });

  it('surfaces the two codes the door must act on', () => {
    expect(vipInfo('0')).toMatchObject({ operational: 'black-list', tone: 'black' });
    expect(vipInfo('4')).toMatchObject({ operational: 'accessibility', description: 'Disabled guest' });
  });

  it('applies the spec styling: gold shimmer for 2 and 3, red premium for 6 and 7', () => {
    expect(['2', '3'].map((c) => vipInfo(c)?.emphasis)).toEqual(['shimmer', 'shimmer']);
    expect(['6', '7'].map((c) => vipInfo(c)?.emphasis)).toEqual(['premium', 'premium']);
  });

  it('shows the short label only', () => {
    expect(vipInfo('3')?.label).toBe('VIP 3');
  });

  it('normalises the forms Opera may export, and keeps an unknown value visible', () => {
    expect(vipInfo('VIP3')?.code).toBe('3');
    expect(vipInfo(' v 5 ')?.code).toBe('5');
    expect(vipInfo('')).toBeNull();
    expect(vipInfo(null)).toBeNull();
    expect(vipInfo('GOLD')?.description).toMatch(/not one of the property's VIP codes/);
  });
});
