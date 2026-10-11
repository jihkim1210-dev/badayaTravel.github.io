// Badaya Field: '주문하기'를 누르면 주문서 엑셀을 주문 담당자에게 이메일로 보냅니다.
// Supabase → Edge Functions 에 이름 send-order 로 배포하고, Secrets 에 RESEND_API_KEY 를 넣으세요.
// (선택) MAIL_FROM: 보내는 주소. 비우면 Resend 기본 주소(onboarding@resend.dev)를 씁니다.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const resendKey = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('MAIL_FROM') || 'Badaya Field <onboarding@resend.dev>';
  if (!resendKey) return json({ error: '이메일 설정(RESEND_API_KEY)이 아직 없습니다.' }, 500);

  // 보낸 사람이 이 투어의 담당자(또는 관리자)인지, 로그인한 본인 권한으로 확인
  const auth = req.headers.get('Authorization') || '';
  const userDb = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const { data: { user } } = await userDb.auth.getUser(auth.replace(/^Bearer\s+/i, ''));
  if (!user) return json({ error: '로그인이 필요합니다.' }, 401);

  let body: { tour_id?: string; version?: number; filename?: string; file?: string; note?: string; lines?: [string, number][] };
  try { body = await req.json(); } catch { return json({ error: '잘못된 요청입니다.' }, 400); }
  const { tour_id, version, filename, file } = body;
  if (!tour_id || !filename || !file || !/\.xlsx$/i.test(filename)) return json({ error: '주문서 파일이 없습니다.' }, 400);
  if (file.length > 7_000_000) return json({ error: '주문서 파일이 너무 큽니다.' }, 400);

  const { data: tour } = await userDb.from('tours').select('id,bdy,region,tour_code,start_date').eq('id', tour_id).maybeSingle();
  if (!tour) return json({ error: '이 투어에 주문할 권한이 없습니다.' }, 403);
  const { data: prof } = await userDb.from('profiles').select('name').eq('id', user.id).maybeSingle();

  const admin = createClient(url, service);
  const { data: emails, error } = await admin.rpc('order_manager_emails');
  if (error) return json({ error: '주문 담당자를 찾지 못했습니다: ' + error.message }, 500);
  const to = (emails as string[] | null) || [];
  if (!to.length) return json({ error: '주문 담당자가 지정되지 않았습니다.' }, 400);

  const who = prof?.name || user.email;
  const v = Number(version) || 1;
  const lines = (body.lines || []).slice(0, 200).map(([n, q]) => `- ${String(n).slice(0, 100)}: ${Number(q) || 0}`);
  const text = [
    [`BDY ${tour.bdy}`, tour.region, tour.tour_code, tour.start_date].filter(Boolean).join(' · '),
    `${v}차 주문 · 보낸 사람 ${who} (${user.email})`,
    '',
    ...lines,
    ...(body.note ? ['', '남긴 말: ' + String(body.note).slice(0, 1000)] : []),
    '',
    '첨부한 엑셀 파일에 고객 명단이 있습니다.',
  ].join('\n');

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to,
      reply_to: user.email,
      subject: `[주문서] BDY ${tour.bdy} ${tour.region} ${v}차 - ${who}`,
      text,
      attachments: [{ filename, content: file }],
    }),
  });
  if (!res.ok) return json({ error: '이메일을 보내지 못했습니다: ' + (await res.text()).slice(0, 300) }, 502);
  return json({ ok: true, to: to.length });
});
