/**
 * Turns a real Opera "Guests INH - By Room" export into a committable test fixture.
 *
 *   node scripts/anonymizeFixture.mjs <source.txt> <destination.tsv>
 *
 * Replaces every personal name with a stable pseudonym and leaves absolutely everything
 * else byte-identical: column order, rate codes, comment text, VIP tiers, room numbers,
 * the raw newlines inside RES_COMMENT, and the column-shifted records. Those quirks are
 * the whole reason the fixture is worth having — a hand-written fixture proves nothing,
 * because every bug found in this parser came from a structure nobody would have invented.
 *
 * Names are collected from the name columns and then substituted across the *entire*
 * file, so names appearing inside comments are scrubbed too.
 */

import { readFileSync, writeFileSync } from 'node:fs';

const NAME_COLUMNS = ['GUEST_NAME', 'FULL_NAME', 'SHARE_NAMES', 'ACCOMPANYING_NAMES'];

const SURNAMES = [
  'Alder', 'Bramwell', 'Calder', 'Dunmore', 'Ellery', 'Fenwick', 'Garrow', 'Halloran',
  'Ingersoll', 'Jarrow', 'Kelbrook', 'Lanmore', 'Marchetti', 'Norbury', 'Oakhurst',
  'Pemberton', 'Quillon', 'Rathbone', 'Селby', 'Thackery', 'Underhill', 'Vasquez',
  'Whitlock', 'Yarrow', 'Zeller', 'Ashcombe', 'Bellamy', 'Cranfield', 'Drummond',
  'Eastwick', 'Farriday', 'Grantham', 'Hollibrook', 'Ivorson', 'Jessamy',
].map((s) => s.normalize('NFKD').replace(/[^\x20-\x7E]/g, 'e'));

const GIVEN_NAMES = [
  'Alina', 'Bertram', 'Cassia', 'Dorian', 'Elowen', 'Ferris', 'Giselle', 'Hadrian',
  'Isolde', 'Jorah', 'Kestrel', 'Linus', 'Mirabel', 'Nolan', 'Ottoline', 'Peregrine',
  'Quenby', 'Rosalind', 'Soren', 'Tamsin', 'Ulric', 'Verity', 'Wilder', 'Xanthe',
  'Yolande', 'Zephyr', 'Amory', 'Briony', 'Corvin', 'Delphine', 'Emrys', 'Fable',
];

const [, , sourcePath, destinationPath] = process.argv;
if (!sourcePath || !destinationPath) {
  console.error('usage: node scripts/anonymizeFixture.mjs <source.txt> <destination.tsv>');
  process.exit(1);
}

const raw = readFileSync(sourcePath, 'utf8').replace(/^﻿/, '');
const lines = raw.split(/\r?\n/);
const headerLine = lines[0];
const header = headerLine.split('\t').map((h) => h.trim());
const nameIndices = NAME_COLUMNS.map((c) => header.indexOf(c)).filter((i) => i !== -1);

/**
 * Words that must survive untouched or the fixture stops testing what it is for.
 *
 * Learned the hard way: the first run replaced the `ROOM` header itself with a
 * pseudonym, because a guest name token happened to collide with it. The parser
 * rejected the fixture outright — which is the right behaviour, but a looser parser
 * would have silently produced a roomless import.
 */
const PROTECTED = new Set([
  // Every header field name, whole and split on underscores.
  ...header.flatMap((h) => [h, ...h.split('_')]).map((w) => w.trim().toLowerCase()),
  // Domain vocabulary that drives classification.
  'comp', 'mbreak', 'paid', 'incl', 'res', 'gen', 'room', 'rate', 'code', 'adults',
  'children', 'breakfast', 'board', 'half', 'full', 'reservation', 'general', 'vip',
  'novotel', 'ibis', 'accor', 'plus', 'incognito', 'upgrade', 'requested', 'adjacent',
]);

// Collect every name token that appears in a name column.
const tokens = new Set();
for (const line of lines.slice(1)) {
  const fields = line.split('\t');
  for (const index of nameIndices) {
    const value = fields[index];
    if (!value) continue;
    for (const token of value.split(/[,/\s]+/)) {
      const clean = token.trim().replace(/\.$/, '');
      // Skip honorifics and anything too short to be identifying.
      if (clean.length < 3) continue;
      if (/^(mr|ms|mrs|dr|khun|prof|miss|master)$/i.test(clean)) continue;
      if (!/^[A-Za-z][A-Za-z'-]*$/.test(clean)) continue;
      if (PROTECTED.has(clean.toLowerCase())) continue;
      tokens.add(clean.toLowerCase());
    }
  }
}

// Deterministic mapping, longest-first so "Goradiya" is replaced before "Gora".
const ordered = [...tokens].sort((a, b) => b.length - a.length || a.localeCompare(b));
const mapping = new Map();
ordered.forEach((token, i) => {
  const pool = i % 2 === 0 ? SURNAMES : GIVEN_NAMES;
  const base = pool[i % pool.length];
  const suffix = Math.floor(i / pool.length);
  mapping.set(token, suffix > 0 ? `${base}${suffix}` : base);
});

/** Mirror the source token's casing so ALL-CAPS columns stay ALL-CAPS. */
function matchCase(source, replacement) {
  if (source === source.toUpperCase()) return replacement.toUpperCase();
  if (source === source.toLowerCase()) return replacement.toLowerCase();
  return replacement.charAt(0).toUpperCase() + replacement.slice(1).toLowerCase();
}

// Substitute across the body only. The header line is copied verbatim so column
// names can never be renamed.
let body = raw.slice(headerLine.length);
for (const token of ordered) {
  const replacement = mapping.get(token);
  const pattern = new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&')}\\b`, 'gi');
  body = body.replace(pattern, (match) => matchCase(match, replacement));
}
const output = headerLine + body;

writeFileSync(destinationPath, output, 'utf8');

// The header must be untouched, or the fixture is not a fixture.
if (output.split(/\r?\n/)[0] !== headerLine) {
  console.error('!! header was modified — aborting');
  process.exit(1);
}

// Verify no original token survives anywhere in the body.
const leaked = ordered.filter((t) => new RegExp(`\\b${t}\\b`, 'i').test(body));

console.log(`source:       ${sourcePath}`);
console.log(`destination:  ${destinationPath}`);
console.log(`name tokens:  ${ordered.length} replaced`);
console.log(`bytes:        ${raw.length} -> ${output.length}`);
console.log(`lines:        ${lines.length} (preserved: ${output.split(/\r?\n/).length})`);
console.log(leaked.length ? `!! LEAKED: ${leaked.join(', ')}` : 'leak check: clean');
process.exit(leaked.length ? 1 : 0);
