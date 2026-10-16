// 기본 상품표. 이집트는 'PROJECT SETTLEMENT - EGYPT' / CC 시트, 두바이는 F·H 정산 양식의 USD 가격입니다.
// units: 엑셀 '총 옵션 합계'에서 여러 개로 세는 결합 상품 (2개, 3개).
// 영어 화면·엑셀에서 쓰는 상품 이름 (이미 영어인 상품은 없음)
const NAME_EN = {
  '피라미드 내부 탐험 + 문명박물관': 'Pyramid Interior + Civilization Museum',
  '피라미드 내부 탐험': 'Pyramid Interior',
  '문명박물관': 'Civilization Museum',
  '마차투어 + 룩소르 신전': 'Carriage Ride + Luxor Temple',
  '세티 1세의 무덤': 'Tomb of Seti I',
  '필레신전 + 아스완댐 보트': 'Philae Temple + Aswan Dam Boat',
  '덴데라 + 사막 사파리': 'Dendera + Desert Safari',
  '덴데라 신전': 'Dendera Temple',
  '사막 사파리': 'Desert Safari',
  '투탕카멘의 무덤 내부 관람': "Inside Tutankhamun's Tomb",
  '부르즈 칼리파 전망대': 'Burj Khalifa Observation Deck',
};
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
  // 두바이F: '수금확정서 EY 4N6D_Full' 양식의 옵션 (USD). id 는 예전 AED 상품과 같게 유지합니다.
  ['DUBAI', 'Tour Expense', 60, 'USD', 1, null, true, 'prd-dubai-53'],
  ['DUBAI', 'Dubai Tourism Dirham', 15, 'USD', 1, [15, 18], true, 'prd-dubai-54'],
  ['DUBAI', 'Abu Dhabi Tourism Dirham', 3, 'USD', 1, null, true, 'prd-dubai-55'],
  ['DUBAI', 'PCR', 90, 'USD', 1, null, false, 'prd-dubai-56'],
  ['DUBAI', 'Night Tour + Wine', 100, 'USD', 1, null, true, 'prd-dubai-57'],
  ['DUBAI', 'Yacht Tour', 60, 'USD', 1, null, true, 'prd-dubai-14'],
  ['DUBAI', 'The View at The Palm', 70, 'USD', 1, null, true, 'prd-dubai-16'],
  ['DUBAI', 'Desert Safari', 120, 'USD', 1, null, true, 'prd-dubai-23'],
  ['DUBAI', 'ATT', 100, 'USD', 1, null, true, 'prd-dubai-58'],
  ['DUBAI', 'Seafood Lunch', 30, 'USD', 1, null, true, 'prd-dubai-22'],
  ['DUBAI', 'Museum of the Future', 80, 'USD', 1, null, true, 'prd-dubai-20'],
  ['DUBAI', 'Dhow Cruise', 130, 'USD', 1, null, true, 'prd-dubai-18'],
  ['DUBAI', 'La Perle', 150, 'USD', 1, null, true, 'prd-dubai-19'],
  ['DUBAI', 'Gold Coffee', 80, 'USD', 1, null, true, 'prd-dubai-59'],
  ['DUBAI', 'Qasr Al Watan', 70, 'USD', 1, null, true, 'prd-dubai-29'],
  ['DUBAI', 'Louvre Abu Dhabi', 70, 'USD', 1, null, true, 'prd-dubai-27'],
  ['DUBAI', 'Yacht + ATT', 130, 'USD', 2, null, true, 'prd-dubai-60'],
  ['DUBAI', 'Seafood + Dhow + La Perle', 280, 'USD', 3, null, true, 'prd-dubai-61'],
  // 양식에 없는 예전 두바이 상품: 숨김 (가격을 넣고 '주문서에 표시'를 켜면 다시 씀)
  ['DUBAI', 'Green Planet', 70, 'USD', 1, null, false, 'prd-dubai-15'],
  ['DUBAI', 'BBQ Lunch', 60, 'USD', 1, null, false, 'prd-dubai-17'],
  ['DUBAI', 'Walk Bridge', 10, 'USD', 1, null, false, 'prd-dubai-25'],
  ['DUBAI', 'Burj Khalifa', 0, 'USD', 1, null, false, 'prd-dubai-21'],
  ['DUBAI', 'Dubai Frame', 0, 'USD', 1, null, false, 'prd-dubai-24'],
  ['DUBAI', 'Kandura & Abaya', 0, 'USD', 1, null, false, 'prd-dubai-26'],
  ['DUBAI', 'Sheikh Zayed Mosque', 0, 'USD', 1, null, false, 'prd-dubai-28'],
  ['DUBAI', 'Tourism Dirham (3N)', 0, 'USD', 1, null, false, 'prd-dubai-30'],
  ['DUBAI', 'Tourism Dirham (4N)', 0, 'USD', 1, null, false, 'prd-dubai-31'],
  ['DUBAI', 'Tourism Dirham (5N)', 0, 'USD', 1, null, false, 'prd-dubai-32'],
  ['DUBAI', 'Tips', 0, 'USD', 1, null, false, 'prd-dubai-33'], // 1인당 금액을 정한 뒤 상품 화면에서 가격 입력·표시
  // 두바이 하프데이: 정산 양식의 Tour Expense 6D/7D/8D ($60/70/80)를 투어마다 고르는 요금으로
  ['DUBAI_H', 'Tour Expense', 60, 'USD', 1, [60, 70, 80], true, 'prd-dubai_h-34'],
  // 정산 양식(Cash Collection Form)의 옵션, USD. 가격이 비어 있던 항목은 0으로 숨겨 둠
  ['DUBAI_H', 'Tourism Dhs (5 Star Hotel) 5N', 0, 'USD', 1, null, false, 'prd-dubai_h-35'],
  ['DUBAI_H', 'Tourism Dhs (5 Star Hotel) 4N', 0, 'USD', 1, null, false, 'prd-dubai_h-36'],
  ['DUBAI_H', 'Tourism Dhs (3 Star Hotel) 4N', 0, 'USD', 1, null, false, 'prd-dubai_h-37'],
  ['DUBAI_H', 'Desert Safari', 120, 'USD', 1, null, true, 'prd-dubai_h-38'],
  ['DUBAI_H', 'ATT', 100, 'USD', 1, null, true, 'prd-dubai_h-39'],
  ['DUBAI_H', 'Gold Coffee', 80, 'USD', 1, null, true, 'prd-dubai_h-40'],
  ['DUBAI_H', 'Palm View', 80, 'USD', 1, null, true, 'prd-dubai_h-41'],
  ['DUBAI_H', 'Dhow Cruise Dinner', 130, 'USD', 1, null, true, 'prd-dubai_h-42'],
  ['DUBAI_H', 'BBQ Lunch', 60, 'USD', 1, null, true, 'prd-dubai_h-43'],
  ['DUBAI_H', 'La Perle', 150, 'USD', 1, null, true, 'prd-dubai_h-44'],
  ['DUBAI_H', 'Louvre Museum', 70, 'USD', 1, null, true, 'prd-dubai_h-45'],
  ['DUBAI_H', 'Green Planet', 70, 'USD', 1, null, true, 'prd-dubai_h-46'],
  ['DUBAI_H', 'Seafood Lunch', 30, 'USD', 1, null, true, 'prd-dubai_h-47'],
  ['DUBAI_H', 'Qasr Al Watan', 70, 'USD', 1, null, true, 'prd-dubai_h-48'],
  ['DUBAI_H', 'Walk Bridge', 10, 'USD', 1, null, true, 'prd-dubai_h-49'],
  ['DUBAI_H', 'Future Museum', 80, 'USD', 1, null, true, 'prd-dubai_h-50'],
  ['DUBAI_H', 'Prepaid Pack A', 0, 'USD', 1, null, false, 'prd-dubai_h-51'],
  ['DUBAI_H', 'Prepaid Pack B', 0, 'USD', 1, null, false, 'prd-dubai_h-52'],
].map(([region, name, price, currency, units, rates, active = true, id], i) => ({
  id: id || 'prd-' + region.toLowerCase() + '-' + String(i + 1).padStart(2, '0'),
  region, name, name_en: NAME_EN[name] || null, price, currency, units, rates: rates || null, sort: (i + 1) * 10, active,
}));

