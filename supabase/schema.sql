-- ============================================================
-- ACE Transitions STAFF Portal — Supabase schema
--
-- ⚠ WHICH FILE TO RUN?
--   • Employee portal (login.html / portal.html / packet.html):
--       run supabase-setup.sql — safe to re-run.
--   • Staff portal (staff.html) on its OWN Supabase project:
--       run this file — also safe to re-run.
--
--   Do NOT run this file on a project where supabase-setup.sql is
--   already installed: both portals define a `profiles` table with
--   different shapes/roles. This file detects that case and stops
--   with a clear message instead of breaking the existing setup.
-- ============================================================

-- ------------------------------------------------------------
-- Guard: refuse to run on top of the employee-portal schema
-- ------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'active'
  ) then
    raise exception using message := format(
      E'The employee portal schema (supabase-setup.sql) is already installed in this project.\n'
      'supabase/schema.sql is the STAFF portal schema and conflicts with it (different profiles table).\n'
      'Use the employee portal file instead, or run this file in a separate Supabase project.'
    );
  end if;
end $$;

-- ------------------------------------------------------------
-- Helper: is the current user an admin?
-- security definer so it works for every authenticated user.
-- ------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- ------------------------------------------------------------
-- profiles — one row per staff account, holds the role.
-- Roles: admin | clinician | peer_support
-- ------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  role text not null default 'peer_support'
    check (role in ('admin', 'clinician', 'peer_support')),
  created_at timestamptz not null default now()
);

-- Auto-create a profile row whenever a user account is created
-- (works for dashboard-created users AND admin-created users).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    'peer_support'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;

-- Users can read their own profile (needed to learn their own role).
drop policy if exists "Profiles: read own" on public.profiles;
create policy "Profiles: read own"
  on public.profiles for select
  using (auth.uid() = id);

-- Admins can read every profile (staff list, training progress).
drop policy if exists "Profiles: admin read all" on public.profiles;
create policy "Profiles: admin read all"
  on public.profiles for select
  using (public.is_admin());

-- Users may update their own name, but may NOT change their own role.
drop policy if exists "Profiles: update own name" on public.profiles;
create policy "Profiles: update own name"
  on public.profiles for update
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    and role = (select role from public.profiles where id = auth.uid())
  );

-- Admins can change any profile (used by the "change role" feature).
drop policy if exists "Profiles: admin update" on public.profiles;
create policy "Profiles: admin update"
  on public.profiles for update
  using (public.is_admin());

-- ------------------------------------------------------------
-- form_templates — the blank fillable PDFs staff choose from.
--   storage_path : object key in the form-templates bucket,
--                  or 'local://path' for a file in the repo (demo).
--   field_labels : optional JSON object mapping the raw PDF field
--                  name to a friendly label, e.g.
--                  { "topmostSubform[0].Page1[0].f1_1[0]": "First Name" }
-- ------------------------------------------------------------
create table if not exists public.form_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  storage_path text not null,
  field_labels jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.form_templates enable row level security;

-- Any logged-in staff member can see the available forms.
drop policy if exists "Templates: read for authenticated" on public.form_templates;
create policy "Templates: read for authenticated"
  on public.form_templates for select
  using (auth.role() = 'authenticated');

-- Only admins can add, edit, or remove forms.
drop policy if exists "Templates: admin write" on public.form_templates;
create policy "Templates: admin write"
  on public.form_templates for all
  using (public.is_admin())
  with check (public.is_admin());

-- ------------------------------------------------------------
-- training_videos — ready for the future training section.
-- ------------------------------------------------------------
create table if not exists public.training_videos (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  url text not null,
  description text not null default '',
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.training_videos enable row level security;

drop policy if exists "Videos: read for authenticated" on public.training_videos;
create policy "Videos: read for authenticated"
  on public.training_videos for select
  using (auth.role() = 'authenticated');

drop policy if exists "Videos: admin write" on public.training_videos;
create policy "Videos: admin write"
  on public.training_videos for all
  using (public.is_admin())
  with check (public.is_admin());

-- ------------------------------------------------------------
-- training_progress — per-user progress per video.
-- ------------------------------------------------------------
create table if not exists public.training_progress (
  user_id uuid not null references auth.users (id) on delete cascade,
  video_id uuid not null references public.training_videos (id) on delete cascade,
  status text not null default 'not_started'
    check (status in ('not_started', 'in_progress', 'completed')),
  watched_seconds integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, video_id)
);

alter table public.training_progress enable row level security;

-- Users can read and update their own progress.
drop policy if exists "Progress: read own" on public.training_progress;
create policy "Progress: read own"
  on public.training_progress for select
  using (auth.uid() = user_id);

drop policy if exists "Progress: update own" on public.training_progress;
create policy "Progress: update own"
  on public.training_progress for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Admins can read everyone's progress.
drop policy if exists "Progress: admin read all" on public.training_progress;
create policy "Progress: admin read all"
  on public.training_progress for select
  using (public.is_admin());

-- ------------------------------------------------------------
-- Storage — bucket that holds the blank PDF templates.
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('form-templates', 'form-templates', false)
on conflict (id) do nothing;

-- Logged-in staff can download the blank templates.
drop policy if exists "Templates: authenticated read" on storage.objects;
create policy "Templates: authenticated read"
  on storage.objects for select
  using (bucket_id = 'form-templates' and auth.role() = 'authenticated');

-- Only admins can upload or delete files in the bucket.
drop policy if exists "Templates: admin insert" on storage.objects;
create policy "Templates: admin insert"
  on storage.objects for insert
  with check (bucket_id = 'form-templates' and public.is_admin());

drop policy if exists "Templates: admin delete" on storage.objects;
create policy "Templates: admin delete"
  on storage.objects for delete
  using (bucket_id = 'form-templates' and public.is_admin());
