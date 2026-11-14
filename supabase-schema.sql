-- PHOTO SPOT KOREA: Supabase SQL Editor에서 전체 실행하세요.
-- 1) 장소 테이블
create table if not exists public.spots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  category text not null check (category in ('nature','viewpoint','sea','city')),
  description text not null default '' check (char_length(description) <= 500),
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  photo_url text,
  photo_path text,
  created_at timestamptz not null default now()
);

create index if not exists spots_created_at_idx on public.spots (created_at desc);
create index if not exists spots_location_idx on public.spots (lat, lng);

-- 2) RLS: 누구나 장소를 읽을 수 있고, 로그인한 사용자는 본인 명의 장소만 등록/수정/삭제
alter table public.spots enable row level security;

drop policy if exists "Public can read spots" on public.spots;
create policy "Public can read spots"
on public.spots for select
to anon, authenticated
using (true);

drop policy if exists "Users can insert their own spots" on public.spots;
create policy "Users can insert their own spots"
on public.spots for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update their own spots" on public.spots;
create policy "Users can update their own spots"
on public.spots for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own spots" on public.spots;
create policy "Users can delete their own spots"
on public.spots for delete
to authenticated
using (auth.uid() = user_id);

-- 3) 사진 저장소: 공개 읽기, 로그인한 사용자는 본인 폴더에만 업로드/삭제 가능
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('spot-photos', 'spot-photos', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true, file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg','image/png','image/webp'];

drop policy if exists "Anyone can view spot photos" on storage.objects;
create policy "Anyone can view spot photos"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'spot-photos');

drop policy if exists "Users upload to their own folder" on storage.objects;
create policy "Users upload to their own folder"
on storage.objects for insert
to authenticated
with check (bucket_id = 'spot-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users delete from their own folder" on storage.objects;
create policy "Users delete from their own folder"
on storage.objects for delete
to authenticated
using (bucket_id = 'spot-photos' and (storage.foldername(name))[1] = auth.uid()::text);
