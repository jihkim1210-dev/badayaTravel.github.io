import { CONFIG } from './config.js';
import { LocalStore, SupabaseStore, uid, ls } from './store.js';
import {
  CURRENCIES, REGIONS, TOUR_CODES, DENOMS, MODES, STATUS, EXPENSE_PLACES, EXPENSE_CATEGORIES, PAY_METHODS,
  money, moneyList, round2, tourCalc, cashOnHand, priceFor,
} from './calc.js';

const SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js';

const $ = (s, el = document) => el.querySelector(s);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (v) => { const n = parseFloat(String(v).replace(/,/g, '')); return Number.isFinite(n) ? n : 0; };

let store;
const expanded = new Set();
let installEvent = null;
const ui = Object.assign({ orderMode: 'cash', orderView: 'cards', onlySel: false, homeFilter: 'open', productRegion: 'DUBAI', extraCur: '' }, ls.get('badaya.ui', {}));
const saveUI = () => ls.set('badaya.ui', { orderMode: ui.orderMode, orderView: ui.orderView, onlySel: ui.onlySel, homeFilter: ui.homeFilter, productRegion: ui.productRegion });

window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvent = e; scheduleRender(); });

/* ---------- 부팅 ---------- */

async function boot() {
  bindEvents();
  if (CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY) {
    try {
      await loadScript(SUPABASE_JS);
      store = new SupabaseStore(CONFIG.SUPABASE_URL.trim().replace(/\/(rest|auth|realtime)\/v1.*$/, '').replace(/\/+$/, ''), CONFIG.SUPABASE_ANON_KEY.trim());
      const ready = await store.init();
      if (!ready) return renderLogin();
    } catch (err) {
      $('#view').innerHTML = `<div class="empty"><p>서버에 연결하지 못했습니다.</p><p class="muted">${esc(err.message)}</p><button class="btn" onclick="location.reload()">다시 시도</button></div>`;
      return;
    }
  } else {
    store = await new LocalStore().init();
  }
  store.on((info) => {
    if (info.error) toast(info.error, 'bad');
    scheduleRender();
  });
  window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); });
  render();
  if (store.status.mode === 'local' && !store.user.name) askName();
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error('필요한 파일을 불러오지 못했습니다. 인터넷 연결을 확인하세요.'));
    document.head.appendChild(s);
  });
}

/* ---------- 렌더링 ---------- */

let renderQueued = false;
let renderDeferred = false;
function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    const a = document.activeElement;
    // 입력 중인 칸은 다른 직원의 변경 때문에 지워지지 않도록 입력이 끝난 뒤 갱신
    if (a && $('#view').contains(a) && /INPUT|TEXTAREA|SELECT/.test(a.tagName)) { renderDeferred = true; renderTop(); return; }
    render();
  });
}
document.addEventListener('focusout', () => { if (renderDeferred) { renderDeferred = false; setTimeout(scheduleRender, 50); } });

function route() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  return { page: parts[0] || 'home', id: parts[1], tab: parts[2] };
}

function render() {
  if (!store) return;
  renderTop();
  const r = route();
  let html;
  if (r.page === 'tour') html = viewTour(r.id, r.tab || 'orders');
  else if (r.page === 'products') html = viewProducts();
  else if (r.page === 'settings') html = viewSettings();
  else html = viewHome();
  $('#view').innerHTML = html;
  document.querySelectorAll('.nav a').forEach((a) => a.classList.toggle('on', a.dataset.page === (r.page === 'tour' ? 'home' : r.page)));
}

function renderTop() {
  const s = store.status;
  let cls = 'ok', text = '실시간 연결';
  if (s.mode === 'local') { cls = 'demo'; text = '체험 모드'; }
  else if (!s.online) { cls = 'bad'; text = s.pending ? `오프라인 · 대기 ${s.pending}건` : '오프라인'; }
  else if (s.pending) { cls = 'warn'; text = `전송 중 ${s.pending}건`; }
  else if (!s.realtime) { cls = 'warn'; text = '연결 중'; }
  $('#conn').className = 'conn ' + cls;
  $('#conn').textContent = text;
  $('#who').textContent = store.user?.name || '';
}

const isAdmin = () => store.user?.role === 'admin';
const me = () => store.user?.name || '직원';

function timeAgo(iso) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return '방금';
  if (s < 3600) return Math.floor(s / 60) + '분 전';
  if (s < 86400) return Math.floor(s / 3600) + '시간 전';
  return new Date(iso).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
}

function tourTitle(t) { return `BDY ${esc(t.bdy)}`; }
function statusPill(t) { return `<span class="pill st-${esc(t.status)}">${STATUS[t.status]?.label || esc(t.status)}</span>`; }

/* ---------- 홈 ---------- */

function viewHome() {
  const tours = store.all('tours').sort((a, b) => String(b.start_date).localeCompare(String(a.start_date)) || String(b.created_at).localeCompare(String(a.created_at)));
  const shown = tours.filter((t) => ui.homeFilter === 'all' || t.status === ui.homeFilter);
  const today = new Date().toDateString();
  const todayPaid = {}, openOutstanding = {};
  for (const p of store.all('payments')) if (new Date(p.created_at).toDateString() === today) todayPaid[p.currency] = round2((todayPaid[p.currency] || 0) + num(p.amount));
  for (const t of tours.filter((t) => t.status === 'open')) {
    const c = tourCalc(store, t);
    for (const [k, v] of Object.entries(c.outstanding)) openOutstanding[k] = round2((openOutstanding[k] || 0) + v);
  }
  const tourById = new Map(tours.map((t) => [t.id, t]));
  const feed = [
    ...store.all('payments').map((p) => ({ ...p, _k: 'pay' })),
    ...store.all('expenses').map((e) => ({ ...e, _k: 'exp' })),
  ].filter((x) => tourById.has(x.tour_id)).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 8);
  const pax = (id) => store.get('passengers', id);
  const filters = [['open', '진행중'], ['submitted', '정산 제출'], ['closed', '완료'], ['all', '전체']];

  return `
  ${store.status.mode === 'local' ? `<div class="banner">체험 모드입니다. 데이터는 이 기기에만 저장되고, 같은 기기의 다른 탭과만 실시간으로 맞춰집니다. <a href="#/settings">자세히</a></div>` : ''}
  ${installEvent ? `<button class="banner install" data-act="install">휴대폰에 앱으로 설치하기</button>` : ''}
  <section class="kpis">
    <div class="kpi"><span class="label">오늘 수금</span><strong class="fig">${moneyList(todayPaid, '0')}</strong></div>
    <div class="kpi"><span class="label">진행중 투어 미수금</span><strong class="fig ${Object.keys(openOutstanding).length ? 'warn-t' : ''}">${moneyList(openOutstanding, '없음')}</strong></div>
  </section>
  <div class="row-head">
    <h2>투어</h2>
    <button class="btn primary" data-act="new-tour">+ 새 투어</button>
  </div>
  <div class="seg" role="tablist">${filters.map(([k, l]) => `<button class="${ui.homeFilter === k ? 'on' : ''}" data-act="filter" data-f="${k}">${l}</button>`).join('')}</div>
  <div class="tour-list">
    ${shown.length ? shown.map(tourCard).join('') : `<div class="empty"><p>이 목록에 투어가 없습니다.</p><p class="muted">‘+ 새 투어’로 BDY 번호를 등록하면 바로 주문서를 쓸 수 있습니다.</p></div>`}
  </div>
  <h2 class="sec">최근 기록</h2>
  <ul class="feed">
    ${feed.length ? feed.map((x) => {
      const t = tourById.get(x.tour_id);
      const who = x._k === 'pay' ? (pax(x.passenger_id)?.name_kor || '공통') : `${esc(x.place)} · ${esc(x.category)}`;
      return `<li><a href="#/tour/${esc(t.id)}/${x._k === 'pay' ? 'cash' : 'expenses'}">
        <span class="tag ${x._k}">${x._k === 'pay' ? '수금' : '지출'}</span>
        <span class="feed-main">${tourTitle(t)} · ${esc(who)}</span>
        <span class="fig ${x._k === 'pay' ? 'good-t' : ''}">${x._k === 'pay' ? '+' : '−'}${money(x.amount, x.currency)}</span>
        <span class="feed-meta">${esc(x.created_by || '')} · ${timeAgo(x.created_at)}</span></a></li>`;
    }).join('') : '<li class="muted">아직 기록이 없습니다.</li>'}
  </ul>`;
}

