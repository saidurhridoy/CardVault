-- ============================================================================
-- CardVault — Supabase schema
-- ----------------------------------------------------------------------------
-- Run this ONCE in your Supabase project's SQL editor:
--   Dashboard → SQL Editor → New query → paste this file → Run
--
-- What it creates:
--   • public.cards table (one row per scanned business card)
--   • Row Level Security so every user can only see/edit their OWN cards
--   • A private storage bucket "card-images" scoped to per-user folders
--   • Helpful indexes + an updated_at trigger
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- cards ----
create table if not exists public.cards (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  name            text,
  designation     text,
  company         text,
  phone           text,
  email           text,
  website         text,
  address         text,
  notes           text,
  raw_text        text,          -- raw OCR output, handy for re-parsing
  card_image_path text,          -- path inside the "card-images" storage bucket
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Keep updated_at fresh automatically
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists cards_set_updated_at on public.cards;
create trigger cards_set_updated_at
  before update on public.cards
  for each row execute function public.set_updated_at();

-- Speed up listing + searching
create index if not exists cards_user_created_idx on public.cards (user_id, created_at desc);
create index if not exists cards_search_idx on public.cards
  using gin (
    to_tsvector('simple',
      coalesce(name, '') || ' ' || coalesce(company, '') || ' ' || coalesce(designation, '')
    )
  );

-- ------------------------------------------------- row level security -----
alter table public.cards enable row level security;

drop policy if exists "users read own cards"    on public.cards;
drop policy if exists "users insert own cards"  on public.cards;
drop policy if exists "users update own cards"  on public.cards;
drop policy if exists "users delete own cards"  on public.cards;

create policy "users read own cards"
  on public.cards for select to authenticated
  using (auth.uid() = user_id);

create policy "users insert own cards"
  on public.cards for insert to authenticated
  with check (auth.uid() = user_id);

create policy "users update own cards"
  on public.cards for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "users delete own cards"
  on public.cards for delete to authenticated
  using (auth.uid() = user_id);

-- ------------------------------------------------------ image storage -----
-- Private bucket: images are only readable through signed URLs issued to
-- the owner. Folders are named with the user's auth id.
insert into storage.buckets (id, name, public)
values ('card-images', 'card-images', false)
on conflict (id) do nothing;

drop policy if exists "users read own card images"    on storage.objects;
drop policy if exists "users insert own card images"  on storage.objects;
drop policy if exists "users update own card images"  on storage.objects;
drop policy if exists "users delete own card images"  on storage.objects;

create policy "users read own card images"
  on storage.objects for select to authenticated
  using (bucket_id = 'card-images' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "users insert own card images"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'card-images' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "users update own card images"
  on storage.objects for update to authenticated
  using (bucket_id = 'card-images' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'card-images' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "users delete own card images"
  on storage.objects for delete to authenticated
  using (bucket_id = 'card-images' and (storage.foldername(name))[1] = auth.uid()::text);

-- Done! ✅  Now paste your project URL + anon key into js/config.js
-- (see docs/SETUP.md if you get stuck).
