-- update_2610111416
-- Badaya Field: Supabase SQL Editor 에 통째로 붙여넣고 Run 하세요.
-- 테이블, 권한(로그인한 직원만 접근), 실시간 전송, 기본 상품표를 만듭니다.

create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  name text,
  role text not null default 'staff' check (role in ('staff', 'admin')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.products (
  id text primary key,
  region text not null,
  name text not null,
  price numeric not null default 0,
  currency text not null default 'USD',
  units int not null default 1,
  rates jsonb,                        -- 투어별로 고르는 요금 선택지 (예: [90, 100])
  sort int default 0,
  active boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.tours (
  id text primary key,
  bdy text not null unique,
  region text not null,
  tour_code text,
  start_date date,
  guide text,
  status text not null default 'open' check (status in ('open', 'submitted', 'closed')),
  prices jsonb not null default '{}',  -- 이 투어에 적용한 요금 (상품 id → 가격)
  cash_received jsonb not null default '{}',
  cash_on_hand jsonb not null default '{}',
  notes text,
  finance_check jsonb,
  md_check jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.passengers (
  id text primary key,
  tour_id text not null references public.tours on delete cascade,
  group_no int default 0,
  name_kor text,
  name_eng text,
  gender text,
  note text,
  sort bigint default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.orders (
  id text primary key,                -- '<passenger_id>:<product_id>'
  tour_id text not null references public.tours on delete cascade,
  passenger_id text not null references public.passengers on delete cascade,
  product_id text not null references public.products,
  mode text not null check (mode in ('cash', 'prepaid', 'homeshop', 'comp')),
  price numeric not null,             -- 주문 당시 가격 (상품 가격이 바뀌어도 유지)
  currency text not null,
  updated_by text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.payments (
  id text primary key,
  tour_id text not null references public.tours on delete cascade,
  passenger_id text references public.passengers on delete set null,
  currency text not null,
  amount numeric not null,
  method text not null default 'cash',
  note text,
  created_by text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.expenses (
  id text primary key,
  tour_id text not null references public.tours on delete cascade,
  kind text not null default 'expense' check (kind in ('expense', 'transfer')),
  place text,
  category text,
  currency text not null,
  amount numeric not null,
  note text,
  created_by text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 관리자에게 보낸 옵션 주문서. 보낼 때마다 한 줄씩 쌓입니다 (1차, 2차 …).
create table if not exists public.order_requests (
  id text primary key,
  tour_id text not null references public.tours on delete cascade,
  version int not null default 1,
  items jsonb not null default '[]',  -- 상품별 수량·구분·고객 명단 (보낸 순간의 내용)
  pax int not null default 0,
  note text,
  created_by text,
  created_by_id uuid default auth.uid(),
  status text not null default 'sent' check (status in ('sent', 'received')),
  received_by text,
  received_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 이전 버전 스키마를 이미 실행했어도 다시 실행하면 새 칸이 추가됩니다
alter table public.products add column if not exists rates jsonb;
alter table public.tours add column if not exists prices jsonb not null default '{}';
-- 투어 담당자: 만든 직원. 담당자와 관리자만 그 투어를 볼 수 있습니다.
alter table public.tours add column if not exists owner_id uuid references auth.users on delete set null default auth.uid();
-- 주문 담당자: 직원이 '주문하기'를 누르면 이 사람에게 주문서가 이메일로 갑니다 (아래 맨 끝에서 지정).
alter table public.profiles add column if not exists order_manager boolean not null default false;
-- 주문서를 이메일로 보낸 시각
alter table public.order_requests add column if not exists emailed_at timestamptz;
-- 주문 당시 투어 정보 (BDY·지역·기간·출발일·가이드). 주문 담당자는 투어를 볼 수 없어서 주문서에 같이 저장합니다.
alter table public.order_requests add column if not exists tour_info jsonb;

create index if not exists passengers_tour on public.passengers (tour_id);
create index if not exists orders_tour on public.orders (tour_id);
create index if not exists payments_tour on public.payments (tour_id);
create index if not exists expenses_tour on public.expenses (tour_id);
create index if not exists order_requests_tour on public.order_requests (tour_id);
create index if not exists tours_owner on public.tours (owner_id);

-- 새 직원 계정이 만들어지면 프로필 자동 생성 (기본 권한: staff)
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name) values (new.id, split_part(new.email, '@', 1))
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- 이 투어를 볼 수 있는 사람: 투어 담당자 또는 관리자
create or replace function public.can_access_tour(tid text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.tours where id = tid and (owner_id = auth.uid() or public.is_admin()));
$$;

-- 주문 담당자인지 (받은 주문서만 보고 확인할 수 있음. 투어의 다른 정보는 볼 수 없음)
create or replace function public.is_order_manager() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and order_manager);
$$;

-- BDY 번호가 이미 있는지 (다른 직원 투어 포함). 번호만 알려주고 내용은 보여주지 않습니다.
create or replace function public.bdy_taken(b text, except_id text default null) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.tours where bdy = b and id is distinct from except_id);
$$;

-- 권한: 직원은 자기가 담당한 투어(와 그 고객·주문·수금·지출·주문서)만 보고 고칠 수 있음.
--       관리자는 모든 투어를 봅니다. 상품 수정, 투어 삭제, 다른 사람 권한 변경은 관리자만.
alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.tours enable row level security;
alter table public.passengers enable row level security;
alter table public.orders enable row level security;
alter table public.payments enable row level security;
alter table public.expenses enable row level security;
alter table public.order_requests enable row level security;

drop policy if exists "read profiles" on public.profiles;
create policy "read profiles" on public.profiles for select to authenticated using (true);
drop policy if exists "admin edits profiles" on public.profiles;
create policy "admin edits profiles" on public.profiles for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "read products" on public.products;
create policy "read products" on public.products for select to authenticated using (true);
drop policy if exists "admin edits products" on public.products;
create policy "admin edits products" on public.products for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "staff tours" on public.tours;
create policy "staff tours" on public.tours for select to authenticated using (owner_id = auth.uid() or public.is_admin());
drop policy if exists "staff insert tours" on public.tours;
create policy "staff insert tours" on public.tours for insert to authenticated with check (owner_id = auth.uid() or public.is_admin());
drop policy if exists "staff update tours" on public.tours;
create policy "staff update tours" on public.tours for update to authenticated
  using ((owner_id = auth.uid() and status <> 'closed') or public.is_admin())
  with check (owner_id = auth.uid() or public.is_admin());
-- 삭제: 관리자, 또는 아직 주문하기 전인 내 투어 (정산 완료 전)
drop policy if exists "admin delete tours" on public.tours;
drop policy if exists "delete tours" on public.tours;
create policy "delete tours" on public.tours for delete to authenticated using (
  public.is_admin()
  or (owner_id = auth.uid() and status <> 'closed'
      and not exists (select 1 from public.order_requests r where r.tour_id = tours.id)));

do $$
declare t text;
begin
  foreach t in array array['passengers', 'orders', 'payments', 'expenses'] loop
    execute format('drop policy if exists "staff all" on public.%I', t);
    execute format('drop policy if exists "own tours" on public.%I', t);
    execute format('create policy "own tours" on public.%I for all to authenticated using (public.can_access_tour(tour_id)) with check (public.can_access_tour(tour_id))', t);
  end loop;
end $$;

drop policy if exists "read order requests" on public.order_requests;
create policy "read order requests" on public.order_requests for select to authenticated using (public.can_access_tour(tour_id) or public.is_order_manager());
drop policy if exists "send order requests" on public.order_requests;
create policy "send order requests" on public.order_requests for insert to authenticated with check (public.can_access_tour(tour_id));
drop policy if exists "admin edits order requests" on public.order_requests;
-- 확인 처리는 관리자와 주문 담당자. 직원은 확인 전의 자기 주문서만 (이메일 보낸 시각 기록에 필요)
create policy "admin edits order requests" on public.order_requests for update to authenticated
  using (public.is_admin() or public.is_order_manager() or (status = 'sent' and public.can_access_tour(tour_id)))
  with check (public.is_admin() or public.is_order_manager() or (status = 'sent' and public.can_access_tour(tour_id)));
drop policy if exists "admin deletes order requests" on public.order_requests;
create policy "admin deletes order requests" on public.order_requests for delete to authenticated using (public.is_admin());

-- 앱(로그인한 직원)이 테이블을 쓸 수 있게 허용. 프로젝트 생성 때 'Automatically expose new tables'를 꺼도 동작하도록 명시.
-- 실제로 무엇을 볼 수 있는지는 위의 권한(RLS) 규칙이 정합니다. 로그인하지 않은 사용자(anon)에게는 아무것도 열지 않습니다.
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.profiles, public.products, public.tours, public.passengers, public.orders, public.payments, public.expenses, public.order_requests to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.can_access_tour(text) to authenticated;
grant execute on function public.bdy_taken(text, text) to authenticated;
grant execute on function public.is_order_manager() to authenticated;

-- 주문 담당자 이메일 목록. 이메일 보내는 서버 함수(send-order)만 읽을 수 있고 앱에서는 볼 수 없습니다.
create or replace function public.order_manager_emails() returns setof text
language sql stable security definer set search_path = public as $$
  select u.email::text from auth.users u join public.profiles p on p.id = u.id where p.order_manager and u.email is not null;
$$;
revoke execute on function public.order_manager_emails() from public, anon, authenticated;
grant execute on function public.order_manager_emails() to service_role;

-- 실시간 전송 켜기
do $$
declare t text;
begin
  foreach t in array array['profiles', 'products', 'tours', 'passengers', 'orders', 'payments', 'expenses', 'order_requests'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

-- 기본 상품표
insert into public.products (id, region, name, price, currency, units, sort) values
  ('prd-egypt-01', 'EGYPT', 'Tour Expense', 90, 'EUR', 1, 10),
  ('prd-egypt-02', 'EGYPT', 'Cruise Tips', 15, 'USD', 1, 20),
  ('prd-egypt-03', 'EGYPT', '피라미드 내부 탐험 + 문명박물관', 150, 'EUR', 2, 30),
  ('prd-egypt-04', 'EGYPT', '피라미드 내부 탐험', 80, 'EUR', 1, 40),
  ('prd-egypt-05', 'EGYPT', '문명박물관', 80, 'EUR', 1, 50),
  ('prd-egypt-06', 'EGYPT', '마차투어 + 룩소르 신전', 70, 'EUR', 1, 60),
  ('prd-egypt-07', 'EGYPT', '세티 1세의 무덤', 185, 'EUR', 1, 70),
  ('prd-egypt-08', 'EGYPT', '필레신전 + 아스완댐 보트', 70, 'EUR', 1, 80),
  ('prd-egypt-09', 'EGYPT', '덴데라 + 사막 사파리', 150, 'EUR', 2, 90),
  ('prd-egypt-10', 'EGYPT', '덴데라 신전', 80, 'EUR', 1, 100),
  ('prd-egypt-11', 'EGYPT', '사막 사파리', 80, 'EUR', 1, 110),
  ('prd-egypt-12', 'EGYPT', '투탕카멘의 무덤 내부 관람', 70, 'EUR', 1, 120),
  ('prd-egypt-13', 'EGYPT', '부르즈 칼리파 전망대', 90, 'EUR', 1, 130),
  ('prd-dubai-14', 'DUBAI', 'Yacht Tour', 60, 'AED', 1, 140),
  ('prd-dubai-15', 'DUBAI', 'Green Planet', 90, 'AED', 1, 150),
  ('prd-dubai-16', 'DUBAI', 'The View at The Palm', 80, 'AED', 1, 160),
  ('prd-dubai-17', 'DUBAI', 'BBQ Lunch', 60, 'AED', 1, 170),
  ('prd-dubai-18', 'DUBAI', 'Dhow Cruise', 130, 'AED', 1, 180),
  ('prd-dubai-19', 'DUBAI', 'La Perle', 150, 'AED', 1, 190),
  ('prd-dubai-20', 'DUBAI', 'Museum of the Future', 80, 'AED', 1, 200),
  ('prd-dubai-21', 'DUBAI', 'Burj Khalifa', 100, 'AED', 1, 210),
  ('prd-dubai-22', 'DUBAI', 'Seafood Lunch', 30, 'AED', 1, 220),
  ('prd-dubai-23', 'DUBAI', 'Desert Safari', 120, 'AED', 1, 230),
  ('prd-dubai-24', 'DUBAI', 'Dubai Frame', 50, 'AED', 1, 240),
  ('prd-dubai-25', 'DUBAI', 'Walk Bridge', 20, 'AED', 1, 250),
  ('prd-dubai-26', 'DUBAI', 'Kandura & Abaya', 10, 'AED', 1, 260),
  ('prd-dubai-27', 'DUBAI', 'Louvre Abu Dhabi', 80, 'AED', 1, 270),
  ('prd-dubai-28', 'DUBAI', 'Sheikh Zayed Mosque', 70, 'AED', 1, 280),
  ('prd-dubai-29', 'DUBAI', 'Qasr Al Watan', 50, 'AED', 1, 290),
  ('prd-dubai-30', 'DUBAI', 'Tourism Dirham (3N)', 12, 'AED', 1, 300),
  ('prd-dubai-31', 'DUBAI', 'Tourism Dirham (4N)', 16, 'AED', 1, 310),
  ('prd-dubai-32', 'DUBAI', 'Tourism Dirham (5N)', 20, 'AED', 1, 320)
on conflict (id) do nothing;

-- 두바이 팁 (USD). 1인당 금액을 정하면 앱 상품 화면에서 가격을 넣고 '주문서에 표시'를 켜세요.
insert into public.products (id, region, name, price, currency, units, sort, active)
values ('prd-dubai-33', 'DUBAI', 'Tips', 0, 'USD', 1, 330, false)
on conflict (id) do nothing;

-- 2026-10-03 이전 버전으로 만든 두바이 상품을 AED로 바꾸기 (팁 제외)
update public.products set currency = 'AED' where region = 'DUBAI' and currency = 'USD' and id <> 'prd-dubai-33';

update public.products set rates = '[90, 100]' where id = 'prd-egypt-01' and rates is null;

-- 첫 관리자 지정: 대표님 계정을 만든 뒤 이메일을 바꿔서 실행하세요.
-- update public.profiles set role = 'admin', name = '대표님' where id = (select id from auth.users where email = 'owner@example.com');

-- 예전 주문서에 투어 정보 채우기 (주문 담당자 화면용)
update public.order_requests r
   set tour_info = jsonb_build_object('bdy', t.bdy, 'region', t.region, 'tour_code', t.tour_code, 'start_date', t.start_date, 'guide', t.guide)
  from public.tours t
 where t.id = r.tour_id and r.tour_info is null;

-- 주문 담당자 지정: 이 계정에게 주문서 이메일이 갑니다.
update public.profiles set order_manager = true where id = (select id from auth.users where email = 'field@badayatravel.com');