function tourCard(t) {
  const c = tourCalc(store, t);
  const cur = c.mainCur;
  const due = c.due[cur] || 0, paid = c.paid[cur] || 0;
  const pct = due ? Math.min(100, Math.round((paid / due) * 100)) : 0;
  return `<a class="tour-card" href="#/tour/${esc(t.id)}/orders">
    <div class="tc-top"><strong class="bdy">${tourTitle(t)}</strong>${statusPill(t)}</div>
    <div class="tc-meta">${REGIONS[t.region]?.label || esc(t.region)} · ${esc(t.tour_code || '')} · ${esc(t.start_date || '날짜 미정')} · ${esc(t.guide || '')}</div>
    <div class="tc-figs"><span>${c.passengers.length}명</span><span>판매 ${money(due, cur)}</span><span>수금 ${money(paid, cur)}</span></div>
    <div class="bar" aria-label="수금률 ${pct}%"><i style="width:${pct}%"></i></div>
    ${Object.keys(c.outstanding).length ? `<div class="tc-due">미수 ${moneyList(c.outstanding)}</div>` : ''}
  </a>`;
}

/* ---------- 투어 상세 ---------- */

const TABS = [['orders', '주문서'], ['cash', '수금'], ['expenses', '지출'], ['settle', '정산'], ['summary', '요약']];

function viewTour(id, tab) {
  const t = store.get('tours', id);
  if (!t) return `<div class="empty"><p>투어를 찾을 수 없습니다. 삭제되었을 수 있습니다.</p><a class="btn" href="#/">목록으로</a></div>`;
  const c = tourCalc(store, t);
  const body = { orders: tabOrders, cash: tabCash, expenses: tabExpenses, settle: tabSettle, summary: tabSummary }[tab] || tabOrders;
  if (tab === 'summary' && !window.XLSX) import('./excel.js').then((m) => m.preloadXLSX()).catch(() => {});
  return `
  <div class="tour-head">
    <a class="back" href="#/" aria-label="목록으로">‹</a>
    <div class="th-main">
      <div class="th-title"><strong class="bdy">${tourTitle(t)}</strong>${statusPill(t)}</div>
      <div class="tc-meta">${REGIONS[t.region]?.label || ''} · ${esc(t.tour_code || '')} · ${esc(t.start_date || '')} · ${esc(t.guide || '')} · ${c.passengers.length}명${c.products.filter((p) => p.rates?.length > 1).map((p) => ` · ${esc(p.name)} ${money(priceFor(t, p), p.currency)}`).join('')}</div>
    </div>
    <button class="icon-btn" data-act="edit-tour" data-id="${esc(t.id)}" aria-label="투어 정보 수정">✎</button>
  </div>
  ${t.status === 'closed' ? `<div class="banner lock">정산 완료된 투어라 수정할 수 없습니다.${isAdmin() ? ' 정산 탭에서 다시 열 수 있습니다.' : ''}</div>` : ''}
  <nav class="tabs">${TABS.map(([k, l]) => `<a class="${tab === k ? 'on' : ''}" href="#/tour/${esc(t.id)}/${k}">${l}</a>`).join('')}</nav>
  <div class="tab-body">${body(t, c)}</div>`;
}

function locked(t) {
  if (t.status === 'closed') { toast('정산 완료된 투어입니다. 다시 연 뒤 수정하세요.', 'bad'); return true; }
  return false;
}

function tabOrders(t, c) {
  if (!c.products.length) return `<div class="empty"><p>${REGIONS[t.region]?.label} 지역에 등록된 상품이 없습니다.</p><a class="btn" href="#/products">상품 등록하기</a></div>`;
  const modeBar = `
  <div class="modebar">
    <span class="label">누르면</span>
    <div class="seg modes">${Object.entries(MODES).map(([k, m]) => `<button class="m-${k} ${ui.orderMode === k ? 'on' : ''}" data-act="mode" data-mode="${k}">${m.label}</button>`).join('')}</div>
    ${ui.orderView === 'cards' ? `<label class="check-field small"><input type="checkbox" id="only-sel" data-act="only-sel" ${ui.onlySel ? 'checked' : ''}> 선택한 상품만</label>` : ''}
    <div class="seg small">${[['cards', '카드'], ['table', '표']].map(([k, l]) => `<button class="${ui.orderView === k ? 'on' : ''}" data-act="order-view" data-v="${k}">${l}</button>`).join('')}</div>
  </div>
  <p class="hint">상품을 누르면 <b>${MODES[ui.orderMode].label}</b>으로 표시되고, 같은 상태에서 한 번 더 누르면 취소됩니다. 현금만 수금 대상 금액에 들어갑니다.</p>`;
  const actions = `<div class="row-actions">
    <button class="btn primary" data-act="add-pax">+ 고객 추가</button>
    <button class="btn" data-act="bulk-pax">명단 붙여넣기</button>
  </div>`;
  if (!c.passengers.length) return modeBar + actions + `<div class="empty"><p>등록된 고객이 없습니다.</p><p class="muted">한 명씩 추가하거나, 엑셀 명단을 복사해 ‘명단 붙여넣기’로 한 번에 넣을 수 있습니다.</p></div>`;
  return modeBar + actions + (ui.orderView === 'table' ? ordersTable(t, c) : ordersCards(t, c)) + `
  <div class="totalbar"><span>현금 판매 합계</span><strong class="fig">${moneyList(c.due, '0')}</strong></div>`;
}

function groupBy(rows) {
  const g = new Map();
  for (const r of rows) { const k = r.p.group_no || 0; if (!g.has(k)) g.set(k, []); g.get(k).push(r); }
  return [...g.entries()];
}

function ordersCards(t, c) {
  return groupBy(c.passengers).map(([g, rows]) => {
    const sub = {};
    rows.forEach((r) => Object.entries(r.due).forEach(([k, v]) => { sub[k] = round2((sub[k] || 0) + v); }));
    return `<section class="grp">
      <h3><span>${g ? 'Group ' + esc(g) : '그룹 없음'}</span><small>${rows.length}명 · ${moneyList(sub, '0')}</small></h3>
      ${rows.map((r) => paxCard(t, c, r)).join('')}
    </section>`;
  }).join('');
}

