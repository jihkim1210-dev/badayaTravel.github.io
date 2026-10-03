// 엑셀 양식(Cash Collection / PROJECT SETTLEMENT)의 계산 규칙을 그대로 옮긴 순수 함수들.

export const CURRENCIES = ['EUR', 'USD', 'KRW', 'AED', 'EGP'];

export const REGIONS = {
  DUBAI: { label: '두바이', currency: 'AED' },
  EGYPT: { label: '이집트', currency: 'EUR' },
};

export const TOUR_CODES = ['EY3N6D', 'EK3N6D', 'KE4N6D', 'KE5N7D', 'KE4N6Dsig', 'KE5N7Dsig'];

// 지폐 권종 (CASH ON HAND 계산용)
export const DENOMS = {
  EUR: [500, 200, 100, 50, 20, 10, 5],
  USD: [100, 50, 20, 10, 5, 2, 1],
  KRW: [50000, 10000, 5000, 1000, 500, 100],
  AED: [1000, 500, 200, 100, 50, 20, 10, 5],
  EGP: [200, 100, 50, 20, 10, 5],
};

// 주문 상태. 엑셀 CC 시트에서 현금은 1, 그 외(선결제·홈쇼핑·보상)는 0 으로 표기하던 방식.
export const MODES = {
  cash: { label: '현금', mark: '●', charged: true },
  prepaid: { label: '선결제', mark: 'P', charged: false },
  homeshop: { label: '홈쇼핑', mark: 'H', charged: false },
  comp: { label: '보상', mark: 'C', charged: false },
};

export const STATUS = {
  open: { label: '진행중' },
  submitted: { label: '정산 제출' },
  closed: { label: '정산 완료' },
};

export const EXPENSE_PLACES = ['두바이', '이집트', '사무실'];
export const EXPENSE_CATEGORIES = ['팁', '커미션', '보상', '가이드 대납', '크루즈팁', '입장료', '식사', '교통', '기타'];
export const PAY_METHODS = { cash: '현금', card: '카드', transfer: '계좌이체' };

const SYMBOL = { EUR: '€', USD: '$', KRW: '₩' };

export function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function money(n, cur) {
  const v = round2(n);
  const s = v.toLocaleString('en-US', { maximumFractionDigits: cur === 'KRW' ? 0 : 2 });
  return SYMBOL[cur] ? (v < 0 ? '-' + SYMBOL[cur] + s.slice(1) : SYMBOL[cur] + s) : s + ' ' + cur;
}

export function moneyList(obj, empty = '-') {
  const parts = CURRENCIES.filter((c) => round2(obj?.[c])).map((c) => money(obj[c], c));
  return parts.length ? parts.join(' · ') : empty;
}

function add(obj, cur, amt) {
  obj[cur] = round2((obj[cur] || 0) + (Number(amt) || 0));
}

// 투어별 요금 (예: Tour Expense €90 / €100). 정하지 않으면 상품 기본 가격.
export function priceFor(tour, pr) {
  const v = tour?.prices?.[pr.id];
  return v === undefined || v === null || v === '' ? pr.price : Number(v);
}

export function cashOnHand(tour, cur) {
  const counts = tour.cash_on_hand?.[cur] || {};
  let total = 0;
  for (const d of DENOMS[cur] || []) total += d * (Number(counts[d]) || 0);
  total += Number(counts.other) || 0;
  return round2(total);
}

export function tourProducts(store, tour) {
  const ordered = new Set(store.all('orders').filter((o) => o.tour_id === tour.id).map((o) => o.product_id));
  return store
    .all('products')
    .filter((p) => (p.region === tour.region && p.active !== false) || ordered.has(p.id))
    .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.name.localeCompare(b.name));
}

export function sortPassengers(list) {
  return list.sort((a, b) => (a.group_no || 0) - (b.group_no || 0) || (a.sort || 0) - (b.sort || 0) || String(a.created_at).localeCompare(String(b.created_at)));
}

// 투어 한 건의 모든 합계
export function tourCalc(store, tour) {
  const passengers = sortPassengers(store.all('passengers').filter((p) => p.tour_id === tour.id));
  const orders = store.all('orders').filter((o) => o.tour_id === tour.id);
  const payments = store.all('payments').filter((p) => p.tour_id === tour.id);
  const expenses = store.all('expenses').filter((e) => e.tour_id === tour.id);
  const products = tourProducts(store, tour);

  const byPax = new Map(passengers.map((p) => [p.id, { p, orders: new Map(), due: {}, paid: {}, balance: {} }]));
  const due = {}, paid = {}, unassigned = {}, spent = {}, nonCash = {};

  for (const o of orders) {
    const row = byPax.get(o.passenger_id);
    if (!row) continue;
    row.orders.set(o.product_id, o);
    if (MODES[o.mode]?.charged) {
      add(row.due, o.currency, o.price);
      add(due, o.currency, o.price);
    }
  }
  for (const pay of payments) {
    add(paid, pay.currency, pay.amount);
    if (pay.method && pay.method !== 'cash') add(nonCash, pay.currency, pay.amount);
    const row = pay.passenger_id && byPax.get(pay.passenger_id);
    if (row) add(row.paid, pay.currency, pay.amount);
    else add(unassigned, pay.currency, pay.amount);
  }
  for (const row of byPax.values()) {
    for (const c of CURRENCIES) {
      const b = round2((row.due[c] || 0) - (row.paid[c] || 0));
      if (b) row.balance[c] = b;
    }
  }
  for (const e of expenses) add(spent, e.currency, e.amount);

  // CC 시트 하단: 포함 제외 신청인원수(현금) / 신청인원수(전체) / 금액
  const productRows = products.map((pr) => {
    let applied = 0, charged = 0, amount = 0;
    const modes = {};
    for (const o of orders) {
      if (o.product_id !== pr.id || !byPax.has(o.passenger_id)) continue;
      applied++;
      modes[o.mode] = (modes[o.mode] || 0) + 1;
      if (MODES[o.mode]?.charged) {
        charged++;
        amount += Number(o.price) || 0;
      }
    }
    return { product: pr, applied, charged, modes, tickets: applied * (pr.units || 1), amount: round2(amount) };
  });

  const outstanding = {};
  for (const c of CURRENCIES) {
    const v = round2((due[c] || 0) - (paid[c] || 0));
    if (v > 0) outstanding[c] = v;
  }

  // 정산서: F = A + B - C - D(카드·계좌이체로 받아 현금이 아닌 금액), 편차 = E - F
  const mainCur = REGIONS[tour.region]?.currency || 'USD';
  const settlement = CURRENCIES.map((c) => {
    const A = round2(tour.cash_received?.[c]);
    const B = round2(due[c]);
    const C = round2(spent[c]);
    const D = round2(nonCash[c]);
    const E = cashOnHand(tour, c);
    const F = round2(A + B - C - D);
    return { currency: c, A, B, C, D, E, F, diff: round2(E - F), collected: round2(paid[c]) };
  }).filter((r) => r.currency === mainCur || r.A || r.B || r.C || r.D || r.E || r.collected);

  return { passengers: [...byPax.values()], orders, payments, expenses, products, productRows, due, paid, nonCash, unassigned, spent, outstanding, settlement, mainCur };
}
