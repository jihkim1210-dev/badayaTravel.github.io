// 엑셀 내보내기: 기존 양식(CC 시트, PROJECT SETTLEMENT)과 같은 구성으로 만듭니다.
import { tourCalc, MODES, REGIONS, PAY_METHODS, DENOMS, CURRENCIES, cashOnHand, priceFor } from './calc.js';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const XLSX_URL = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';

function loadXLSX() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = XLSX_URL;
    s.onload = () => resolve(window.XLSX);
    s.onerror = () => reject(new Error('엑셀 모듈을 불러오지 못했습니다. 인터넷 연결을 확인하세요.'));
    document.head.appendChild(s);
  });
}

export async function exportTour(store, tour) {
  const XLSX = await loadXLSX();
  const c = tourCalc(store, tour);
  const wb = XLSX.utils.book_new();
  const date = new Date().toISOString().slice(0, 10);
  const title = `BDY ${tour.bdy} · ${REGIONS[tour.region]?.label || tour.region} · ${tour.tour_code || ''} · ${tour.start_date || ''}`;

  // 1) CC (Cash Collection)
  const cc = [];
  cc.push(['CASH COLLECTION FORM', title]);
  cc.push(['총원', c.passengers.length, '', '출력일', date]);
  cc.push([]);
  cc.push(['No', 'Group', '이름', '영문', ...c.products.map((p) => p.name), '개인별 합계', '수금액', '미수금', '특이사항']);
  cc.push(['', '', '', 'Price', ...c.products.map((p) => `${priceFor(tour, p)} ${p.currency}`)]);
  c.passengers.forEach((row, i) => {
    const notes = [];
    const cells = c.products.map((pr) => {
      const o = row.orders.get(pr.id);
      if (!o) return '';
      if (!MODES[o.mode].charged) notes.push(`${pr.name}: ${MODES[o.mode].label}`);
      return MODES[o.mode].charged ? 1 : 0;
    });
    cc.push([i + 1, row.p.group_no, row.p.name_kor, row.p.name_eng, ...cells, fmt(row.due), fmt(row.paid), fmt(row.balance), [row.p.note, ...notes].filter(Boolean).join(' / ')]);
  });
  cc.push(['', '포함 제외 신청인원수', '', '', ...c.productRows.map((r) => r.charged)]);
  cc.push(['', '신청인원수', '', '', ...c.productRows.map((r) => r.applied)]);
  cc.push(['', '옵션 금액', '', '', ...c.productRows.map((r) => r.amount)]);
  cc.push(['', '총 옵션 수 (결합상품 2개)', '', '', c.productRows.reduce((s, r) => s + r.tickets, 0)]);
  cc.push(['', '옵션 총계', '', '', fmt(c.due)]);
  const ws1 = XLSX.utils.aoa_to_sheet(cc);
  ws1['!cols'] = [{ wch: 4 }, { wch: 8 }, { wch: 10 }, { wch: 18 }, ...c.products.map(() => ({ wch: 12 })), { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(wb, ws1, 'CC');

  // 2) 정산서
  const st = [];
  st.push([`PROJECT SETTLEMENT - ${REGIONS[tour.region]?.label || ''}`]);
  st.push(['PROJECT NO.', 'BDY ' + tour.bdy, 'DATE', tour.start_date || '', 'GUIDE', tour.guide || '']);
  st.push([]);
  // CASH FROM TOURISTS (B): 항목마다 자기 통화 칸에만 단가·인원·합계를 넣음 (Cruise Tips 는 USD 칸)
  const curs = CURRENCIES.filter((k) => c.productRows.some((r) => r.charged && r.product.currency === k));
  st.push(['CASH FROM TOURISTS (B)', ...curs.flatMap((k) => [`Rate (${k})`, 'PAX', `Total (${k})`])]);
  for (const r of c.productRows.filter((x) => x.charged)) {
    const rate = r.charged ? round(r.amount / r.charged) : priceFor(tour, r.product);
    st.push([r.product.name, ...curs.flatMap((k) => (k === r.product.currency ? [rate, r.charged, r.amount] : ['', '', '']))]);
  }
  st.push(['Total Sales Amount', ...curs.flatMap((k) => ['', '', c.due[k] || 0])]);
  st.push([]);
  st.push(['CURRENCY', 'CASH RECEIVED (A) 회사에서 받은 돈', 'CASH FROM TOURISTS (B) 정산할 금액', 'TOUR EXPENSE (C) 지출 + 계좌이체', 'CARD/TRANSFER (D) 카드·이체 수금', 'CASH ON HAND (E) 현재 보유', 'TO BE (F) = A+B-C-D', 'DISCREPANCY (E-F)', '실제 수금 기록']);
  for (const r of c.settlement) st.push([r.currency, r.A, r.B, r.C, r.D, r.E, r.F, r.diff, r.collected]);
  st.push([]);
  st.push(['CASH ON HAND 권종']);
  for (const r of c.settlement) {
    const counts = tour.cash_on_hand?.[r.currency] || {};
    st.push([r.currency, ...(DENOMS[r.currency] || []).map((d) => `${d} × ${Number(counts[d]) || 0}`), counts.other ? `기타 ${counts.other}` : '', '합계', cashOnHand(tour, r.currency)]);
  }
  st.push([]);
  st.push(['비고', tour.notes || '']);
  st.push(['Checked by (Financial Dept.)', tour.finance_check?.name || '', tour.finance_check?.at ? new Date(tour.finance_check.at).toLocaleString('ko-KR') : '']);
  st.push(['Checked by (Managing Director)', tour.md_check?.name || '', tour.md_check?.at ? new Date(tour.md_check.at).toLocaleString('ko-KR') : '']);
  const ws2 = XLSX.utils.aoa_to_sheet(st);
  ws2['!cols'] = [{ wch: 28 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 16 }, { wch: 16 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, ws2, '정산서');

  // 3) 수금 내역 / 4) 지출 내역
  const pax = new Map(c.passengers.map((r) => [r.p.id, r.p]));
  const pay = [['일시', '고객', '통화', '금액', '방법', '메모', '입력자']];
  for (const p of [...c.payments].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    pay.push([new Date(p.created_at).toLocaleString('ko-KR'), pax.get(p.passenger_id)?.name_kor || '(공통)', p.currency, Number(p.amount), PAY_METHODS[p.method] || p.method, p.note || '', p.created_by || '']);
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(pay), '수금 내역');
  const exp = [['일시', '구분', '장소', '항목', '통화', '금액', '메모', '입력자']];
  for (const e of [...c.expenses].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    exp.push([new Date(e.created_at).toLocaleString('ko-KR'), e.kind === 'transfer' ? '계좌이체·환전' : '투어 지출', e.place, e.category, e.currency, Number(e.amount), e.note || '', e.created_by || '']);
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(exp), '지출 내역');

  const data = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new File([data], `BDY${tour.bdy}_${tour.region}_${date}.xlsx`, { type: XLSX_MIME });
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

function fmt(obj) {
  return Object.entries(obj || {}).filter(([, v]) => v).map(([k, v]) => `${v} ${k}`).join(' / ');
}
