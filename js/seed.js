// 기본 상품표. 이집트는 'PROJECT SETTLEMENT - EGYPT' / CC 시트, 두바이는 직원 HTML 시안의 가격을 옮겼습니다.
// units: 엑셀 '총 옵션 합계'에서 2개로 세던 결합 상품.
export const DEFAULT_PRODUCTS = [
  ['EGYPT', 'Tour Expense', 90, 'EUR', 1, [90, 100]],
  ['EGYPT', 'Cruise Tips', 15, 'USD', 1],
  ['EGYPT', '피라미드 내부 탐험 + 문명박물관', 150, 'EUR', 2],
  ['EGYPT', '피라미드 내부 탐험', 80, 'EUR', 1],
  ['EGYPT', '문명박물관', 80, 'EUR', 1],
  ['EGYPT', '마차투어 + 룩소르 신전', 70, 'EUR', 1],
  ['EGYPT', '세티 1세의 무덤', 185, 'EUR', 1],
  ['EGYPT', '필레신전 + 아스완댐 보트', 70, 'EUR', 1],
  ['EGYPT', '덴데라 + 사막 사파리', 150, 'EUR', 2],
  ['EGYPT', '덴데라 신전', 80, 'EUR', 1],
  ['EGYPT', '사막 사파리', 80, 'EUR', 1],
  ['EGYPT', '투탕카멘의 무덤 내부 관람', 70, 'EUR', 1],
  ['EGYPT', '부르즈 칼리파 전망대', 90, 'EUR', 1],
  ['DUBAI', 'Yacht Tour', 60, 'USD', 1],
  ['DUBAI', 'Green Planet', 90, 'USD', 1],
  ['DUBAI', 'The View at The Palm', 80, 'USD', 1],
  ['DUBAI', 'BBQ Lunch', 60, 'USD', 1],
  ['DUBAI', 'Dhow Cruise', 130, 'USD', 1],
  ['DUBAI', 'La Perle', 150, 'USD', 1],
  ['DUBAI', 'Museum of the Future', 80, 'USD', 1],
  ['DUBAI', 'Burj Khalifa', 100, 'USD', 1],
  ['DUBAI', 'Seafood Lunch', 30, 'USD', 1],
  ['DUBAI', 'Desert Safari', 120, 'USD', 1],
  ['DUBAI', 'Dubai Frame', 50, 'USD', 1],
  ['DUBAI', 'Walk Bridge', 20, 'USD', 1],
  ['DUBAI', 'Kandura & Abaya', 10, 'USD', 1],
  ['DUBAI', 'Louvre Abu Dhabi', 80, 'USD', 1],
  ['DUBAI', 'Sheikh Zayed Mosque', 70, 'USD', 1],
  ['DUBAI', 'Qasr Al Watan', 50, 'USD', 1],
  ['DUBAI', 'Tourism Dirham (3N)', 12, 'USD', 1],
  ['DUBAI', 'Tourism Dirham (4N)', 16, 'USD', 1],
  ['DUBAI', 'Tourism Dirham (5N)', 20, 'USD', 1],
].map(([region, name, price, currency, units, rates], i) => ({
  id: 'prd-' + region.toLowerCase() + '-' + String(i + 1).padStart(2, '0'),
  region, name, price, currency, units, rates: rates || null, sort: (i + 1) * 10, active: true,
}));

// 체험 모드에서만 쓰는 예시 투어 (실제 고객 정보 아님)
export function sampleData(now = new Date()) {
  const iso = (d) => d.toISOString();
  const day = (offset) => { const d = new Date(now); d.setDate(d.getDate() + offset); return d.toISOString().slice(0, 10); };
  const t = iso(now);
  const tour = {
    id: 'tour-sample-1', bdy: '4478', region: 'DUBAI', tour_code: 'EK3N6D', start_date: day(-1),
    guide: '예시 가이드', status: 'open', notes: '예시 투어입니다. 자유롭게 눌러보고 지워도 됩니다.',
    cash_received: { USD: 500 }, cash_on_hand: {}, created_at: t, updated_at: t,
  };
  const names = [
    [1, '김예시', 'KIM/YESI', 'Ms'], [1, '이샘플', 'LEE/SAMPLE', 'Mr'], [1, '박데모', 'PARK/DEMO', 'Ms'],
    [2, '최연습', 'CHOI/YEONSEUP', 'Mr'], [2, '정테스트', 'JUNG/TEST', 'Ms'],
    [3, '한보기', 'HAN/BOGI', 'Mr'], [3, '오시험', 'OH/SIHEOM', 'Ms'],
  ];
  const passengers = names.map(([g, k, e, s], i) => ({
    id: 'pax-sample-' + (i + 1), tour_id: tour.id, group_no: g, name_kor: k, name_eng: e, gender: s, sort: i, created_at: t,
  }));
  const pick = (name) => DEFAULT_PRODUCTS.find((p) => p.region === 'DUBAI' && p.name === name);
  const plan = [
    [0, ['Burj Khalifa', 'Desert Safari', 'Dhow Cruise'], 'cash'],
    [1, ['Burj Khalifa', 'Desert Safari'], 'cash'],
    [2, ['Burj Khalifa', 'Museum of the Future'], 'prepaid'],
    [3, ['Desert Safari', 'Green Planet'], 'cash'],
    [4, ['Desert Safari'], 'homeshop'],
    [5, ['Burj Khalifa', 'La Perle'], 'cash'],
    [6, ['Yacht Tour'], 'comp'],
  ];
  const orders = [];
  for (const [pi, items, mode] of plan) {
    for (const name of items) {
      const pr = pick(name);
      orders.push({ id: passengers[pi].id + ':' + pr.id, tour_id: tour.id, passenger_id: passengers[pi].id, product_id: pr.id, mode, price: pr.price, currency: pr.currency, updated_by: '예시 가이드', updated_at: t });
    }
  }
  const payments = [
    { id: 'pay-sample-1', tour_id: tour.id, passenger_id: passengers[0].id, currency: 'USD', amount: 350, method: 'cash', note: '', created_by: '예시 가이드', created_at: t },
    { id: 'pay-sample-2', tour_id: tour.id, passenger_id: passengers[1].id, currency: 'USD', amount: 100, method: 'cash', note: '나머지는 내일', created_by: '예시 가이드', created_at: t },
    { id: 'pay-sample-3', tour_id: tour.id, passenger_id: passengers[5].id, currency: 'USD', amount: 250, method: 'card', note: '', created_by: '예시 가이드', created_at: t },
  ];
  const expenses = [
    { id: 'exp-sample-1', tour_id: tour.id, kind: 'expense', place: '두바이', category: '팁', currency: 'USD', amount: 40, note: '사파리 드라이버', created_by: '예시 가이드', created_at: t },
  ];
  return { tours: [tour], passengers, orders, payments, expenses };
}
