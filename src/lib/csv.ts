/**
 * CSV export that is safe to open in Excel.
 *
 * Guest names, company names and notes come from Opera, and many of them were typed by whoever
 * made the booking - an OTA customer, a travel agent. A value beginning with = + - @ (or a tab or
 * carriage return) is executed as a FORMULA when the file is opened in Excel or Sheets, which is the
 * classic CSV-injection route to running a command or exfiltrating the sheet. The manifest export
 * quoted values but did not neutralise them. Such cells are now prefixed with an apostrophe, which
 * spreadsheet apps treat as "this is text".
 */
const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '""';
  let text = String(value);
  if (FORMULA_START.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

/** A complete CSV document, with a BOM so Excel reads Thai and accented names as UTF-8. */
export function toCsv(headers: string[], rows: unknown[][]): string {
  return '﻿' + [headers.map(csvCell).join(','), ...rows.map((r) => r.map(csvCell).join(','))].join('\r\n');
}

/** Triggers a browser download of a CSV document. */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