function paxCard(t, c, r) {
  const bal = r.balance;
  const owes = Object.values(bal).some((v) => v > 0);
  const hasDue = Object.keys(r.due).length;
  return `<article class="pax">
    <header>
      <button class="pax-name" data-act="edit-pax" data-id="${esc(r.p.id)}"><strong>${esc(r.p.name_kor || r.p.name_eng)}</strong><span>${esc(r.p.name_eng)} ${esc(r.p.gender || '')}</span></button>
      <div class="pax-money">
        ${hasDue ? `<span class="fig">${moneyList(r.due)}</span>` : '<span class="muted">현금 주문 없음</span>'}
        ${owes ? `<button class="due-btn" data-act="pay" data-pax="${esc(r.p.id)}">미수 ${moneyList(Object.fromEntries(Object.entries(bal).filter(([, v]) => v > 0)))} · 수금</button>`
          : hasDue ? '<span class="paid-ok">완납</span>' : ''}
      </div>
    </header>
    ${r.p.note ? `<p class="pax-note">${esc(r.p.note)}</p>` : ''}
    <div class="chips">${c.products.filter((pr) => !ui.onlySel || expanded.has(r.p.id) || r.orders.has(pr.id)).map((pr) => {
      const o = r.orders.get(pr.id);
      return `<button class="chip ${o ? 'm-' + o.mode : ''}" data-act="tap-order" data-pax="${esc(r.p.id)}" data-prd="${esc(pr.id)}" aria-pressed="${!!o}">
        ${o ? `<i>${MODES[o.mode].label}</i>` : ''}${esc(pr.name)} <small>${money(o ? o.price : priceFor(t, pr), o ? o.currency : pr.currency)}</small></button>`;
    }).join('')}${ui.onlySel && !expanded.has(r.p.id) ? `<button class="chip more" data-act="expand" data-id="${esc(r.p.id)}">+ 상품 선택</button>` : ''}</div>
  </article>`;
}

function ordersTable(t, c) {
  return `<div class="scroll-x"><table class="matrix">
    <thead><tr><th class="stick">고객</th>${c.products.map((pr) => `<th><span>${esc(pr.name)}</span><small>${money(priceFor(t, pr), pr.currency)}</small></th>`).join('')}<th>개인별 합계</th><th>미수</th></tr></thead>
    <tbody>${c.passengers.map((r) => `<tr>
      <th class="stick"><button class="pax-name" data-act="edit-pax" data-id="${esc(r.p.id)}"><strong>${esc(r.p.name_kor || r.p.name_eng)}</strong><span>G${esc(r.p.group_no || '-')}</span></button></th>
      ${c.products.map((pr) => {
        const o = r.orders.get(pr.id);
        return `<td><button class="cell ${o ? 'm-' + o.mode : ''}" data-act="tap-order" data-pax="${esc(r.p.id)}" data-prd="${esc(pr.id)}" aria-label="${esc(pr.name)} ${o ? MODES[o.mode].label : '미선택'}">${o ? MODES[o.mode].mark : ''}</button></td>`;
      }).join('')}
      <td class="fig">${moneyList(r.due)}</td>
      <td>${Object.values(r.balance).some((v) => v > 0) ? `<button class="due-btn" data-act="pay" data-pax="${esc(r.p.id)}">${moneyList(Object.fromEntries(Object.entries(r.balance).filter(([, v]) => v > 0)))}</button>` : ''}</td>
    </tr>`).join('')}</tbody>
    <tfoot>
      <tr><th class="stick">현금 인원</th>${c.productRows.map((x) => `<td>${x.charged || ''}</td>`).join('')}<td></td><td></td></tr>
      <tr><th class="stick">신청 인원</th>${c.productRows.map((x) => `<td>${x.applied || ''}</td>`).join('')}<td></td><td></td></tr>
      <tr><th class="stick">금액</th>${c.productRows.map((x) => `<td class="fig">${x.amount ? money(x.amount, x.product.currency) : ''}</td>`).join('')}<td class="fig">${moneyList(c.due)}</td><td></td></tr>
    </tfoot>
  </table></div>
  <p class="hint">● 현금 · P 선결제 · H 홈쇼핑 · C 보상</p>`;
}