// 체험 모드에서만 쓰는 예시 투어 (실제 고객 정보 아님)
export function sampleData(now = new Date()) {
  const iso = (d) => d.toISOString();
  const day = (offset) => { const d = new Date(now); d.setDate(d.getDate() + offset); return d.toISOString().slice(0, 10); };
  const t = iso(now);
  const tour = {
    id: 'tour-sample-1', bdy: '4478', region: 'DUBAI', tour_code: 'EK3N6D', start_date: day(-1),
    guide: '예시 가이드', status: 'open', notes: '예시 투어입니다. 자유롭게 눌러보고 지워도 됩니다.',
    cash_received: { USD: 200 }, cash_on_hand: {}, created_at: t, updated_at: t,
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
    [0, ['ATT', 'Desert Safari', 'Dhow Cruise'], 'cash'],
    [1, ['ATT', 'Desert Safari'], 'cash'],
    [2, ['ATT', 'Museum of the Future'], 'prepaid'],
    [3, ['Desert Safari', 'Gold Coffee'], 'cash'],
    [4, ['Desert Safari'], 'homeshop'],
    [5, ['ATT', 'La Perle'], 'cash'],
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
    { id: 'exp-sample-1', tour_id: tour.id, kind: 'expense', place: '두바이', category: '팁', currency: 'USD', amount: 10, note: '사파리 드라이버', created_by: '예시 가이드', created_at: t },
  ];
  return { tours: [tour], passengers, orders, payments, expenses };
}
