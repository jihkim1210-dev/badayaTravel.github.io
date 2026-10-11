// Badaya Field: '주문하기'를 누르면 주문서 엑셀을 주문 담당자에게 이메일로 보냅니다.
// Supabase → Edge Functions 에 이름 send-order 로 배포하고, Secrets 에 RESEND_API_KEY 를 넣으세요.
// (선택) MAIL_FROM: 보내는 주소. 비우면 Resend 기본 주소(onboarding@resend.dev)를 씁니다.
// (선택) APP_URL: 앱 주소. 이메일의 '주문 확인' 버튼이 이 주소의 confirm.html 로 연결됩니다.
// 이메일의 '주문 확인' 버튼 → confirm.html → 이 함수({ confirm, t })가 주문서를 '확인'으로 바꿉니다.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

// 확인 링크 서명: 주문서 id 를 서버만 아는 키로 서명해서, 링크를 아는 사람만 확인 처리할 수 있게 합니다.
async function sign(id: string, key: string) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode('confirm:' + id)));
  return Array.from(sig.slice(0, 16), (b) => b.toString(16).padStart(2, '0')).join('');
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const resendKey = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('MAIL_FROM') || 'Badaya Field <onboarding@resend.dev>';
  const appUrl = (Deno.env.get('APP_URL') || 'https://jihkim1210-dev.github.io/badayaTravel.github.io/').replace(/\/?$/, '/');
  const admin = createClient(url, service);

  let body: { tour_id?: string; request_id?: string; version?: number; filename?: string; file?: string; note?: string; lines?: [string, number, string?][]; total?: string; confirm?: string; t?: string };
  try { body = await req.json(); } catch { return json({ error: '잘못된 요청입니다.' }, 400); }

  // 1) 이메일의 '주문 확인' 버튼 (로그인 없이, 서명으로 확인)
  if (body.confirm) {
    const id = String(body.confirm);
    if (!body.t || body.t !== await sign(id, service)) return json({ error: '확인 링크가 올바르지 않습니다.' }, 403);
    const { data: r } = await admin.from('order_requests').select('id,version,status,received_at,tour_id').eq('id', id).maybeSingle();
    if (!r) return json({ error: '주문서를 찾지 못했습니다. 삭제됐을 수 있습니다.' }, 404);
    const { data: tour } = await admin.from('tours').select('bdy,region').eq('id', r.tour_id).maybeSingle();
    let at = r.received_at;
    if (r.status !== 'received') {
      const { data: to } = await admin.rpc('order_manager_emails');
      at = new Date().toISOString();
      const { error } = await admin.from('order_requests')
        .update({ status: 'received', received_by: ((to as string[] | null) || []).join(', ') || '이메일', received_at: at, updated_at: at }).eq('id', id);
      if (error) return json({ error: '확인 처리하지 못했습니다: ' + error.message }, 500);
    }
    return json({ ok: true, already: r.status === 'received', bdy: tour?.bdy, region: tour?.region, version: r.version, received_at: at });
  }

  // 2) 앱의 '주문하기': 주문서를 주문 담당자에게 이메일로 보냄
  if (!resendKey) return json({ error: '이메일 설정(RESEND_API_KEY)이 아직 없습니다.' }, 500);

  // 보낸 사람이 이 투어의 담당자(또는 관리자)인지, 로그인한 본인 권한으로 확인
  const auth = req.headers.get('Authorization') || '';
  const userDb = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const { data: { user } } = await userDb.auth.getUser(auth.replace(/^Bearer\s+/i, ''));
  if (!user) return json({ error: '로그인이 필요합니다.' }, 401);

  const { tour_id, version, filename, file } = body;
  if (!tour_id || !filename || !file || !/\.xlsx$/i.test(filename)) return json({ error: '주문서 파일이 없습니다.' }, 400);
  if (file.length > 7_000_000) return json({ error: '주문서 파일이 너무 큽니다.' }, 400);

  const { data: tour } = await userDb.from('tours').select('id,bdy,region,tour_code,start_date').eq('id', tour_id).maybeSingle();
  if (!tour) return json({ error: '이 투어에 주문할 권한이 없습니다.' }, 403);
  const { data: prof } = await userDb.from('profiles').select('name').eq('id', user.id).maybeSingle();

  const { data: emails, error } = await admin.rpc('order_manager_emails');
  if (error) return json({ error: '주문 담당자를 찾지 못했습니다: ' + error.message }, 500);
  const to = (emails as string[] | null) || [];
  if (!to.length) return json({ error: '주문 담당자가 지정되지 않았습니다.' }, 400);

  const who = prof?.name || user.email;
  const v = Number(version) || 1;
  const lines = (body.lines || []).slice(0, 200).map(([n, q, amt]) => `- ${String(n).slice(0, 100)}: ${Number(q) || 0}${amt ? ` (${String(amt).slice(0, 40)})` : ''}`);
  if (body.total) lines.push(`합계 금액: ${String(body.total).slice(0, 100)}`);
  const text = [
    [`BDY ${tour.bdy}`, tour.region, tour.tour_code, tour.start_date].filter(Boolean).join(' · '),
    `${v}차 주문 · 보낸 사람 ${who} (${user.email})`,
    '',
    ...lines,
    ...(body.note ? ['', '남긴 말: ' + String(body.note).slice(0, 1000)] : []),
  ].join('\n');
  const confirmUrl = body.request_id ? `${appUrl}confirm.html?id=${encodeURIComponent(body.request_id)}&t=${await sign(body.request_id, service)}` : '';
  const html = `<div style="font-family:sans-serif;font-size:15px;line-height:1.6">${esc(text).replace(/\n/g, '<br>')}`
    + (confirmUrl ? `<p style="margin-top:20px"><a href="${esc(confirmUrl)}" style="background:#0f5f5c;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;display:inline-block">주문 확인</a></p><p style="color:#777;font-size:13px">주문서를 확인했으면 위 버튼을 눌러 주세요. 직원 앱에 '관리자 확인'으로 표시됩니다.</p>` : '')
    + '</div>';

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to,
      reply_to: user.email,
      subject: `[주문서] BDY ${tour.bdy} ${tour.region} ${v}차 - ${who}`,
      text: confirmUrl ? `${text}\n\n주문 확인: ${confirmUrl}` : text,
      html,
      attachments: [{ filename, content: file }],
    }),
  });
  if (!res.ok) return json({ error: '이메일을 보내지 못했습니다: ' + (await res.text()).slice(0, 300) }, 502);
  return json({ ok: true, to: to.length });
});
