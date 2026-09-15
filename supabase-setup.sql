-- ============================================================================
-- ACE TRANSITIONS — EMPLOYEE PORTAL: SUPABASE SETUP
-- Run this whole file ONCE:
--   Supabase Dashboard → SQL Editor → New query → paste everything → Run
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) TABLES
-- ----------------------------------------------------------------------------

-- One row per auth user. Controls role + activation.
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  full_name   text not null default '',
  role        text not null default 'employee' check (role in ('employee','admin')),
  active      boolean not null default false,      -- admin must activate
  created_at  timestamptz not null default now()
);

-- Training video catalog (managed by admins in the portal)
create table if not exists public.training_videos (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  description text not null default '',
  url         text not null,                       -- YouTube link or direct .mp4
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

-- Who completed which video
create table if not exists public.training_completions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  video_id     uuid not null references public.training_videos(id) on delete cascade,
  completed_at timestamptz not null default now(),
  unique (user_id, video_id)
);

-- Which documents each employee must complete. doc_key values:
--   'onboarding_packet'  = the 1099 fillable PDF
--   'master_application' = the Master Application PDF
create table if not exists public.document_assignments (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  doc_key      text not null check (doc_key in ('onboarding_packet','master_application')),
  status       text not null default 'pending' check (status in ('pending','complete')),
  file_path    text,                               -- storage path of filled PDF
  completed_at timestamptz,
  updated_at   timestamptz not null default now(),
  unique (user_id, doc_key)
);

-- Uploaded files: ID documents and credentials (images/PDFs)
create table if not exists public.document_uploads (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  category     text not null check (category in ('identification','credentials')),
  file_name    text not null,
  file_path    text not null,                      -- storage path in 'documents' bucket
  mime_type    text,
  file_size    bigint,
  uploaded_at  timestamptz not null default now()
);

create index if not exists document_uploads_user_idx on public.document_uploads (user_id, category);

-- Shared reference documents uploaded by admins (handbooks, policies, blank
-- forms...). Visible to all active users; writable by admins only.
-- doc_type: 'company' = general company documents,
--           'policy'  = policies & agreements already accepted via a
--                       third-party app (Connecteam, SimplePractice...).
create table if not exists public.shared_documents (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  description  text not null default '',
  doc_type     text not null default 'company' check (doc_type in ('company','policy')),
  accepted_via text not null default '',           -- e.g. 'Connecteam', 'SimplePractice' (policies only)
  file_name    text not null,
  file_path    text not null,                      -- storage path in 'documents' bucket under shared/
  mime_type    text,
  file_size    bigint,
  uploaded_by  uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 2) TRIGGER: every new auth user automatically gets an (inactive) profile
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role, active)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    'employee',
    false
  )
  on conflict (id) do nothing;

  -- every new account gets both documents assigned, pending
  insert into public.document_assignments (user_id, doc_key)
  values (new.id, 'onboarding_packet'), (new.id, 'master_application')
  on conflict (user_id, doc_key) do nothing;

  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Helper used by every policy (security definer => no recursion)
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and active
  );
$$;

-- ----------------------------------------------------------------------------
-- 3) ROW LEVEL SECURITY
--    Employees see ONLY their own rows. Admins see everything.
-- ----------------------------------------------------------------------------

alter table public.profiles              enable row level security;
alter table public.training_videos       enable row level security;
alter table public.training_completions  enable row level security;
alter table public.document_assignments  enable row level security;
alter table public.document_uploads      enable row level security;
alter table public.shared_documents      enable row level security;

-- PROFILES -------------------------------------------------------------------
drop policy if exists "profiles_select_self_or_admin" on public.profiles;
create policy "profiles_select_self_or_admin" on public.profiles
  for select using (id = auth.uid() or public.is_admin());

drop policy if exists "profiles_admin_update" on public.profiles;
create policy "profiles_admin_update" on public.profiles
  for update using (public.is_admin()) with check (public.is_admin());

-- (No self-update policy on purpose: employees must not be able to
--  promote themselves to admin or activate their own account.)

