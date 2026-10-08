import type { GuestNote } from '../types';

/**
 * What the front office's reservation notes say about breakfast.
 *
 * The property's own spec (May 2026, section 4) makes notes part of the entitlement rule: "DSO and
 * DAF are NOT fixed breakfast - they depend entirely on comments". On the 2 Sep Novotel export
 * 97 of 108 rooms carry notes and the front office writes the arrangement in them directly:
 *
 *     PM : 2 : RB                          38 rooms   RB = room and breakfast
 *     GA RO AT 1,170+++ ON 2-3/9 ...                  RO = room only
 *     GA COMP BF AT 1,710+++ ...                      complimentary breakfast
 *     GA RO AT 1430+++ ... PAID ABF 1800NET           room only, breakfast paid separately
 *
 * Measured against Opera's own per-reservation package attachments for the same day, a note that
 * says breakfast agreed with Opera on every Novotel room that had both - including five rooms on
 * rate codes Accor's referential calls Room Only. The ibis export carries no notes at all.
 *
 * Two departures from the spec's literal rule, both on evidence:
 *  - the spec matches the substring "BF" only, which misses RB and BB - the commonest note there
 *    is "PM : 2 : RB". Tokens are matched on word boundaries instead (so BF350NET, a product code,
 *    is not mistaken for a stated plan, and TRIPRO is not "RO");
 *  - the spec counts MBREAK as breakfast. The only note that mentions it reads "GA RO ... MBREAK
 *    AT 400+++" - room only plus a meeting break - so MBREAK is reported as its own flag and the
 *    caller decides, rather than silently picking a side.
 */

export type NoteVerdict = 'BF' | 'RO' | null;

export interface NoteSignal {
  /** 'BF' breakfast stated, 'RO' room only stated, null nothing said. */
  verdict: NoteVerdict;
  /** A short excerpt of the note that decided it, for display. Empty when verdict is null. */
  evidence: string;
  /** Some note mentions MBREAK, which the spec and the data disagree about. */
  mentionsMbreak: boolean;
}

/** "No breakfast", "without BF", "excl. ABF", "breakfast not included". Checked first. */
const NEGATED_BREAKFAST =
  /\b(?:NO|WITHOUT|W\/O|EXCL(?:UDING|UDED|\.)?|NOT\s+INCL(?:UDING|UDED|\.)?)\s+(?:A?BF|BREAKFAST|B\/F)\b|\bBREAKFAST\s+(?:NOT\s+INCLUDED|EXCLUDED)\b/i;

/** RB, BB, ABF, BF, COMP BF, "breakfast", "B/F" as whole tokens. */
const BREAKFAST = /\b(?:RB|BB|ABF|BF|BREAKFAST|B\/F)\b/i;

/** RO or "room only" as whole tokens - never the RO inside TRIPRO, EURO or PROMO. */
const ROOM_ONLY = /\b(?:RO|ROOM\s+ONLY)\b/i;

const MBREAK = /\bMBREAK\b/i;

function excerpt(text: string, match: RegExpMatchArray): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  const at = Math.max(0, flat.toUpperCase().indexOf(match[0].toUpperCase().replace(/\s+/g, ' ')));
  const start = Math.max(0, at - 12);
  const clip = flat.slice(start, at + match[0].length + 24).trim();
  return (start > 0 ? '…' : '') + clip + (at + match[0].length + 24 < flat.length ? '…' : '');
}

export function breakfastFromNotes(notes: GuestNote[] | undefined | null): NoteSignal {
  const texts = (notes ?? []).map((n) => String(n?.text ?? '')).filter(Boolean);
  const mentionsMbreak = texts.some((t) => MBREAK.test(t));

  for (const t of texts) {
    const m = t.match(NEGATED_BREAKFAST);
    if (m) return { verdict: 'RO', evidence: excerpt(t, m), mentionsMbreak };
  }
  // A note stating breakfast beats one stating room only: "GA RO ... PAID ABF" is a room-only
  // rate with breakfast bought on top, and the guest has paid for it.
  for (const t of texts) {
    const m = t.match(BREAKFAST);
    if (m) return { verdict: 'BF', evidence: excerpt(t, m), mentionsMbreak };
  }
  for (const t of texts) {
    const m = t.match(ROOM_ONLY);
    if (m) return { verdict: 'RO', evidence: excerpt(t, m), mentionsMbreak };
  }
  return { verdict: null, evidence: '', mentionsMbreak };
}
