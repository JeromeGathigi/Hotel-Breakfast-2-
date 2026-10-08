import { bangkokHour } from '../lib/businessDate';
import { channelLabel, orderTotals, type Order, type PaymentMethod } from './orderModel';

/**
 * The shift and day report - what Papaya calls the revenue report, the comps report, the tax
 * report and the staff report, from the same orders.
 *
 * Revenue counts CLOSED orders only. An order still open at the end of a shift is listed
 * separately with what it owes, because a report that silently included half-paid bills, or
 * silently left them out, would not reconcile with the drawer.
 *
 * Complimentary payments are not revenue. When part of a bill is comped, its net, service charge
 * and VAT are shared out in proportion, so revenue + comps always equals the bills' totals.
 */

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface ItemSales {
  menuItemId: string;
  name: string;
  qty: number;
  netThb: number;
}

export interface RoomCharge {
  orderNumber: string;
  businessDate: string;
  roomNumber: string;
  guestName: string;
  amountThb: number;
  at: string;
  by: string;
}

/**
 * What each person did on the bills: the revenue they closed, and the exceptions - voids,
 * discounts, comps, cancellations - that a manager reviews person by person. URY's staff
 * performance and POSR's "voids and discounts by order taker", from the systems surveyed on
 * 8 Oct 2026.
 */
export interface StaffSummary {
  email: string;
  opened: number;
  closed: number;
  revenueThb: number;
  voids: number;
  voidThb: number;
  discounts: number;
  discountThb: number;
  comps: number;
  compThb: number;
  cancelled: number;
}

/** Who voided a line: recorded on it since 8 Oct 2026, read from the order's history before. */
function voidedBy(o: Order, l: Order['lines'][number]): string {
  if (l.voidedBy) return l.voidedBy;
  const entry = o.log.find((e) => e.action === 'item-voided' && e.details.startsWith(`${l.qty} × ${l.name}`));
  return entry?.by ?? o.updatedBy;
}

export interface SalesSummary {
  orderCount: { open: number; complete: number; cancelled: number };
  covers: number;
  netSalesThb: number;
  serviceChargeThb: number;
  vatThb: number;
  /** What guests paid: closed bills' totals less complimentary amounts. */
  revenueThb: number;
  discountThb: number;
  compThb: number;
  averagePerCoverThb: number | null;
  byMethod: Record<PaymentMethod, number>;
  byItem: ItemSales[];
  byHour: Array<{ hour: number; orders: number; revenueThb: number }>;
  byStaff: StaffSummary[];
  roomCharges: RoomCharge[];
  /** `served`: voided after it reached the table - a manager's call. */
  voids: Array<{ orderNumber: string; item: string; qty: number; netThb: number; reason: string; served: boolean }>;
  cancellations: Array<{ orderNumber: string; reason: string; by: string; at: string }>;
  stillOpen: Array<{ orderNumber: string; where: string; totalThb: number; outstandingThb: number }>;
}

