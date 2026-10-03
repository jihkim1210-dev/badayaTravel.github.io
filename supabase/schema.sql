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

-- 이전 버전 스키마를 이미 실행했어도 다시 실행하면 새 칸이 추가됩니다
alter table public.products add column if not exists rates jsonb;
alter table public.tours add column if not exists prices jsonb not null default '{}';

create index if not exists passengers_tour on public.passengers (tour_id);
create index if not exists orders_tour on public.orders (tour_id);
create index if not exists payments_tour on public.payments (tour_id);
create index if not exists expenses_tour on public.expenses (tour_id);

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

-- 권한: 로그인한 직원은 투어·주문·수금·지출을 읽고 쓸 수 있음.
--       상품 수정, 투어 삭제, 다른 사람 권한 변경은 관리자만.
alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.tours enable row level security;
alter table public.passengers enable row level security;
alter table public.orders enable row level security;
alter table public.payments enable row level security;
alter table public.expenses enable row level security;

drop policy if exists "read profiles" on public.profiles;
create policy "read profiles" on public.profiles for select to authenticated using (true);
drop policy if exists "admin edits profiles" on public.profiles;
create policy "admin edits profiles" on public.profiles for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "read products" on public.products;
create policy "read products" on public.products for select to authenticated using (true);
drop policy if exists "admin edits products" on public.products;
create policy "admin edits products" on public.products for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "staff tours" on public.tours;
create policy "staff tours" on public.tours for select to authenticated using (true);
drop policy if exists "staff insert tours" on public.tours;
create policy "staff insert tours" on public.tours for insert to authenticated with check (true);
drop policy if exists "staff update tours" on public.tours;
create policy "staff update tours" on public.tours for update to authenticated using (status <> 'closed' or public.is_admin()) with check (true);
drop policy if exists "admin delete tours" on public.tours;
create policy "admin delete tours" on public.tours for delete to authenticated using (public.is_admin());

do $$
declare t text;
begin
  foreach t in array array['passengers', 'orders', 'payments', 'expenses'] loop
    execute format('drop policy if exists "staff all" on public.%I', t);
    execute format('create policy "staff all" on public.%I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- 앱(로그인한 직원)이 테이블을 쓸 수 있게 허용. 프로젝트 생성 때 'Automatically expose new tables'를 꺼도 동작하도록 명시.
-- 실제로 무엇을 볼 수 있는지는 위의 권한(RLS) 규칙이 정합니다. 로그인하지 않은 사용자(anon)에게는 아무것도 열지 않습니다.
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.profiles, public.products, public.tours, public.passengers, public.orders, public.payments, public.expenses to authenticated;
grant execute on function public.is_admin() to authenticated;

-- 실시간 전송 켜기
do $$
declare t text;
begin
  foreach t in array array['profiles', 'products', 'tours', 'passengers', 'orders', 'payments', 'expenses'] loop
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