-- TRAINING VIDEOS ------------------------------------------------------------
drop policy if exists "videos_read_active" on public.training_videos;
create policy "videos_read_active" on public.training_videos
  for select using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.active)
  );

drop policy if exists "videos_admin_write" on public.training_videos;
create policy "videos_admin_write" on public.training_videos
  for all using (public.is_admin()) with check (public.is_admin());

-- TRAINING COMPLETIONS -------------------------------------------------------
drop policy if exists "completions_select_own_or_admin" on public.training_completions;
create policy "completions_select_own_or_admin" on public.training_completions
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists "completions_insert_own" on public.training_completions;
create policy "completions_insert_own" on public.training_completions
  for insert with check (user_id = auth.uid());

drop policy if exists "completions_delete_own" on public.training_completions;
create policy "completions_delete_own" on public.training_completions
  for delete using (user_id = auth.uid());

-- DOCUMENT ASSIGNMENTS -------------------------------------------------------
drop policy if exists "docs_select_own_or_admin" on public.document_assignments;
create policy "docs_select_own_or_admin" on public.document_assignments
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists "docs_insert_own" on public.document_assignments;
create policy "docs_insert_own" on public.document_assignments
  for insert with check (user_id = auth.uid());

drop policy if exists "docs_update_own_or_admin" on public.document_assignments;
create policy "docs_update_own_or_admin" on public.document_assignments
  for update using (user_id = auth.uid() or public.is_admin())
    with check (user_id = auth.uid() or public.is_admin());

drop policy if exists "docs_admin_delete" on public.document_assignments;
create policy "docs_admin_delete" on public.document_assignments
  for delete using (public.is_admin());

-- DOCUMENT UPLOADS (ID forms + credentials) ----------------------------------
drop policy if exists "uploads_select_own_or_admin" on public.document_uploads;
create policy "uploads_select_own_or_admin" on public.document_uploads
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists "uploads_insert_own" on public.document_uploads;
create policy "uploads_insert_own" on public.document_uploads
  for insert with check (user_id = auth.uid());

drop policy if exists "uploads_delete_own_or_admin" on public.document_uploads;
create policy "uploads_delete_own_or_admin" on public.document_uploads
  for delete using (user_id = auth.uid() or public.is_admin());

-- SHARED DOCUMENTS (admin-uploaded reference files) ---------------------------
drop policy if exists "shared_docs_read_active" on public.shared_documents;
create policy "shared_docs_read_active" on public.shared_documents
  for select using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.active)
  );

drop policy if exists "shared_docs_admin_write" on public.shared_documents;
create policy "shared_docs_admin_write" on public.shared_documents
  for insert with check (public.is_admin());

drop policy if exists "shared_docs_admin_update" on public.shared_documents;
create policy "shared_docs_admin_update" on public.shared_documents
  for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists "shared_docs_admin_delete" on public.shared_documents;
create policy "shared_docs_admin_delete" on public.shared_documents
  for delete using (public.is_admin());

-- ----------------------------------------------------------------------------
-- 4) STORAGE: PRIVATE BUCKET for completed PDFs
--    Layout: documents/{user_id}/onboarding-packet-<timestamp>.pdf
--    Employees can only touch their own folder. Admins can read everything.
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

drop policy if exists "docs_upload_own_folder" on storage.objects;
create policy "docs_upload_own_folder" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "docs_read_own_or_admin" on storage.objects;
create policy "docs_read_own_or_admin" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'documents'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_admin()
    )
  );

drop policy if exists "docs_delete_own" on storage.objects;
create policy "docs_delete_own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'documents'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or (name like 'shared/%' and public.is_admin())
    )
  );

-- Shared reference files: all active users can read shared/, admins can upload
drop policy if exists "docs_shared_read" on storage.objects;
create policy "docs_shared_read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'documents'
    and name like 'shared/%'
  );

drop policy if exists "docs_shared_admin_upload" on storage.objects;
create policy "docs_shared_admin_upload" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'documents'
    and name like 'shared/%'
    and public.is_admin()
  );