function tabCash(t, c) {
  const curs = CURRENCIES.filter((k) => c.due[k] || c.paid[k]);
  if (!curs.length) curs.push(c.mainCur);
  const owing = c.passengers.filter((r) => Object.values(r.balance).some((v) => v > 0));
  const pax = new Map(c.passengers.map((r) => [r.p.id, r.p]));
  const pays = [...c.payments].sort((a, b) => b.created_at.localeCompare(a.created_at));
  return `
  <table class="sumtable">
    <thead><tr><th></th>${curs.map((k) => `<th>${k}</th>`).join('')}</tr></thead>
    <tbody>
      <tr><th>판매 (현금)</th>${curs.map((k) => `<td class="fig">${money(c.due[k] || 0, k)}</td>`).join('')}</tr>
      <tr><th>수금</th>${curs.map((k) => `<td class="fig good-t">${money(c.paid[k] || 0, k)}</td>`).join('')}</tr>
      <tr class="em"><th>남은 금액</th>${curs.map((k) => { const v = round2((c.due[k] || 0) - (c.paid[k] || 0)); return `<td class="fig ${v > 0 ? 'warn-t' : v < 0 ? 'bad-t' : ''}">${money(v, k)}</td>`; }).join('')}</tr>
    </tbody>
  </table>
  <div class="row-actions"><button class="btn primary" data-act="pay">+ 수금 기록</button></div>
  <h3 class="sec">미수 고객 <small>${owing.length}명</small></h3>
  <ul class="list">${owing.length ? owing.map((r) => `<li>
      <div><strong>${esc(r.p.name_kor || r.p.name_eng)}</strong> <span class="muted">G${esc(r.p.group_no || '-')}</span></div>
      <button class="due-btn" data-act="pay" data-pax="${esc(r.p.id)}">${moneyList(Object.fromEntries(Object.entries(r.balance).filter(([, v]) => v > 0)))} 수금</button>
    </li>`).join('') : '<li class="muted">미수 고객이 없습니다.</li>'}</ul>
  <h3 class="sec">수금 내역 <small>${pays.length}건</small></h3>
  <ul class="list">${pays.length ? pays.map((p) => `<li>
      <div class="li-main"><strong>${esc(pax.get(p.passenger_id)?.name_kor || '공통')}</strong>
        <span class="muted">${PAY_METHODS[p.method] || esc(p.method)}${p.note ? ' · ' + esc(p.note) : ''}</span>
        <span class="feed-meta">${esc(p.created_by || '')} · ${new Date(p.created_at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span></div>
      <span class="fig good-t">+${money(p.amount, p.currency)}</span>
      <button class="icon-btn" data-act="del-pay" data-id="${esc(p.id)}" aria-label="수금 기록 삭제">×</button>
    </li>`).join('') : '<li class="muted">아직 수금 기록이 없습니다.</li>'}</ul>`;
}

function tabExpenses(t, c) {
  const list = [...c.expenses].sort((a, b) => b.created_at.localeCompare(a.created_at));
  return `
  <div class="kpis"><div class="kpi"><span class="label">지출 + 계좌이체 합계 (C)</span><strong class="fig">${moneyList(c.spent, '0')}</strong></div></div>
  <div class="row-actions"><button class="btn primary" data-act="add-exp">+ 지출 기록</button></div>
  <ul class="list">${list.length ? list.map((e) => `<li>
      <div class="li-main"><strong>${esc(e.category)}</strong> <span class="tag ${e.kind === 'transfer' ? 'tr' : 'exp'}">${e.kind === 'transfer' ? '계좌이체·환전' : esc(e.place)}</span>
        ${e.note ? `<span class="muted">${esc(e.note)}</span>` : ''}
        <span class="feed-meta">${esc(e.created_by || '')} · ${new Date(e.created_at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span></div>
      <span class="fig">−${money(e.amount, e.currency)}</span>
      <button class="icon-btn" data-act="del-exp" data-id="${esc(e.id)}" aria-label="지출 기록 삭제">×</button>
    </li>`).join('') : '<li class="muted">지출 기록이 없습니다. 팁, 커미션, 가이드 대납, 크루즈팁 등을 쓰는 즉시 기록하세요.</li>'}</ul>`;
}

function tabSettle(t, c) {
  const ro = t.status === 'closed' ? 'disabled' : '';
  const curs = c.settlement.map((r) => r.currency);
  if (ui.extraCur && !curs.includes(ui.extraCur)) curs.push(ui.extraCur);
  const denomGrid = (cur) => {
    const counts = t.cash_on_hand?.[cur] || {};
    return `<div class="denoms"><h4>${cur} <span class="fig">${money(cashOnHand(t, cur), cur)}</span></h4>
      <div class="dgrid">${(DENOMS[cur] || []).map((d) => `<label><span>${d.toLocaleString()}</span><input type="number" inputmode="numeric" min="0" ${ro} id="cnt-${cur}-${d}" data-cnt="${cur}" data-den="${d}" value="${esc(counts[d] || '')}" placeholder="0"></label>`).join('')}
        <label class="other"><span>동전·기타 금액</span><input type="number" inputmode="decimal" ${ro} id="cnt-${cur}-other" data-cnt="${cur}" data-den="other" value="${esc(counts.other || '')}" placeholder="0"></label></div></div>`;
  };
  const checks = [['finance_check', '재무팀 확인'], ['md_check', '대표 확인']];
  return `
  <div class="scroll-x"><table class="sumtable settle">
    <thead><tr><th></th>${c.settlement.map((r) => `<th>${r.currency}</th>`).join('')}</tr></thead>
    <tbody>
      <tr><th>A 회사에서 받은 돈</th>${c.settlement.map((r) => `<td><input class="fig" type="number" inputmode="decimal" ${ro} id="recv-${r.currency}" data-recv="${r.currency}" value="${esc(r.A || '')}" placeholder="0"></td>`).join('')}</tr>
      <tr><th>B 판매 (현금 주문)</th>${c.settlement.map((r) => `<td class="fig">${money(r.B, r.currency)}</td>`).join('')}</tr>
      <tr><th>C 지출·계좌이체</th>${c.settlement.map((r) => `<td class="fig">−${money(r.C, r.currency)}</td>`).join('')}</tr>
      <tr><th>D 카드·계좌이체 수금 <small>현금이 아니라 손에 없는 돈</small></th>${c.settlement.map((r) => `<td class="fig">−${money(r.D, r.currency)}</td>`).join('')}</tr>
      <tr class="em"><th>F 있어야 할 돈 <small>A+B−C−D</small></th>${c.settlement.map((r) => `<td class="fig">${money(r.F, r.currency)}</td>`).join('')}</tr>
      <tr><th>E 보유 현금 <small>아래에서 세기</small></th>${c.settlement.map((r) => `<td class="fig">${money(r.E, r.currency)}</td>`).join('')}</tr>
      <tr class="em"><th>편차 <small>E−F</small></th>${c.settlement.map((r) => `<td class="fig diff ${r.diff === 0 ? 'zero' : r.diff < 0 ? 'neg' : 'pos'}">${r.diff > 0 ? '+' : ''}${money(r.diff, r.currency)}</td>`).join('')}</tr>
      <tr><th class="muted">참고: 실제 수금 기록</th>${c.settlement.map((r) => `<td class="fig muted">${money(r.collected, r.currency)}</td>`).join('')}</tr>
    </tbody>
  </table></div>
  <p class="hint">편차가 0이면 정산이 맞습니다. 마이너스는 돈이 부족하고, 플러스는 남는다는 뜻입니다. 아직 받지 못한 미수금이 있으면 그만큼 마이너스로 나옵니다.</p>
  <h3 class="sec">보유 현금 세기 (E)</h3>
  ${curs.map(denomGrid).join('')}
  <label class="field inline"><span>다른 통화 추가</span><select id="extra-cur" data-extra-cur>
    <option value="">선택</option>${CURRENCIES.filter((k) => !curs.includes(k)).map((k) => `<option>${k}</option>`).join('')}</select></label>
  <h3 class="sec">비고</h3>
  <textarea id="tour-notes" data-notes rows="3" ${ro} placeholder="예: 360 비는 돈, 20유로 추가 납부 필요">${esc(t.notes || '')}</textarea>
  <h3 class="sec">확인</h3>
  <div class="checks">${checks.map(([k, l]) => `<div class="check ${t[k] ? 'done' : ''}">
      <span>${l}</span>
      ${t[k] ? `<strong>${esc(t[k].name)}</strong><small>${new Date(t[k].at).toLocaleString('ko-KR')}</small>` : '<small>대기</small>'}
      ${isAdmin() ? `<button class="btn small" data-act="check" data-k="${k}">${t[k] ? '취소' : '확인'}</button>` : ''}
    </div>`).join('')}</div>
  <div class="row-actions">
    ${t.status === 'open' ? `<button class="btn primary" data-act="status" data-to="submitted">정산 제출</button>` : ''}
    ${t.status === 'submitted' && isAdmin() ? `<button class="btn primary" data-act="status" data-to="closed">정산 완료</button>` : ''}
    ${t.status !== 'open' && (isAdmin() || t.status === 'submitted') ? `<button class="btn" data-act="status" data-to="open">다시 열기</button>` : ''}
  </div>`;
}

function tabSummary(t, c) {
  const modeCols = Object.entries(MODES).filter(([k]) => k !== 'cash');
  return `
  <div class="scroll-x"><table class="sumtable">
    <thead><tr><th>상품</th><th>단가</th><th>신청</th><th>현금</th>${modeCols.map(([, m]) => `<th>${m.label}</th>`).join('')}<th>금액</th></tr></thead>
    <tbody>${c.productRows.filter((r) => r.applied).map((r) => `<tr>
      <th>${esc(r.product.name)}${r.product.units > 1 ? ' <small>(×2)</small>' : ''}</th>
      <td class="fig">${money(r.product.price, r.product.currency)}</td>
      <td class="fig">${r.applied}</td><td class="fig">${r.charged}</td>
      ${modeCols.map(([k]) => `<td class="fig">${r.modes[k] || ''}</td>`).join('')}
      <td class="fig">${money(r.amount, r.product.currency)}</td></tr>`).join('') || `<tr><td colspan="${5 + modeCols.length}" class="muted">선택된 상품이 없습니다.</td></tr>`}</tbody>
    <tfoot><tr><th>합계</th><td></td><td class="fig">${c.productRows.reduce((s, r) => s + r.applied, 0)}</td><td class="fig">${c.productRows.reduce((s, r) => s + r.charged, 0)}</td>${modeCols.map(() => '<td></td>').join('')}<td class="fig">${moneyList(c.due, '0')}</td></tr>
      <tr><th>총 옵션 수</th><td colspan="${4 + modeCols.length}" class="fig">${c.productRows.reduce((s, r) => s + r.tickets, 0)}개 (결합상품은 2개로 계산)</td></tr></tfoot>
  </table></div>
  <div class="row-actions">
    <button class="btn primary" data-act="export">엑셀로 내려받기</button>
    <button class="btn" data-act="edit-tour" data-id="${esc(t.id)}">투어 정보 수정</button>
    ${isAdmin() ? `<button class="btn danger" data-act="del-tour" data-id="${esc(t.id)}">투어 삭제</button>` : ''}
  </div>
  <p class="hint">엑셀 파일에는 CC(주문서), 정산서, 수금 내역, 지출 내역 시트가 들어갑니다.</p>`;
}

/* ---------- 상품 ---------- */

function viewProducts() {
  const list = store.all('products').filter((p) => p.region === ui.productRegion).sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
  return `
  <div class="row-head"><h2>상품·가격</h2>${isAdmin() ? '<button class="btn primary" data-act="add-prd">+ 상품 추가</button>' : ''}</div>
  <div class="seg">${Object.entries(REGIONS).map(([k, r]) => `<button class="${ui.productRegion === k ? 'on' : ''}" data-act="prd-region" data-r="${k}">${r.label}</button>`).join('')}</div>
  <p class="hint">가격을 바꿔도 이미 입력된 주문의 가격은 그대로 유지됩니다.${isAdmin() ? '' : ' 상품 수정은 관리자만 할 수 있습니다.'}</p>
  <ul class="list products">${list.map((p) => `<li class="${p.active === false ? 'off' : ''}">
    <button class="li-main as-btn" data-act="edit-prd" data-id="${esc(p.id)}" ${isAdmin() ? '' : 'disabled'}>
      <strong>${esc(p.name)}</strong>
      <span class="muted">${p.rates?.length ? '투어별 요금 ' + p.rates.join(' / ') + ' · ' : ''}${p.units > 1 ? '결합상품 (2개로 계산) · ' : ''}${p.active === false ? '숨김' : '판매중'}</span>
    </button>
    <span class="fig">${money(p.price, p.currency)}</span>
  </li>`).join('') || '<li class="muted">등록된 상품이 없습니다.</li>'}</ul>`;
}

/* ---------- 설정 ---------- */

function viewSettings() {
  const local = store.status.mode === 'local';
  return `
  <h2>설정</h2>
  <section class="card">
    <h3>내 정보</h3>
    <p><strong>${esc(me())}</strong> <span class="pill">${isAdmin() ? '관리자' : '직원'}</span></p>
    ${local ? '<button class="btn" data-act="set-name">이름 바꾸기</button>' : `<p class="muted">${esc(store.user.email || '')}</p><button class="btn" data-act="sign-out">로그아웃</button>`}
  </section>
  <section class="card">
    <h3>휴대폰에 설치</h3>
    ${installEvent ? '<button class="btn primary" data-act="install">앱으로 설치</button>' : ''}
    <p><b>아이폰</b>: Safari로 열고 공유 버튼 → ‘홈 화면에 추가’.</p>
    <p><b>안드로이드</b>: Chrome으로 열고 메뉴(⋮) → ‘앱 설치’ 또는 ‘홈 화면에 추가’.</p>
    <p class="muted">설치하면 앱처럼 전체 화면으로 열리고, 인터넷이 잠시 끊겨도 입력한 내용은 기기에 보관했다가 연결되면 전송됩니다.</p>
  </section>
  <section class="card">
    <h3>데이터 연결</h3>
    ${local ? `<p>지금은 <b>체험 모드</b>입니다. 데이터가 이 기기의 브라우저에만 저장되어 다른 직원과 공유되지 않습니다.</p>
      <p class="muted">Supabase(무료) 프로젝트를 연결하면 모든 직원 휴대폰이 같은 데이터를 실시간으로 봅니다. 설정 방법은 README에 있습니다.</p>
      <div class="row-actions"><button class="btn" data-act="reset-local" data-sample="1">예시 데이터로 되돌리기</button><button class="btn danger" data-act="reset-local" data-sample="0">모두 지우고 빈 상태로</button></div>`
      : `<p>Supabase 서버에 연결되어 있습니다. 상태: <b>${esc($('#conn').textContent)}</b></p>${store.status.pending ? `<p class="warn-t">아직 서버로 보내지 못한 변경 ${store.status.pending}건이 이 기기에 보관되어 있습니다.</p>` : ''}`}
  </section>`;
}

function renderLogin() {
  $('#conn').className = 'conn';
  $('#conn').textContent = '로그인 필요';
  document.body.classList.add('login');
  $('#view').innerHTML = `
  <form class="card login-card" id="login-form">
    <img class="login-logo" src="icons/logo.svg" alt="Badaya Field">
    <h2>로그인</h2>
    <p class="muted">회사에서 받은 이메일과 비밀번호로 로그인하세요.</p>
    <label class="field"><span>이메일</span><input id="login-email" name="email" type="email" autocomplete="username" required></label>
    <label class="field"><span>비밀번호</span><input id="login-pw" name="password" type="password" autocomplete="current-password" required></label>
    <button class="btn primary wide" type="submit">로그인</button>
    <p class="err" id="login-err" hidden></p>
  </form>`;
  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      await store.signIn(f.get('email'), f.get('password'));
      location.reload();
    } catch (err) {
      $('#login-err').hidden = false;
      $('#login-err').textContent = '로그인하지 못했습니다. 이메일과 비밀번호를 확인하세요.';
    }
  });
}

/* ---------- 시트(입력창) ---------- */

function openSheet({ title, body, submit = '저장', onSubmit, onChange, extra = '' }) {
  const wrap = document.createElement('div');
  wrap.className = 'sheet-wrap';
  wrap.innerHTML = `<form class="sheet" novalidate>
    <header><h3>${title}</h3><button type="button" class="icon-btn" data-close aria-label="닫기">×</button></header>
    <div class="sheet-body">${body}</div>
    <p class="err" hidden></p>
    <footer>${extra}<button type="button" class="btn" data-close>취소</button><button class="btn primary" type="submit">${submit}</button></footer>
  </form>`;
  const form = wrap.querySelector('form');
  const close = () => { wrap.remove(); document.body.classList.remove('sheet-open'); renderDeferred && scheduleRender(); };
  wrap.addEventListener('click', (e) => { if (e.target === wrap || e.target.closest('[data-close]')) close(); });
  if (onChange) form.addEventListener('input', (e) => onChange(form, e));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    try {
      const keep = await onSubmit(data, form, e.submitter);
      if (keep !== false) close();
    } catch (err) {
      const p = form.querySelector('.err');
      p.hidden = false;
      p.textContent = err.message;
    }
  });
  document.body.appendChild(wrap);
  document.body.classList.add('sheet-open');
  setTimeout(() => form.querySelector('input:not([type=hidden]),select,textarea')?.focus({ preventScroll: true }), 60);
  return { form, close };
}