export function summariseOrders(orders: Order[]): SalesSummary {
  const s: SalesSummary = {
    orderCount: { open: 0, complete: 0, cancelled: 0 },
    covers: 0,
    netSalesThb: 0,
    serviceChargeThb: 0,
    vatThb: 0,
    revenueThb: 0,
    discountThb: 0,
    compThb: 0,
    averagePerCoverThb: null,
    byMethod: { cash: 0, card: 0, qr: 0, room: 0, comp: 0 },
    byItem: [],
    byHour: [],
    byStaff: [],
    roomCharges: [],
    voids: [],
    cancellations: [],
    stillOpen: [],
  };
  const items = new Map<string, ItemSales>();
  const hours = new Map<number, { orders: number; revenueThb: number }>();
  const staff = new Map<string, Omit<StaffSummary, 'email'>>();
  const person = (email: string) => {
    let p = staff.get(email);
    if (!p) staff.set(email, (p = { opened: 0, closed: 0, revenueThb: 0, voids: 0, voidThb: 0, discounts: 0, discountThb: 0, comps: 0, compThb: 0, cancelled: 0 }));
    return p;
  };

  for (const o of orders) {
    s.orderCount[o.status] += 1;
    if (o.status !== 'cancelled') person(o.createdBy).opened += 1;

    for (const l of o.lines) {
      if (l.status !== 'void') continue;
      const netThb = round2(l.unitPriceThb * l.qty);
      s.voids.push({ orderNumber: o.number, item: l.name, qty: l.qty, netThb, reason: l.voidReason ?? '', served: Boolean(l.servedAt) });
      const who = person(voidedBy(o, l));
      who.voids += 1;
      who.voidThb += netThb;
    }
    for (const p of o.payments) {
      if (p.method !== 'comp') continue;
      const who = person(p.by);
      who.comps += 1;
      who.compThb += p.amountThb;
    }

    if (o.status === 'cancelled') {
      s.cancellations.push({ orderNumber: o.number, reason: o.cancelReason ?? '', by: o.closedBy ?? o.updatedBy, at: o.closedAt ?? o.updatedAt });
      person(o.closedBy ?? o.updatedBy).cancelled += 1;
      continue;
    }

    const t = orderTotals(o);
    if (o.discount && t.discountThb > 0) {
      const who = person(o.discount.by);
      who.discounts += 1;
      who.discountThb += t.discountThb;
    }
    if (o.status === 'open') {
      s.stillOpen.push({ orderNumber: o.number, where: channelLabel(o), totalThb: t.totalThb, outstandingThb: t.outstandingThb });
      continue;
    }

    // Closed bills from here on.
    const comp = o.payments.filter((p) => p.method === 'comp').reduce((a, p) => a + p.amountThb, 0);
    const share = t.totalThb > 0 ? (t.totalThb - comp) / t.totalThb : 0;
    const revenue = round2(t.totalThb - comp);
    // Per bill, VAT is the remainder, so net + service + VAT is exactly what the guest paid.
    const net = round2((t.subtotalThb - t.discountThb) * share);
    const service = round2(t.serviceChargeThb * share);
    s.covers += o.covers;
    s.netSalesThb += net;
    s.serviceChargeThb += service;
    s.vatThb += round2(revenue - net - service);
    s.revenueThb += revenue;
    s.discountThb += t.discountThb;
    s.compThb += comp;

    for (const p of o.payments) {
      s.byMethod[p.method] += p.amountThb;
      if (p.method === 'room') {
        s.roomCharges.push({
          orderNumber: o.number,
          businessDate: o.businessDate,
          roomNumber: p.roomNumber ?? '',
          guestName: p.guestName ?? '',
          amountThb: p.amountThb,
          at: p.at,
          by: p.by,
        });
      }
    }

    for (const l of o.lines) {
      if (l.status === 'void') continue;
      let it = items.get(l.menuItemId);
      if (!it) items.set(l.menuItemId, (it = { menuItemId: l.menuItemId, name: l.name, qty: 0, netThb: 0 }));
      it.qty += l.qty;
      it.netThb += l.unitPriceThb * l.qty;
    }

    const opened = new Date(o.createdAt);
    if (!Number.isNaN(opened.getTime())) {
      const h = bangkokHour(opened);
      const slot = hours.get(h) ?? { orders: 0, revenueThb: 0 };
      slot.orders += 1;
      slot.revenueThb += revenue;
      hours.set(h, slot);
    }

    const closer = person(o.closedBy ?? o.updatedBy);
    closer.closed += 1;
    closer.revenueThb += revenue;
  }

  s.netSalesThb = round2(s.netSalesThb);
  s.serviceChargeThb = round2(s.serviceChargeThb);
  s.vatThb = round2(s.vatThb);
  s.revenueThb = round2(s.revenueThb);
  s.discountThb = round2(s.discountThb);
  s.compThb = round2(s.compThb);
  for (const k of Object.keys(s.byMethod) as PaymentMethod[]) s.byMethod[k] = round2(s.byMethod[k]);
  s.averagePerCoverThb = s.covers > 0 ? round2(s.revenueThb / s.covers) : null;
  s.byItem = [...items.values()].map((i) => ({ ...i, netThb: round2(i.netThb) })).sort((a, b) => b.netThb - a.netThb || b.qty - a.qty);
  s.byHour = [...hours.entries()].map(([hour, v]) => ({ hour, orders: v.orders, revenueThb: round2(v.revenueThb) })).sort((a, b) => a.hour - b.hour);
  s.byStaff = [...staff.entries()]
    .map(([email, v]) => ({ email, ...v, revenueThb: round2(v.revenueThb), voidThb: round2(v.voidThb), discountThb: round2(v.discountThb), compThb: round2(v.compThb) }))
    .sort((a, b) => b.revenueThb - a.revenueThb || a.email.localeCompare(b.email));
  s.roomCharges.sort((a, b) => a.at.localeCompare(b.at));
  return s;
}