-- ----------------------------------------------------------------------------
-- 5) SEED: TRAINING VIDEOS
--    Replace the URLs below with your real training videos
--    (YouTube links or direct .mp4 links both work).
--    You can also add/edit/delete videos from the Admin tab in the portal.
--    (Safe to re-run: dedupes first, then upserts by url.)
-- ----------------------------------------------------------------------------

-- 5a) Remove the original HIPAA placeholder video (replaced by the real one)
delete from public.training_videos
 where url = 'https://www.youtube.com/watch?v=c0ZxJxIKabc';

-- 5b) De-duplicate any repeated URLs (earlier seeds had no uniqueness rule).
--     Keeps the OLDEST copy of each url; completion records on removed
--     duplicates are deleted with them (cascade).
delete from public.training_videos a
using public.training_videos b
where a.url = b.url
  and (a.created_at > b.created_at
       or (a.created_at = b.created_at and a.id::text > b.id::text));

-- 5c) One row per URL from now on
create unique index if not exists training_videos_url_key on public.training_videos (url);

-- 5d) Seed / refresh the catalog
insert into public.training_videos (title, description, url, sort_order) values
  ('HIPAA 101: A Comprehensive Training for All Things Compliance',
   'Required HIPAA compliance training webinar (by Rectangle Health) covering the privacy and security rules every ACE Transitions agent must follow.',
   'https://www.youtube.com/watch?v=6cITq9XQW2c', 10),
  ('Peer Support Documentation Standards',
   'How to write accurate, timely, and compliant service notes (H0038).',
   'https://www.youtube.com/watch?v=8tjHYHqXFAk', 20),
  ('Technology & EHR Access Security',
   'Password hygiene, device security, and approved communication channels.',
   'https://www.youtube.com/watch?v=ynH-0V2W5CE', 30)
on conflict (url) do update
  set title = excluded.title,
      description = excluded.description,
      sort_order = excluded.sort_order;

-- REPAIR 4: if shared_documents existed before doc_type/accepted_via were
-- added, add the columns and backfill. Safe to re-run:
alter table public.shared_documents add column if not exists doc_type text not null default 'company';
alter table public.shared_documents add column if not exists accepted_via text not null default '';
do $$
begin
  -- widen the check constraint if the old (missing) version exists
  alter table public.shared_documents drop constraint if exists shared_documents_doc_type_check;
  alter table public.shared_documents
    add constraint shared_documents_doc_type_check
    check (doc_type in ('company','policy'));
exception when duplicate_object then null; -- constraint already there
end $$;

-- ----------------------------------------------------------------------------
-- 5b) REPAIR: create profiles for accounts that signed up BEFORE this setup ran
--     (safe to re-run; skips accounts that already have a profile)
-- ----------------------------------------------------------------------------
insert into public.profiles (id, email, full_name, role, active)
select u.id,
       u.email,
       coalesce(u.raw_user_meta_data->>'full_name', ''),
       'employee',
       false
from auth.users u
on conflict (id) do nothing;

-- REPAIR 2: if document_assignments existed before 'master_application' was
-- added, its check constraint must be widened. Safe to re-run:
alter table public.document_assignments drop constraint if exists document_assignments_doc_key_check;
alter table public.document_assignments
  add constraint document_assignments_doc_key_check
  check (doc_key in ('onboarding_packet','master_application'));

-- REPAIR 3: give every existing account an (empty, pending) row for both docs
insert into public.document_assignments (user_id, doc_key)
select u.id, d.doc_key
from auth.users u
cross join (values ('onboarding_packet'),('master_application')) as d(doc_key)
on conflict (user_id, doc_key) do nothing;

-- ----------------------------------------------------------------------------
-- 6) MAKE YOURSELF THE FIRST ADMIN
--    IMPORTANT: change the email below to YOUR login email, and run this
--    block AFTER step 5b (so the profile row exists).
-- ----------------------------------------------------------------------------
-- update public.profiles
--    set role = 'admin', active = true
--  where email = 'you@acetransitions.org';