function confirmSheet(message, ok = '삭제') {
  return new Promise((resolve) => {
    let answered = false;
    const s = openSheet({
      title: '확인', body: `<p>${message}</p>`, submit: ok,
      onSubmit: () => { answered = true; resolve(true); },
    });
    s.form.querySelector('.btn.primary').classList.add('danger');
    const obs = new MutationObserver(() => { if (!document.body.contains(s.form)) { obs.disconnect(); if (!answered) resolve(false); } });
    obs.observe(document.body, { childList: true });
  });
}

function toast(msg, kind = '') {
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

const opt = (v, label, sel) => `<option value="${esc(v)}" ${String(v) === String(sel) ? 'selected' : ''}>${esc(label)}</option>`;

function require(cond, msg) { if (!cond) throw new Error(msg); }

/* ---------- 입력 화면들 ---------- */

function askName() {
  openSheet({
    title: '이름을 알려주세요',
    body: `<p class="muted">수금·지출 기록에 입력자로 남습니다.</p><label class="field"><span>이름</span><input name="name" id="f-name" value="${esc(store.user.name)}" placeholder="예: 김가이드"></label>`,
    onSubmit: (d) => { require(d.name.trim(), '이름을 입력하세요.'); store.setUserName(d.name.trim()); },
  });
}

function sheetTour(t) {
  const isNew = !t;
  t = t || { region: 'DUBAI', tour_code: '', start_date: new Date().toISOString().slice(0, 10), guide: me(), status: 'open' };
  openSheet({
    title: isNew ? '새 투어' : '투어 정보 수정',
    body: `
      <label class="field"><span>BDY 번호 (숫자만)</span><input name="bdy" id="f-bdy" inputmode="numeric" pattern="[0-9]*" value="${esc(t.bdy || '')}" placeholder="예: 4229"></label>
      <label class="field"><span>지역</span><select name="region" id="f-region">${Object.entries(REGIONS).map(([k, r]) => opt(k, `${r.label} (${r.currency})`, t.region)).join('')}</select></label>
      <label class="field"><span>투어 기간 코드</span><input name="tour_code" id="f-code" list="tour-codes" value="${esc(t.tour_code || '')}" placeholder="예: EK3N6D"><datalist id="tour-codes">${TOUR_CODES.map((c) => `<option value="${c}">`).join('')}</datalist></label>
      <label class="field"><span>출발일</span><input name="start_date" id="f-date" type="date" value="${esc(t.start_date || '')}"></label>
      <label class="field"><span>가이드 / 인솔자</span><input name="guide" id="f-guide" value="${esc(t.guide || '')}"></label>
      <div id="rate-fields">${rateFields(t, t.region)}</div>`,
    onChange: (form, e) => { if (e.target.name === 'region') form.querySelector('#rate-fields').innerHTML = rateFields(t, form.region.value); },
    submit: isNew ? '만들기' : '저장',
    onSubmit: async (d) => {
      require(/^\d+$/.test(d.bdy.trim()), 'BDY 번호는 숫자만 입력하세요.');
      const dup = store.all('tours').find((x) => x.bdy === d.bdy.trim() && x.id !== t.id);
      require(!dup, `BDY ${d.bdy} 투어가 이미 있습니다.`);
      const prices = {};
      for (const [k, v] of Object.entries(d)) if (k.startsWith('rate:') && v !== '') prices[k.slice(5)] = num(v);
      const row = { ...t, id: t.id || uid(), bdy: d.bdy.trim(), region: d.region, tour_code: d.tour_code.trim(), start_date: d.start_date || null, guide: d.guide.trim(), prices, cash_received: t.cash_received || {}, cash_on_hand: t.cash_on_hand || {} };
      await store.put('tours', row);
      // 요금을 바꾸면 이 투어에 이미 입력된 주문 가격도 함께 바꿈
      for (const [pid, price] of Object.entries(prices)) {
        for (const o of store.all('orders').filter((o) => o.tour_id === row.id && o.product_id === pid && Number(o.price) !== price)) {
          await store.put('orders', { ...o, price, updated_by: me() });
        }
      }
      if (isNew) location.hash = `#/tour/${row.id}/orders`;
    },
  });
}

function parseRates(text) {
  const list = String(text || '').split(/[,\s/]+/).map(num).filter((n) => n > 0);
  return list.length > 1 ? [...new Set(list)] : null;
}

function rateFields(t, region) {
  const list = store.all('products').filter((p) => p.region === region && p.active !== false && p.rates?.length > 1);
  return list.map((p) => {
    const cur = priceFor(region === t.region ? t : null, p);
    return `<label class="field"><span>${esc(p.name)} 요금 (이 투어)</span><select name="rate:${esc(p.id)}" id="f-rate-${esc(p.id)}">${p.rates.map((r) => opt(r, money(r, p.currency), cur)).join('')}</select></label>`;
  }).join('');
}

function sheetPax(t, p) {
  const isNew = !p;
  const last = store.all('passengers').filter((x) => x.tour_id === t.id).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];
  p = p || { group_no: last?.group_no || 1, gender: '' };
  const s = openSheet({
    title: isNew ? '고객 추가' : '고객 정보',
    body: `
      <label class="field"><span>그룹</span><input name="group_no" id="f-group" type="number" inputmode="numeric" min="0" value="${esc(p.group_no || '')}"></label>
      <label class="field"><span>이름 (한글)</span><input name="name_kor" id="f-kor" value="${esc(p.name_kor || '')}" placeholder="홍길동"></label>
      <label class="field"><span>이름 (영문, 여권)</span><input name="name_eng" id="f-eng" value="${esc(p.name_eng || '')}" placeholder="HONG/GILDONG" autocapitalize="characters"></label>
      <label class="field"><span>호칭</span><select name="gender" id="f-gender">${opt('', '-', p.gender)}${opt('Mr', 'Mr', p.gender)}${opt('Ms', 'Ms', p.gender)}</select></label>
      <label class="field"><span>특이사항</span><input name="note" id="f-note" value="${esc(p.note || '')}" placeholder="예: 홈쇼핑 고객, 보상 사유"></label>`,
    submit: isNew ? '추가' : '저장',
    extra: isNew ? '<button type="submit" class="btn" name="again" value="1">추가 후 계속</button>' : '<button type="button" class="btn danger" data-del-pax>삭제</button>',
    onSubmit: async (d, form, submitter) => {
      require(d.name_kor.trim() || d.name_eng.trim(), '이름을 입력하세요.');
      const row = { ...p, id: p.id || uid(), tour_id: t.id, group_no: parseInt(d.group_no, 10) || 0, name_kor: d.name_kor.trim(), name_eng: d.name_eng.trim().toUpperCase(), gender: d.gender, note: d.note.trim(), sort: p.sort ?? Date.now() };
      await store.put('passengers', row);
      if (submitter?.name === 'again') {
        toast(`${row.name_kor || row.name_eng} 추가됨`, 'good');
        form.name_kor.value = ''; form.name_eng.value = ''; form.note.value = ''; form.gender.value = '';
        form.name_kor.focus();
        return false;
      }
    },
  });
  s.form.querySelector('[data-del-pax]')?.addEventListener('click', async () => {
    if (locked(t)) return;
    const hasPay = store.all('payments').some((x) => x.passenger_id === p.id);
    if (hasPay) return toast('수금 기록이 있는 고객은 삭제할 수 없습니다. 수금 내역을 먼저 정리하세요.', 'bad');
    s.close();
    if (await confirmSheet(`${esc(p.name_kor || p.name_eng)} 고객과 주문을 삭제할까요?`)) await store.delPassenger(p.id);
  });
}

