// 데이터 계층. 화면 코드는 Store 의 all/get/put/patch/del 만 사용합니다.
//  - LocalStore: 체험 모드. 이 브라우저에만 저장, 같은 기기의 다른 탭과는 실시간 동기화.
//  - SupabaseStore: 실제 운영. 모든 직원 기기가 실시간으로 같은 데이터를 봅니다.
//    인터넷이 끊기면 변경을 기기에 보관했다가 연결되면 자동 전송합니다.
import { DEFAULT_PRODUCTS, sampleData } from './seed.js';

export const TABLES = ['products', 'tours', 'passengers', 'orders', 'payments', 'expenses', 'profiles'];

export const uid = () =>
  (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10));

const ls = {
  get(k, fallback = null) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; } catch { return fallback; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 저장소 사용 불가 */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* noop */ } },
};
export { ls };

class BaseStore {
  constructor() {
    this.data = Object.fromEntries(TABLES.map((t) => [t, new Map()]));
    this.listeners = new Set();
    this.status = { mode: 'local', online: navigator.onLine, realtime: false, pending: 0 };
    this.user = null; // { id, name, role }
  }
  all(t) { return [...this.data[t].values()]; }
  get(t, id) { return this.data[t].get(id); }
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(info = {}) { for (const fn of this.listeners) fn(info); }
  _set(t, row) { this.data[t].set(row.id, row); }
  _unset(t, id) { this.data[t].delete(id); }
  patch(t, id, changes) {
    const cur = this.get(t, id);
    if (!cur) return;
    return this.put(t, { ...cur, ...changes });
  }
  // 하위 데이터까지 같이 지우기
  async delTour(id) {
    for (const t of ['orders', 'payments', 'expenses', 'passengers']) {
      for (const r of this.all(t).filter((r) => r.tour_id === id)) await this.del(t, r.id);
    }
    await this.del('tours', id);
  }
  async delPassenger(id) {
    for (const o of this.all('orders').filter((o) => o.passenger_id === id)) await this.del('orders', o.id);
    await this.del('passengers', id);
  }
}

export class LocalStore extends BaseStore {
  constructor() {
    super();
    this.key = 'badaya.local.v1';
    try { this.bc = new BroadcastChannel('badaya-local'); } catch { this.bc = null; }
  }
  async init() {
    const saved = ls.get(this.key);
    if (saved) {
      for (const t of TABLES) for (const r of saved[t] || []) this._set(t, r);
      // 예전 체험 데이터에 새 기본값(투어별 요금 선택지) 채우기
      for (const p of DEFAULT_PRODUCTS) {
        const cur = this.get('products', p.id);
        if (!cur) this._set('products', { ...p });
        else {
          if (cur.rates === undefined) this._set('products', { ...this.get('products', p.id), rates: p.rates });
          if (cur.region === 'DUBAI' && cur.currency === 'USD' && p.currency === 'AED') this._set('products', { ...this.get('products', p.id), currency: 'AED' });
        }
      }
    } else {
      this.reset();
    }
    const name = ls.get('badaya.local.user') || '';
    this.user = { id: 'local', name, role: 'admin' };
    this.bc?.addEventListener('message', (e) => this._remote(e.data));
    window.addEventListener('storage', (e) => { if (e.key === this.key) this._reloadFromDisk(); });
    this.status = { mode: 'local', online: true, realtime: true, pending: 0 };
    return this;
  }
  reset(withSample = true) {
    for (const t of TABLES) this.data[t].clear();
    for (const p of DEFAULT_PRODUCTS) this._set('products', { ...p });
    if (withSample) {
      const s = sampleData();
      for (const t of Object.keys(s)) for (const r of s[t]) this._set(t, r);
    }
    this._persist();
    this.bc?.postMessage({ type: 'reload' });
    this.emit({ reload: true });
  }
  setUserName(name) {
    this.user.name = name;
    ls.set('badaya.local.user', name);
    this.emit({});
  }
  _persist() {
    ls.set(this.key, Object.fromEntries(TABLES.map((t) => [t, this.all(t)])));
  }
  _reloadFromDisk() {
    const saved = ls.get(this.key);
    if (!saved) return;
    for (const t of TABLES) { this.data[t].clear(); for (const r of saved[t] || []) this._set(t, r); }
    this.emit({ remote: true });
  }
  _remote(msg) {
    if (msg.type === 'reload') return this._reloadFromDisk();
    if (msg.type === 'put') this._set(msg.table, msg.row);
    if (msg.type === 'del') this._unset(msg.table, msg.id);
    this.emit({ remote: true, table: msg.table });
  }
  async put(t, row) {
    row = { ...row, updated_at: new Date().toISOString() };
    if (!row.created_at) row.created_at = row.updated_at;
    this._set(t, row);
    this._persist();
    this.bc?.postMessage({ type: 'put', table: t, row });
    this.emit({ table: t });
    return row;
  }
  async del(t, id) {
    this._unset(t, id);
    this._persist();
    this.bc?.postMessage({ type: 'del', table: t, id });
    this.emit({ table: t });
  }
}

