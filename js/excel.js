// 엑셀 내보내기: 기존 양식(CC 시트, PROJECT SETTLEMENT)과 같은 구성으로 만듭니다.
import { tourCalc, MODES, REGIONS, PAY_METHODS, DENOMS, CURRENCIES, EXPENSE_PLACES, EXPENSE_CATEGORIES, cashOnHand, priceFor, orderChanges, orderTotals } from './calc.js';
import { t, getLang, locale, pname } from './i18n.js';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const XLSX_URL = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';

function loadXLSX() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = XLSX_URL;
    s.onload = () => resolve(window.XLSX);
    s.onerror = () => reject(new Error(t('엑셀 모듈을 불러오지 못했습니다. 인터넷 연결을 확인하세요.')));
    document.head.appendChild(s);
  });
}

export async function exportTour(store, tour) {
  const XLSX = await loadXLSX();
  const c = tourCalc(store, tour);
  const wb = XLSX.utils.book_new();
  const date = new Date().toISOString().slice(0, 10);
  const title = `BDY ${tour.bdy} · ${regionLabel(tour.region)} · ${tour.tour_code || ''} · ${tour.start_date || ''}`;

  // 1) CC (Cash Collection)
  const cc = [];
  cc.push(['CASH COLLECTION FORM', title]);
  cc.push([t('총원'), c.passengers.length, '', t('출력일'), date]);
  cc.push([]);
  cc.push(['No', 'Group', t('이름'), t('영문'), ...c.products.map((p) => pname(p)), t('개인별 합계'), t('수금액'), t('미수금'), t('특이사항')]);
  cc.push(['', '', '', 'Price', ...c.products.map((p) => `${priceFor(tour, p)} ${p.currency}`)]);
  c.passengers.forEach((row, i) => {
    const notes = [];
    const cells = c.products.map((pr) => {
      const o = row.orders.get(pr.id);
      if (!o) return '';
      if (!MODES[o.mode].charged) notes.push(`${pname(pr)}: ${t(MODES[o.mode].label)}`);
      return MODES[o.mode].charged ? 1 : 0;
    });
    cc.push([i + 1, row.p.group_no, row.p.name_kor, row.p.name_eng, ...cells, fmt(row.due), fmt(row.paid), fmt(row.balance), [row.p.note, ...notes].filter(Boolean).join(' / ')]);
  });
  cc.push(['', t('포함 제외 신청인원수'), '', '', ...c.productRows.map((r) => r.charged)]);
  cc.push(['', t('신청인원수'), '', '', ...c.productRows.map((r) => r.applied)]);
  cc.push(['', t('옵션 금액'), '', '', ...c.productRows.map((r) => r.amount)]);
  cc.push(['', t('총 옵션 수 (결합상품 2개)'), '', '', c.productRows.reduce((s, r) => s + r.tickets, 0)]);
  cc.push(['', t('옵션 총계'), '', '', fmt(c.due)]);
  const ws1 = XLSX.utils.aoa_to_sheet(cc);
  ws1['!cols'] = [{ wch: 4 }, { wch: 8 }, { wch: 10 }, { wch: 18 }, ...c.products.map(() => ({ wch: 12 })), { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(wb, ws1, 'CC');

  // 2) 정산서
  const st = [];
  st.push([`PROJECT SETTLEMENT - ${REGIONS[tour.region] ? t(REGIONS[tour.region].label) : ''}`]);
  st.push(['PROJECT NO.', 'BDY ' + tour.bdy, 'DATE', tour.start_date || '', 'GUIDE', tour.guide || '']);
  st.push([]);
  // CASH FROM TOURISTS (B): 항목마다 자기 통화 칸에만 단가·인원·합계를 넣음 (Cruise Tips 는 USD 칸)
  const curs = CURRENCIES.filter((k) => c.productRows.some((r) => r.charged && r.product.currency === k));
  st.push(['CASH FROM TOURISTS (B)', ...curs.flatMap((k) => [`Rate (${k})`, 'PAX', `Total (${k})`])]);
  for (const r of c.productRows.filter((x) => x.charged)) {
    const rate = r.charged ? round(r.amount / r.charged) : priceFor(tour, r.product);
    st.push([pname(r.product), ...curs.flatMap((k) => (k === r.product.currency ? [rate, r.charged, r.amount] : ['', '', '']))]);
  }
  st.push(['Total Sales Amount', ...curs.flatMap((k) => ['', '', c.due[k] || 0])]);
  st.push([]);
  st.push(['CURRENCY', t('CASH RECEIVED (A) 회사에서 받은 돈'), t('CASH FROM TOURISTS (B) 정산할 금액'), t('TOUR EXPENSE (C) 지출 + 계좌이체'), t('CARD/TRANSFER (D) 카드·이체 수금'), t('CASH ON HAND (E) 현재 보유'), 'TO BE (F) = A+B-C-D', 'DISCREPANCY (E-F)', t('실제 수금 기록')]);
  for (const r of c.settlement) st.push([r.currency, r.A, r.B, r.C, r.D, r.E, r.F, r.diff, r.collected]);
  st.push([]);
  st.push([t('CASH ON HAND 권종')]);
  for (const r of c.settlement) {
    const counts = tour.cash_on_hand?.[r.currency] || {};
    st.push([r.currency, ...(DENOMS[r.currency] || []).map((d) => `${d} × ${Number(counts[d]) || 0}`), counts.other ? t('기타 {n}', { n: counts.other }) : '', t('합계'), cashOnHand(tour, r.currency)]);
  }
  st.push([]);
  st.push([t('비고'), tour.notes || '']);
  st.push(['Checked by (Financial Dept.)', tour.finance_check?.name || '', tour.finance_check?.at ? new Date(tour.finance_check.at).toLocaleString(locale()) : '']);
  st.push(['Checked by (Managing Director)', tour.md_check?.name || '', tour.md_check?.at ? new Date(tour.md_check.at).toLocaleString(locale()) : '']);
  const ws2 = XLSX.utils.aoa_to_sheet(st);
  ws2['!cols'] = [{ wch: 28 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 16 }, { wch: 16 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, ws2, t('정산서'));

  // 3) 수금 내역 / 4) 지출 내역
  const pax = new Map(c.passengers.map((r) => [r.p.id, r.p]));
  const pay = [[t('일시'), t('고객'), t('통화'), t('금액'), t('방법'), t('메모'), t('입력자')]];
  for (const p of [...c.payments].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    pay.push([new Date(p.created_at).toLocaleString(locale()), pax.get(p.passenger_id)?.name_kor || t('(공통)'), p.currency, Number(p.amount), PAY_METHODS[p.method] ? t(PAY_METHODS[p.method]) : p.method, p.note || '', p.created_by || '']);
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(pay), t('수금 내역'));
  const exp = [[t('일시'), t('구분'), t('장소'), t('항목'), t('통화'), t('금액'), t('메모'), t('입력자')]];
  for (const e of [...c.expenses].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    exp.push([new Date(e.created_at).toLocaleString(locale()), e.kind === 'transfer' ? t('계좌이체·환전') : t('투어 지출'), valLabel(e.place), valLabel(e.category), e.currency, Number(e.amount), e.note || '', e.created_by || '']);
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(exp), t('지출 내역'));

  const data = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new File([data], `BDY${tour.bdy}_${tour.region}_${t('전체§file')}_${stamp()}.xlsx`, { type: XLSX_MIME });
}

// 파일 이름 끝에 붙이는 날짜·시간 (이 기기 시간 기준): 2026-10-11_14-30
export function stamp(iso) {
  const d = iso ? new Date(iso) : new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}`;
}

// 옵션 주문서: req = { version, created_at, created_by, note, pax, items } (아직 보내지 않은 지금 내용이면 version 없음)
export async function exportOrder(tour, req, prevItems) {
  const XLSX = await loadXLSX();
  const when = req.created_at ? new Date(req.created_at) : new Date();
  const changes = prevItems ? orderChanges(prevItems, req.items) : [];
  const changed = new Map(changes.map((x) => [x.product_id, x]));
  const modeKeys = Object.keys(MODES);
  const wb = XLSX.utils.book_new();

  const a = [];
  a.push([t('OPTION ORDER FORM 옵션 주문서')]);
  a.push(['BDY', tour.bdy, t('지역'), regionLabel(tour.region), t('기간'), tour.tour_code || '', t('출발일'), tour.start_date || '']);
  a.push([t('가이드'), tour.guide || '', t('주문'), req.version ? t('{v}차', { v: req.version }) : t('보내기 전'), t('주문 일시'), when.toLocaleString(locale()), t('작성'), req.created_by || '']);
  a.push([t('총원'), req.pax, '', '', '', '', '', '']);
  if (req.note) a.push([t('메모'), req.note]);
  a.push([]);
  a.push(['No', t('상품§col'), t('단가'), t('통화'), t('주문 수량'), t('금액 (단가×수량)'), ...modeKeys.map((k) => t(MODES[k].label)), t('티켓 수 (결합 ×2)'), ...(prevItems ? [t('이전 주문'), t('변경')] : [])]);
  const rows = [...req.items];
  // 이전 주문에는 있었는데 이번에 0이 된 상품도 보이도록
  for (const x of changes) if (!rows.some((r) => r.product_id === x.product_id)) rows.push({ product_id: x.product_id, name: x.name, name_en: x.name_en, price: '', currency: '', qty: 0, modes: {}, units: 1, customers: [] });
  rows.forEach((it, i) => {
    const ch = changed.get(it.product_id);
    a.push([i + 1, itemName(it), it.price, it.currency, it.qty, it.price === '' ? '' : round(Number(it.price) * it.qty), ...modeKeys.map((k) => it.modes?.[k] || ''), it.qty * (it.units || 1),
      ...(prevItems ? [ch ? ch.before : it.qty, ch ? (ch.after - ch.before > 0 ? '+' : '') + (ch.after - ch.before || t('명단 변경')) : ''] : [])]);
  });
  // 합계 금액은 통화별로 한 줄씩 (이집트는 EUR + USD)
  const totals = orderTotals(req.items);
  const curs = Object.keys(totals);
  a.push(['', t('합계'), '', curs.length === 1 ? curs[0] : '', req.items.reduce((s, x) => s + x.qty, 0), curs.length === 1 ? totals[curs[0]] : '', ...modeKeys.map((k) => req.items.reduce((s, x) => s + (x.modes?.[k] || 0), 0)), req.items.reduce((s, x) => s + x.qty * (x.units || 1), 0)]);
  if (curs.length > 1) for (const c of curs) a.push(['', t('합계 금액 ({cur})', { cur: c }), '', c, '', totals[c]]);
  const ws = XLSX.utils.aoa_to_sheet(a);
  ws['!cols'] = [{ wch: 6 }, { wch: 30 }, { wch: 10 }, { wch: 8 }, { wch: 10 }, { wch: 16 }, ...modeKeys.map(() => ({ wch: 8 })), { wch: 14 }, { wch: 10 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(wb, ws, t('주문서'));

  const b = [[t('상품§col'), 'No', t('그룹'), t('이름'), t('영문'), t('구분')]];
  for (const it of req.items) it.customers.forEach((x, i) => b.push([i ? '' : itemName(it), i + 1, x.g || '', x.n, x.e, MODES[x.m] ? t(MODES[x.m].label) : x.m]));
  const ws2 = XLSX.utils.aoa_to_sheet(b);
  ws2['!cols'] = [{ wch: 30 }, { wch: 5 }, { wch: 6 }, { wch: 12 }, { wch: 22 }, { wch: 8 }];
  XLSX.utils.book_append_sheet(wb, ws2, t('고객 명단'));

  const data = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const name = getLang() === 'en'
    ? `BDY${tour.bdy}_${tour.region}_Order${req.version ? `_R${req.version}` : ''}_${stamp(req.created_at)}.xlsx`
    : `BDY${tour.bdy}_${tour.region}_주문서${req.version ? `_${req.version}차` : ''}_${stamp(req.created_at)}.xlsx`;
  return new File([data], name, { type: XLSX_MIME });
}

// 요약 탭을 열 때 미리 받아 두면, 버튼을 눌렀을 때 바로 저장 창이 뜹니다(아이폰은 누른 직후가 아니면 공유 창을 막습니다).
export function preloadXLSX() { loadXLSX().catch(() => {}); }

const isMobile = () => /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

// 휴대폰: 공유 창(‘파일에 저장’, 카카오톡 등). 그 외: 일반 다운로드.
// 'share' = 공유 창을 띄움, 'download' = 다운로드, 'retry' = 사용자가 한 번 더 눌러야 함
export async function saveFile(file) {
  if (isMobile() && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: file.name });
      return 'share';
    } catch (err) {
      if (err.name === 'AbortError') return 'share';
      if (err.name === 'NotAllowedError') return 'retry';
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url; a.download = file.name; a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 60000);
  return 'download';
}

function round(n) { return Math.round(n * 100) / 100; }

const regionLabel = (r) => (REGIONS[r] ? t(REGIONS[r].label) : r);
const valLabel = (v) => ([...EXPENSE_PLACES, ...EXPENSE_CATEGORIES].includes(v) ? t(v) : v);
// 저장된 주문서 항목 이름: 영어면 name_en (없으면 한국어 이름)
const itemName = (x) => (getLang() === 'en' && x.name_en ? x.name_en : x.name);

function fmt(obj) {
  return Object.entries(obj || {}).filter(([, v]) => v).map(([k, v]) => `${v} ${k}`).join(' / ');
}