function sheetBulk(t) {
  openSheet({
    title: '명단 붙여넣기',
    body: `<p class="muted">엑셀에서 <b>그룹 · 한글이름 · 영문이름 · 호칭</b> 순서의 열을 복사해 붙여넣으세요. 한 줄에 한 명이며, 칸은 탭이나 쉼표로 나뉩니다. 그룹이 비어 있으면 윗줄 그룹을 따릅니다.</p>
      <textarea name="rows" id="f-rows" rows="8" placeholder="1	홍길동	HONG/GILDONG	Mr&#10;	김영희	KIM/YOUNGHEE	Ms"></textarea>`,
    submit: '추가',
    onSubmit: async (d) => {
      const lines = d.rows.split(/\r?\n/).filter((l) => l.trim());
      require(lines.length, '붙여넣은 명단이 없습니다.');
      let group = 1, n = 0;
      const base = Date.now();
      for (const line of lines) {
        const cols = line.split(line.includes('\t') ? '\t' : ',').map((x) => x.trim());
        if (/^\d+$/.test(cols[0])) group = parseInt(cols[0], 10);
        const [ , kor = '', eng = '', g = ''] = /^\d*$/.test(cols[0]) ? cols : ['', ...cols];
        if (!kor && !eng) continue;
        await store.put('passengers', { id: uid(), tour_id: t.id, group_no: group, name_kor: kor, name_eng: eng.toUpperCase(), gender: /^m(r|s)$/i.test(g) ? g[0].toUpperCase() + g[1].toLowerCase() : '', note: '', sort: base + n });
        n++;
      }
      toast(`${n}명 추가됨`, 'good');
    },
  });
}

