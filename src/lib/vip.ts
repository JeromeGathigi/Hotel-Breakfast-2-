/**
 * Opera VIP codes, as the property defines them.
 *
 * Source: "Opera Guest Meal Checker - Full Project Summary" (May 2026), section 5. The previous
 * table in src/constants.ts was invented and wrong at every level: it called VIP 2 "Silver"
 * (the property's VIP 2 is ALL Gold), VIP 3 "Gold" (ALL Platinum), VIP 4 "Platinum" - hiding that
 * VIP 4 is a DISABLED GUEST, which matters for seating - and VIP 7 "GM Guest" (the property's
 * VIP 7 is the Accor owner, a head of state or a CEO). It also had no VIP 0, which is the black
 * list.
 *
 * The real exports corroborate the mapping: on the 2 Sep Novotel export every room whose note says
 * "Non-ALL member guest" has no VIP code at all, and room 440 (VIP 1) carries an "ALL-Accor
 * membership must be presented" note.
 */

export type VipTone = 'black' | 'grey' | 'gold' | 'blue' | 'orange' | 'red';

export interface VipInfo {
  /** The digit as Opera exports it, '0'-'7'. */
  code: string;
  /** Short badge text. The spec asks for this only - never the description - next to a name. */
  label: string;
  /** Who the code covers, for the legend and the badge tooltip. */
  description: string;
  tone: VipTone;
  /** Spec: VIP 2 and 3 get a gold shimmer, VIP 6 and 7 a deep red premium style. */
  emphasis: 'none' | 'shimmer' | 'premium';
  /** A code the door should act on, not merely acknowledge. */
  operational?: 'black-list' | 'accessibility';
}

export const VIP_CODES: VipInfo[] = [
  { code: '0', label: 'VIP 0', tone: 'black', emphasis: 'none', operational: 'black-list', description: 'Black list' },
  {
    code: '1',
    label: 'VIP 1',
    tone: 'grey',
    emphasis: 'none',
    description: 'Current or previous guest feedback (complaint), ALL Silver guest, Accor employee',
  },
  {
    code: '2',
    label: 'VIP 2',
    tone: 'gold',
    emphasis: 'shimmer',
    description:
      'ALL Gold guest, meeting planner, hotel Gold Card holders, Partner Accor Advantage Plus, guests with 31-60 stays, other travel agents',
  },
  { code: '3', label: 'VIP 3', tone: 'gold', emphasis: 'shimmer', description: 'ALL Platinum, Accor HQ management staff' },
  { code: '4', label: 'VIP 4', tone: 'blue', emphasis: 'none', operational: 'accessibility', description: 'Disabled guest' },
  {
    code: '5',
    label: 'VIP 5',
    tone: 'orange',
    emphasis: 'none',
    description: 'VP, ALL Diamond, decision maker, journalist, influencer, local celebrities',
  },
  {
    code: '6',
    label: 'VIP 6',
    tone: 'red',
    emphasis: 'premium',
    description:
      'Top government officials, international celebrities, ALL Limitless, managing directors of luxury travel agencies, wedding',
  },
  {
    code: '7',
    label: 'VIP 7',
    tone: 'red',
    emphasis: 'premium',
    description: 'Accor owner, president, head of state, CEOs, dignitaries, Accor Comex members',
  },
];

const BY_CODE = new Map(VIP_CODES.map((v) => [v.code, v]));

/**
 * Normalises what Opera puts in the VIP column ("3", "VIP3", "V 3") to a code.
 * Returns null for an empty value. A value that is present but not one of the property's codes
 * is returned as an "unrecognised" entry rather than dropped, so it is still visible to staff.
 */
export function vipInfo(raw: string | number | null | undefined): VipInfo | null {
  const value = String(raw ?? '').trim();
  if (!value) return null;
  const m = value.match(/^(?:VIP|V)?\s*(\d)$/i);
  if (m && BY_CODE.has(m[1])) return BY_CODE.get(m[1])!;
  return {
    code: value,
    label: `VIP ${value}`,
    tone: 'grey',
    emphasis: 'none',
    description: `"${value}" is not one of the property's VIP codes (0-7). Check the profile in Opera.`,
  };
}

/** Tailwind classes per tone. Kept with the data so the legend and the badge cannot drift. */
export const VIP_TONE_CLASSES: Record<VipTone, string> = {
  black: 'bg-black text-white border border-black',
  grey: 'bg-slate-200 text-slate-800 border border-slate-300',
  gold: 'bg-amber-100 text-amber-900 border border-amber-400',
  blue: 'bg-sky-100 text-sky-900 border border-sky-400',
  orange: 'bg-orange-100 text-orange-900 border border-orange-400',
  red: 'bg-red-800 text-white border border-red-950',
};
