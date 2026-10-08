-- Optional future Supabase integration for this static KOBOM website.
-- Execute in Supabase SQL Editor, then create an admin in Authentication > Users.
-- IMPORTANT: Only server-side row level security protects published content.

create table if not exists public.site_admins (
    user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.site_admins enable row level security;
-- No direct table access for browsers: admin checks via the SECURITY DEFINER function.
revoke all on public.site_admins from anon, authenticated;

create or replace function public.is_site_admin()
returns boolean language sql stable security definer set search_path = ''
as $$
    select exists (
      select 1 from public.site_admins a where a.user_id = (select auth.uid())
    );
$$;
revoke execute on function public.is_site_admin() from public, anon;
grant execute on function public.is_site_admin() to authenticated;

create table if not exists public.site_pages (
    slug text primary key,
    content jsonb not null,
    updated_at timestamptz not null default now(),
    updated_by uuid references auth.users(id) on delete set null,
    constraint valid_slug check (slug = 'home')
);
alter table public.site_pages enable row level security;

drop policy if exists "Anyone can read published pages" on public.site_pages;
create policy "Anyone can read published pages" on public.site_pages
  for select to anon, authenticated using (true);
drop policy if exists "Only admins can insert pages" on public.site_pages;
create policy "Only admins can insert pages" on public.site_pages
  for insert to authenticated with check ((select public.is_site_admin()));
drop policy if exists "Only admins can update pages" on public.site_pages;
create policy "Only admins can update pages" on public.site_pages
  for update to authenticated using ((select public.is_site_admin()))
  with check ((select public.is_site_admin()));
-- No public deletion policy; edited pages must remain available.

-- After creating a Supabase Auth user, authorize them by user UUID:
-- insert into public.site_admins (user_id) values ('PUT-ADMIN-USER-UUID-HERE');

-- Add public Supabase URL + publishable/anon key in supabase-config.js.
-- NEVER use a Supabase service_role/secret key in browser JavaScript.