export class SupabaseStore extends BaseStore {
  constructor(url, key) {
    super();
    // eslint-disable-next-line no-undef
    this.sb = window.supabase.createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } });
    this.cacheKey = 'badaya.cache.v1';
    this.outboxKey = 'badaya.outbox.v1';
    this.outbox = ls.get(this.outboxKey, []);
    this.status = { mode: 'cloud', online: navigator.onLine, realtime: false, pending: this.outbox.length };
    this.flushing = false;
  }
  async session() {
    const { data } = await this.sb.auth.getSession();
    return data.session;
  }
  async signIn(email, password) {
    const { error } = await this.sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }
  async changePassword(current, next) {
    const { data } = await this.sb.auth.getUser();
    const email = data.user?.email;
    // 현재 비밀번호가 맞는지 먼저 확인
    const check = await this.sb.auth.signInWithPassword({ email, password: current });
    if (check.error) throw new Error('현재 비밀번호가 맞지 않습니다.');
    const { error } = await this.sb.auth.updateUser({ password: next });
    if (error) throw new Error(error.message.includes('different') ? '지금과 다른 비밀번호를 입력하세요.' : '비밀번호를 바꾸지 못했습니다. 잠시 후 다시 시도하세요.');
  }
  async signOut() {
    await this.sb.auth.signOut();
    ls.del(this.cacheKey);
    location.reload();
  }
  async init() {
    const session = await this.session();
    if (!session) return null;
    // 오프라인으로 앱을 열어도 마지막 데이터를 보여줌
    const cache = ls.get(this.cacheKey);
    if (cache) for (const t of TABLES) for (const r of cache[t] || []) this._set(t, r);
    this._replayOutboxLocally();
    const u = session.user;
    this.user = { id: u.id, name: u.email, role: 'staff', email: u.email };
    window.addEventListener('online', () => { this.status.online = true; this.emit({}); this.flush().then(() => this.reload()); });
    window.addEventListener('offline', () => { this.status.online = false; this.status.realtime = false; this.emit({}); });
    await this.reload().catch(() => {});
    this._subscribe();
    this.flush();
    return this;
  }
  _applyProfile() {
    const p = this.get('profiles', this.user.id);
    if (p) { this.user.name = p.name || this.user.email; this.user.role = p.role || 'staff'; }
  }
  async _fetchAll(t) {
    const rows = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await this.sb.from(t).select('*').range(from, from + 999);
      if (error) throw error;
      rows.push(...data);
      if (data.length < 1000) break;
    }
    return rows;
  }
  async reload() {
    const results = await Promise.all(TABLES.map((t) => this._fetchAll(t)));
    TABLES.forEach((t, i) => { this.data[t].clear(); for (const r of results[i]) this._set(t, r); });
    this._replayOutboxLocally();
    this._applyProfile();
    this._cache();
    this.emit({ reload: true });
  }
  _subscribe() {
    let dropped = false;
    this.channel = this.sb.channel('badaya-db');
    for (const t of TABLES) {
      this.channel.on('postgres_changes', { event: '*', schema: 'public', table: t }, (payload) => {
        if (payload.eventType === 'DELETE') this._unset(t, payload.old.id);
        else this._set(t, payload.new);
        if (t === 'profiles') this._applyProfile();
        this._cacheSoon();
        this.emit({ remote: true, table: t });
      });
    }
    this.channel.subscribe((s) => {
      if (s === 'SUBSCRIBED') {
        this.status.realtime = true;
        if (dropped) { dropped = false; this.reload().catch(() => {}); }
      } else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' || s === 'CLOSED') {
        this.status.realtime = false;
        dropped = true;
      }
      this.emit({});
    });
  }
  _cache() { ls.set(this.cacheKey, Object.fromEntries(TABLES.map((t) => [t, this.all(t)]))); }
  _cacheSoon() { clearTimeout(this._ct); this._ct = setTimeout(() => this._cache(), 800); }
  _replayOutboxLocally() {
    for (const op of this.outbox) {
      if (op.op === 'put') this._set(op.table, op.row);
      else this._unset(op.table, op.id);
    }
  }
  _queue(op) {
    this.outbox.push(op);
    ls.set(this.outboxKey, this.outbox);
    this.status.pending = this.outbox.length;
  }
  async flush() {
    if (this.flushing || !this.outbox.length) return;
    this.flushing = true;
    try {
      while (this.outbox.length) {
        const op = this.outbox[0];
        const res = op.op === 'put'
          ? await this.sb.from(op.table).upsert(op.row)
          : await this.sb.from(op.table).delete().eq('id', op.id);
        if (res.error) {
          if (isNetworkError(res.error)) break; // 연결되면 다시 시도
          this.emit({ error: '저장 실패: ' + res.error.message });
          this._needReload = true;
        }
        this.outbox.shift();
        ls.set(this.outboxKey, this.outbox);
        this.status.pending = this.outbox.length;
      }
    } catch { /* 네트워크 오류: 다음 기회에 */ }
    this.flushing = false;
    if (this._needReload) { this._needReload = false; this.reload().catch(() => {}); }
    this.emit({});
  }
  async put(t, row) {
    row = { ...row, updated_at: new Date().toISOString() };
    if (!row.created_at) row.created_at = row.updated_at;
    this._set(t, row);
    this._queue({ op: 'put', table: t, row });
    this._cacheSoon();
    this.emit({ table: t });
    this.flush();
    return row;
  }
  async del(t, id) {
    this._unset(t, id);
    this._queue({ op: 'del', table: t, id });
    this._cacheSoon();
    this.emit({ table: t });
    this.flush();
  }
}

function isNetworkError(err) {
  return !navigator.onLine || /Failed to fetch|NetworkError|network|timeout/i.test(err?.message || '');
}