function sheetPayment(t, paxId) {
  const c = tourCalc(store, t);
  const row = c.passengers.find((r) => r.p.id === paxId);
  const suggest = (r) => {
    const owe = r ? Object.entries(r.balance).filter(([, v]) => v > 0) : [];
    return owe.length ? { cur: owe[0][0], amt: owe[0][1] } : { cur: c.mainCur, amt: '' };
  };
  const s0 = suggest(row);
  openSheet({
    title: '수금 기록',
    body: `
      <label class="field"><span>고객</span><select name="passenger_id" id="f-pax">${opt('', '공통 (특정 고객 아님)', paxId || '')}${c.passengers.map((r) => {
        const owe = Object.fromEntries(Object.entries(r.balance).filter(([, v]) => v > 0));
        return opt(r.p.id, `G${r.p.group_no || '-'} ${r.p.name_kor || r.p.name_eng}${Object.keys(owe).length ? ' · 미수 ' + moneyList(owe) : ''}`, paxId || '');
      }).join('')}</select></label>
      <div class="field-row">
        <label class="field"><span>통화</span><select name="currency" id="f-cur">${CURRENCIES.map((k) => opt(k, k, s0.cur)).join('')}</select></label>
        <label class="field grow"><span>금액</span><input name="amount" id="f-amt" type="number" inputmode="decimal" step="0.01" value="${esc(s0.amt)}" placeholder="0"></label>
      </div>
      <div class="field"><span>방법</span><div class="seg">${Object.entries(PAY_METHODS).map(([k, l], i) => `<label class="radio"><input type="radio" name="method" value="${k}" ${i === 0 ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div></div>
      <label class="field"><span>메모</span><input name="note" id="f-pnote" placeholder="선택"></label>`,
    submit: '수금 저장',
    onChange: (form, e) => {
      if (e.target.name !== 'passenger_id') return;
      const s = suggest(c.passengers.find((r) => r.p.id === form.passenger_id.value));
      form.currency.value = s.cur;
      form.amount.value = s.amt;
    },
    onSubmit: async (d) => {
      const amount = round2(num(d.amount));
      require(amount > 0, '금액을 입력하세요.');
      await store.put('payments', { id: uid(), tour_id: t.id, passenger_id: d.passenger_id || null, currency: d.currency, amount, method: d.method, note: d.note.trim(), created_by: me() });
      navigator.vibrate?.(20);
      toast(`${money(amount, d.currency)} 수금 기록됨`, 'good');
    },
  });
}

function sheetExpense(t) {
  const main = REGIONS[t.region]?.currency || 'USD';
  openSheet({
    title: '지출 기록',
    body: `
      <div class="field"><span>구분</span><div class="seg"><label class="radio"><input type="radio" name="kind" value="expense" checked><span>투어 지출</span></label><label class="radio"><input type="radio" name="kind" value="transfer"><span>계좌이체·환전</span></label></div></div>
      <div class="field-row">
        <label class="field"><span>장소</span><select name="place" id="f-place">${EXPENSE_PLACES.map((p) => opt(p, p, REGIONS[t.region]?.label)).join('')}</select></label>
        <label class="field grow"><span>항목</span><input name="category" id="f-cat" list="exp-cats" placeholder="팁, 커미션…"><datalist id="exp-cats">${EXPENSE_CATEGORIES.map((x) => `<option value="${x}">`).join('')}</datalist></label>
      </div>
      <div class="field-row">
        <label class="field"><span>통화</span><select name="currency" id="f-ecur">${CURRENCIES.map((k) => opt(k, k, main)).join('')}</select></label>
        <label class="field grow"><span>금액</span><input name="amount" id="f-eamt" type="number" inputmode="decimal" step="0.01" placeholder="0"></label>
      </div>
      <label class="field"><span>메모</span><input name="note" id="f-enote" placeholder="예: 사파리 드라이버 팁"></label>`,
    submit: '지출 저장',
    onSubmit: async (d) => {
      const amount = round2(num(d.amount));
      require(amount > 0, '금액을 입력하세요.');
      require(d.category.trim(), '항목을 입력하세요.');
      await store.put('expenses', { id: uid(), tour_id: t.id, kind: d.kind, place: d.place, category: d.category.trim(), currency: d.currency, amount, note: d.note.trim(), created_by: me() });
      toast('지출 기록됨', 'good');
    },
  });
}

function sheetProduct(p) {
  const isNew = !p;
  p = p || { region: ui.productRegion, currency: REGIONS[ui.productRegion].currency, units: 1, active: true };
  const s = openSheet({
    title: isNew ? '상품 추가' : '상품 수정',
    body: `
      <label class="field"><span>지역</span><select name="region" id="f-preg">${Object.entries(REGIONS).map(([k, r]) => opt(k, r.label, p.region)).join('')}</select></label>
      <label class="field"><span>상품명</span><input name="name" id="f-pname" value="${esc(p.name || '')}"></label>
      <div class="field-row">
        <label class="field grow"><span>가격</span><input name="price" id="f-pprice" type="number" inputmode="decimal" step="0.01" value="${esc(p.price ?? '')}"></label>
        <label class="field"><span>통화</span><select name="currency" id="f-pcur">${CURRENCIES.map((k) => opt(k, k, p.currency)).join('')}</select></label>
      </div>
      <label class="field"><span>투어별 요금 선택지 (선택)</span><input name="rates" id="f-prates" inputmode="decimal" value="${esc((p.rates || []).join(', '))}" placeholder="예: 90, 100 → 투어 만들 때 고름"></label>
      <label class="check-field"><input type="checkbox" name="combo" id="f-combo" ${p.units > 1 ? 'checked' : ''}> 결합상품 (옵션 수를 2개로 계산)</label>
      <label class="check-field"><input type="checkbox" name="active" id="f-active" ${p.active !== false ? 'checked' : ''}> 주문서에 표시</label>`,
    extra: isNew ? '' : '<button type="button" class="btn danger" data-del-prd>삭제</button>',
    onSubmit: async (d) => {
      require(d.name.trim(), '상품명을 입력하세요.');
      const max = Math.max(0, ...store.all('products').map((x) => x.sort || 0));
      await store.put('products', { ...p, id: p.id || uid(), region: d.region, name: d.name.trim(), price: round2(num(d.price)), rates: parseRates(d.rates), currency: d.currency, units: d.combo ? 2 : 1, active: !!d.active, sort: p.sort ?? max + 10 });
    },
  });
  s.form.querySelector('[data-del-prd]')?.addEventListener('click', async () => {
    if (store.all('orders').some((o) => o.product_id === p.id)) return toast('주문에 쓰인 상품은 삭제 대신 ‘주문서에 표시’를 끄세요.', 'bad');
    s.close();
    if (await confirmSheet(`${esc(p.name)} 상품을 삭제할까요?`)) await store.del('products', p.id);
  });
}

/* ---------- 이벤트 ---------- */

function currentTour() {
  const r = route();
  return r.page === 'tour' ? store.get('tours', r.id) : null;
}

const actions = {
  'new-tour': () => sheetTour(),
  'edit-tour': (d) => { const t = store.get('tours', d.id); if (t && !locked(t)) sheetTour(t); },
  filter: (d) => { ui.homeFilter = d.f; saveUI(); render(); },
  mode: (d) => { ui.orderMode = d.mode; saveUI(); render(); },
  'only-sel': () => { ui.onlySel = !ui.onlySel; expanded.clear(); saveUI(); render(); },
  expand: (d) => { expanded.add(d.id); render(); },
  'order-view': (d) => { ui.orderView = d.v; saveUI(); render(); },
  'tap-order': async (d) => {
    const t = currentTour();
    if (!t || locked(t)) return;
    const pr = store.get('products', d.prd);
    const id = d.pax + ':' + d.prd;
    const o = store.get('orders', id);
    navigator.vibrate?.(8);
    if (o && o.mode === ui.orderMode) await store.del('orders', id);
    else await store.put('orders', { id, tour_id: t.id, passenger_id: d.pax, product_id: d.prd, mode: ui.orderMode, price: o?.price ?? priceFor(t, pr), currency: o?.currency ?? pr.currency, updated_by: me() });
  },
  'add-pax': () => { const t = currentTour(); if (t && !locked(t)) sheetPax(t); },
  'bulk-pax': () => { const t = currentTour(); if (t && !locked(t)) sheetBulk(t); },
  'edit-pax': (d) => { const t = currentTour(); if (t && !locked(t)) sheetPax(t, store.get('passengers', d.id)); },
  pay: (d) => { const t = currentTour(); if (t && !locked(t)) sheetPayment(t, d.pax); },
  'del-pay': async (d) => {
    const t = currentTour(); if (!t || locked(t)) return;
    const p = store.get('payments', d.id);
    if (p && await confirmSheet(`${money(p.amount, p.currency)} 수금 기록을 삭제할까요?`)) await store.del('payments', d.id);
  },
  'add-exp': () => { const t = currentTour(); if (t && !locked(t)) sheetExpense(t); },
  'del-exp': async (d) => {
    const t = currentTour(); if (!t || locked(t)) return;
    const e = store.get('expenses', d.id);
    if (e && await confirmSheet(`${esc(e.category)} ${money(e.amount, e.currency)} 지출 기록을 삭제할까요?`)) await store.del('expenses', d.id);
  },
  status: async (d) => {
    const t = currentTour(); if (!t) return;
    if (d.to === 'closed' && !(await confirmSheet('정산을 완료하면 이 투어는 더 이상 수정할 수 없습니다. 완료할까요?', '정산 완료'))) return;
    await store.patch('tours', t.id, { status: d.to });
    toast(STATUS[d.to].label + '(으)로 변경됨', 'good');
  },
  check: async (d) => {
    const t = currentTour(); if (!t) return;
    await store.patch('tours', t.id, { [d.k]: t[d.k] ? null : { name: me(), at: new Date().toISOString() } });
  },
  export: async () => {
    const t = currentTour(); if (!t) return;
    try {
      const { exportTour, saveFile } = await import('./excel.js');
      const file = await exportTour(store, t);
      if (await saveFile(file) === 'retry') {
        openSheet({ title: '엑셀 파일 준비됨', body: `<p>${esc(file.name)}</p><p class="muted">아래 버튼을 누르면 저장 창이 열립니다.</p>`, submit: '저장하기', onSubmit: () => { saveFile(file); } });
      }
    } catch (err) { toast(err.message || '엑셀 파일을 만들지 못했습니다.', 'bad'); }
  },
  'del-tour': async (d) => {
    const t = store.get('tours', d.id);
    if (t && await confirmSheet(`BDY ${esc(t.bdy)} 투어와 모든 주문·수금·지출 기록을 삭제할까요? 되돌릴 수 없습니다.`)) {
      await store.delTour(t.id);
      location.hash = '#/';
    }
  },
  'prd-region': (d) => { ui.productRegion = d.r; saveUI(); render(); },
  'add-prd': () => isAdmin() && sheetProduct(),
  'edit-prd': (d) => isAdmin() && sheetProduct(store.get('products', d.id)),
  'set-name': () => askName(),
  'reset-local': async (d) => {
    const sample = d.sample === '1';
    if (await confirmSheet(sample ? '이 기기의 체험 데이터를 지우고 예시 데이터로 되돌릴까요?' : '이 기기의 체험 데이터를 모두 지울까요?', sample ? '되돌리기' : '모두 지우기')) {
      store.reset(sample);
      toast('완료', 'good');
    }
  },
  'sign-out': () => store.signOut(),
  install: async () => { if (!installEvent) return; installEvent.prompt(); await installEvent.userChoice; installEvent = null; render(); },
};

function bindEvents() {
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled || !store) return;
    e.preventDefault();
    const fn = actions[el.dataset.act];
    if (fn) Promise.resolve(fn({ ...el.dataset }, el)).catch((err) => toast(err.message, 'bad'));
  });
  document.addEventListener('change', async (e) => {
    const el = e.target;
    const t = currentTour();
    if (!t || !store) return;
    if (el.dataset.extraCur !== undefined) { ui.extraCur = el.value; render(); return; }
    if (t.status === 'closed') return;
    if (el.dataset.recv) {
      await store.patch('tours', t.id, { cash_received: { ...(t.cash_received || {}), [el.dataset.recv]: round2(num(el.value)) } });
    } else if (el.dataset.cnt) {
      const cur = el.dataset.cnt;
      const counts = { ...(t.cash_on_hand?.[cur] || {}), [el.dataset.den]: num(el.value) };
      await store.patch('tours', t.id, { cash_on_hand: { ...(t.cash_on_hand || {}), [cur]: counts } });
    } else if (el.dataset.notes !== undefined) {
      await store.patch('tours', t.id, { notes: el.value });
    }
  });
}

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

boot();
