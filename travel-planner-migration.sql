-- PHOTO SPOT KOREA: 여행 노트 / 버킷리스트 / 캘린더 추가
-- 기존 my_places, diary_entries, photo_spots 데이터는 변경하거나 삭제하지 않습니다.

create table if not exists public.travel_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default '',
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.travel_buckets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  place text not null default '',
  target_date date,
  memo text not null default '',
  is_done boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.travel_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  event_date date not null,
  place text not null default '',
  memo text not null default '',
  created_at timestamptz not null default now()
);

alter table public.travel_notes enable row level security;
alter table public.travel_buckets enable row level security;
alter table public.travel_events enable row level security;

drop policy if exists "Users manage own travel notes" on public.travel_notes;
create policy "Users manage own travel notes" on public.travel_notes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users manage own travel buckets" on public.travel_buckets;
create policy "Users manage own travel buckets" on public.travel_buckets
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users manage own travel events" on public.travel_events;
create policy "Users manage own travel events" on public.travel_events
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists travel_notes_user_created_idx on public.travel_notes(user_id, created_at desc);
create index if not exists travel_buckets_user_created_idx on public.travel_buckets(user_id, created_at desc);
create index if not exists travel_events_user_date_idx on public.travel_events(user_id, event_date);
