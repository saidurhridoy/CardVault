-- ============================================================================
-- CardVault — TEAM VAULTS migration (v1.5.0)
-- ----------------------------------------------------------------------------
-- Run ONCE in your Supabase project's SQL editor:
--   Dashboard → SQL Editor → New query → paste this file → Run
--
-- What it creates:
--   • public.organizations  — a team vault (a company / sales team)
--   • public.org_members   — who belongs to a team (owner or member)
--   • public.org_invites   — pending invitations by email
--   • cards.org_id         — a card shared into a team vault
--   • Row Level Security: members can READ shared cards; only the card's
--     owner can edit/delete their own cards; only the team owner can
--     manage members
--   • Team members can view the card PHOTO of cards shared with their team
--
-- Safe to re-run (idempotent).
-- ============================================================================

-- ---------------------------------------------------------- organizations --
create table if not exists public.organizations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(trim(name)) between 1 and 80),
  owner_id   uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.organizations enable row level security;

drop policy if exists "members read orgs"    on public.organizations;
drop policy if exists "owners create orgs"   on public.organizations;
drop policy if exists "owners update orgs"   on public.organizations;
drop policy if exists "owners delete orgs"   on public.organizations;

create policy "members read orgs"
  on public.organizations for select to authenticated
  using (
    owner_id = auth.uid()
    or exists (select 1 from public.org_members m where m.org_id = id and m.user_id = auth.uid())
  );

create policy "owners create orgs"
  on public.organizations for insert to authenticated
  with check (owner_id = auth.uid());

create policy "owners update orgs"
  on public.organizations for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "owners delete orgs"
  on public.organizations for delete to authenticated
  using (owner_id = auth.uid());

-- ------------------------------------------------------------ org_members --
-- email/name are denormalized at join time so members can see WHO is in the
-- team without a public profiles table.
create table if not exists public.org_members (
  org_id     uuid not null references public.organizations (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       text not null default 'member' check (role in ('owner', 'member')),
  email      text not null default '',
  name       text not null default '',
  joined_at  timestamptz not null default now(),
  primary key (org_id, user_id)
);

create index if not exists org_members_user_idx on public.org_members (user_id);

alter table public.org_members enable row level security;

drop policy if exists "team reads members"       on public.org_members;
drop policy if exists "owner adds self"          on public.org_members;
drop policy if exists "invitee joins as member"  on public.org_members;
drop policy if exists "members update self"       on public.org_members;
drop policy if exists "owner or self removes"    on public.org_members;

create policy "team reads members"
  on public.org_members for select to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.org_members m2
      where m2.org_id = org_id and m2.user_id = auth.uid()
    )
  );

-- creating a team inserts yourself as its owner
create policy "owner adds self"
  on public.org_members for insert to authenticated
  with check (
    user_id = auth.uid()
    and role = 'owner'
    and exists (select 1 from public.organizations o where o.id = org_id and o.owner_id = auth.uid())
  );

-- accepting an invitation inserts yourself as a plain member
create policy "invitee joins as member"
  on public.org_members for insert to authenticated
  with check (
    user_id = auth.uid()
    and role = 'member'
    and exists (
      select 1 from public.org_invites i
      where i.org_id = org_id
        and lower(i.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  );

create policy "members update self"
  on public.org_members for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "owner or self removes"
  on public.org_members for delete to authenticated
  using (
    user_id = auth.uid()                                  -- leave a team
    or exists (
      select 1 from public.organizations o
      where o.id = org_id and o.owner_id = auth.uid()     -- owner removes anyone
    )
  );

-- ------------------------------------------------------------- org_invites --
create table if not exists public.org_invites (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations (id) on delete cascade,
  email       text not null,
  invited_by  uuid not null references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (org_id, email)
);

alter table public.org_invites enable row level security;

drop policy if exists "team reads invites"    on public.org_invites;
drop policy if exists "owner creates invites" on public.org_invites;
drop policy if exists "owner deletes invites" on public.org_invites;

create policy "team reads invites"
  on public.org_invites for select to authenticated
  using (
    lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    or exists (
      select 1 from public.org_members m
      where m.org_id = org_id and m.user_id = auth.uid()
    )
  );

create policy "owner creates invites"
  on public.org_invites for insert to authenticated
  with check (
    invited_by = auth.uid()
    and exists (
      select 1 from public.organizations o
      where o.id = org_id and o.owner_id = auth.uid()
    )
  );

create policy "owner deletes invites"
  on public.org_invites for delete to authenticated
  using (
    -- invitee can decline their own invite
    lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    or exists (
      select 1 from public.organizations o
      where o.id = org_id and o.owner_id = auth.uid()
    )
  );

-- -------------------------------------------------- cards.org_id (sharing) --
alter table public.cards
  add column if not exists org_id uuid
  references public.organizations (id) on delete set null;

create index if not exists cards_org_idx on public.cards (org_id)
  where org_id is not null;

-- Members of a team can READ cards shared with that team.
-- (Insert/update/delete stay owner-only via the original policies.)
drop policy if exists "team members read shared cards" on public.cards;

create policy "team members read shared cards"
  on public.cards for select to authenticated
  using (
    auth.uid() = user_id
    or (
      org_id is not null
      and exists (
        select 1 from public.org_members m
        where m.org_id = cards.org_id and m.user_id = auth.uid()
      )
    )
  );

-- Allow the card owner to share/unshare (update org_id) — the existing
-- "users update own cards" policy already covers this because the owner
-- stays user_id. No extra policy needed.

-- ------------------------------- team members can view shared card photos --
-- Card images live at "{owner_user_id}/{card_id}.jpg" in the private
-- "card-images" bucket. This policy lets team members fetch a signed URL
-- for photos of cards shared with one of their teams.
drop policy if exists "team members read shared card images" on storage.objects;

create policy "team members read shared card images"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'card-images'
    and exists (
      select 1 from public.cards c
      where c.card_image_path = storage.objects.name
        and c.org_id is not null
        and exists (
          select 1 from public.org_members m
          where m.org_id = c.org_id and m.user_id = auth.uid()
        )
    )
  );

-- Done! ✅  In the app: Settings → Teams (or the Teams button in the header)
