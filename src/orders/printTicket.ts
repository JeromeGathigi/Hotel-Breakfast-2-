import { bangkokTime, formatBusinessDateDisplay } from '../lib/businessDate';
import { MENU_SOURCE } from '../data/foodExchangeMenu';
import { PAYMENT_LABEL, channelLabel, formatThb, orderTotals, type Order } from './orderModel';

/**
 * Printing a bill or a kitchen ticket from the browser, sized for an 80 mm receipt printer.
 *
 * Papaya prints straight to paired network printers; a web page cannot, so this prints through
 * the browser's dialog via a hidden frame (no pop-up for a blocker to stop). Every value is
 * escaped: guest names and notes come from Opera and from whoever typed the order.
 */

export const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

const STYLE = `
  @page { size: 80mm auto; margin: 4mm; }
  body { font: 12px/1.35 ui-monospace, Menlo, Consolas, monospace; color: #000; margin: 0; width: 72mm; }
  h1 { font-size: 15px; margin: 0 0 2px; text-align: center; }
  .c { text-align: center; } .r { text-align: right; } .b { font-weight: 700; } .big { font-size: 16px; }
  table { width: 100%; border-collapse: collapse; } td { vertical-align: top; padding: 1px 0; }
  hr { border: 0; border-top: 1px dashed #000; margin: 6px 0; }
  .note { font-weight: 700; padding-left: 10px; }
`;

/** A4, for reports. */
export const REPORT_STYLE = `
  @page { size: A4; margin: 14mm; }
  body { font: 11px/1.4 system-ui, sans-serif; color: #000; }
  h1 { font-size: 18px; margin: 0 0 4px; } h2 { font-size: 13px; margin: 14px 0 4px; }
  table { width: 100%; border-collapse: collapse; } th, td { text-align: left; padding: 3px 4px; border-bottom: 1px solid #ccc; }
  .r { text-align: right; }
`;

export function printHtml(title: string, body: string, style: string = STYLE) {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  document.body.appendChild(frame);
  const docu = frame.contentDocument;
  if (!docu) {
    frame.remove();
    return;
  }
  docu.open();
  docu.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${style}</style></head><body>${body}</body></html>`);
  docu.close();
  const win = frame.contentWindow;
  setTimeout(() => {
    win?.focus();
    win?.print();
    setTimeout(() => frame.remove(), 1000);
  }, 50);
}

const when = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : bangkokTime(d);
};

/** For the kitchen: what to cook, the notes in bold, no prices. */
export function printKitchenTicket(order: Order, lineIds: string[]) {
  const ids = new Set(lineIds);
  const lines = order.lines.filter((l) => ids.has(l.lineId));
  if (lines.length === 0) return;
  const rows = lines
    .map((l) => `<tr><td class="b big">${l.qty} ×</td><td class="big">${esc(l.name)}</td></tr>${l.note ? `<tr><td></td><td class="note">!! ${esc(l.note)}</td></tr>` : ''}`)
    .join('');
  printHtml(
    `Kitchen ${order.number}`,
    `<h1>KITCHEN</h1><p class="c b big">${esc(channelLabel(order))} · ${esc(order.number)}</p>
     <p class="c">${order.covers} cover${order.covers === 1 ? '' : 's'} · sent ${esc(when(lines[0].sentAt ?? new Date().toISOString()))}</p><hr>
     <table>${rows}</table><hr><p class="c">by ${esc(order.updatedBy)}</p>`
  );
}

/** The guest's bill: items, +++ breakdown, payments so far, and what is still owed. */
export function printBill(order: Order) {
  const t = orderTotals(order);
  const items = order.lines
    .filter((l) => l.status !== 'void')
    .map((l) => `<tr><td>${l.qty} × ${esc(l.name)}</td><td class="r">${formatThb(l.unitPriceThb * l.qty)}</td></tr>`)
    .join('');
  const money = (label: string, v: number, cls = '') => `<tr class="${cls}"><td>${label}</td><td class="r">${formatThb(v)}</td></tr>`;
  const payments = order.payments
    .map((p) => money(`${esc(PAYMENT_LABEL[p.method])}${p.roomNumber ? ` (room ${esc(p.roomNumber)})` : ''}`, p.amountThb))
    .join('');
  printHtml(
    `Bill ${order.number}`,
    `<h1>${esc(MENU_SOURCE.outlet)}</h1><p class="c">${esc(MENU_SOURCE.hotelName)}</p>
     <p class="c">${esc(order.number)} · ${esc(channelLabel(order))}${order.guestName ? ` · ${esc(order.guestName)}` : ''}</p>
     <p class="c">${esc(formatBusinessDateDisplay(order.businessDate))} · ${esc(when(new Date().toISOString()))} · ${order.covers} cover${order.covers === 1 ? '' : 's'}</p><hr>
     <table>${items}</table><hr>
     <table>
       ${money('Subtotal', t.subtotalThb)}
       ${t.discountThb ? money(`Discount${order.discount ? ` (${esc(order.discount.reason)})` : ''}`, -t.discountThb) : ''}
       ${money(`Service charge ${Math.round(order.serviceChargeRate * 100)}%`, t.serviceChargeThb)}
       ${money(`VAT ${Math.round(order.vatRate * 100)}%`, t.vatThb)}
       ${money('TOTAL', t.totalThb, 'b big')}
       ${payments}
       ${t.paidThb ? money('Still to pay', t.outstandingThb, 'b') : ''}
     </table><hr>
     ${order.channel === 'room' || order.payments.some((p) => p.method === 'room') ? '<p>Room charge - guest signature:</p><p>&nbsp;</p><p>______________________________</p>' : ''}
     <p class="c">Thank you</p>`
  );
}
