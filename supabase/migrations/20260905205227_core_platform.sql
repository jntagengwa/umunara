create schema if not exists private;

create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  full_name text,
  avatar_url text,
  role text not null default 'pending' check (role in ('pending', 'member', 'editor', 'admin')),
  approved_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check ((role = 'pending' and approved_at is null) or (role <> 'pending' and approved_at is not null))
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  excerpt text,
  content text not null default '',
  author_id uuid not null default auth.uid() references public.profiles(id) on delete restrict,
  category_id uuid references public.categories(id) on delete set null,
  status text not null default 'draft' check (status in ('draft', 'published')),
  visibility text not null default 'public' check (visibility in ('public', 'member')),
  published_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check ((status = 'draft' and published_at is null) or (status = 'published' and published_at is not null))
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  starts_at timestamptz not null,
  ends_at timestamptz,
  location text,
  online_url text,
  capacity integer check (capacity is null or capacity >= 0),
  author_id uuid not null default auth.uid() references public.profiles(id) on delete restrict,
  status text not null default 'draft' check (status in ('draft', 'published')),
  visibility text not null default 'public' check (visibility in ('public', 'member')),
  published_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (ends_at is null or ends_at >= starts_at),
  check ((status = 'draft' and published_at is null) or (status = 'published' and published_at is not null))
);

create table public.event_registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  profile_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  status text not null default 'registered' check (status in ('registered', 'cancelled')),
  registered_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (event_id, profile_id)
);

create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  storage_path text not null unique,
  bucket_id text not null default 'media',
  alt_text text,
  mime_type text,
  byte_size bigint check (byte_size is null or byte_size >= 0),
  uploaded_by uuid not null default auth.uid() references public.profiles(id) on delete restrict,
  visibility text not null default 'member' check (visibility in ('public', 'member')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.resources (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  storage_path text not null unique,
  author_id uuid not null default auth.uid() references public.profiles(id) on delete restrict,
  status text not null default 'draft' check (status in ('draft', 'published')),
  visibility text not null default 'member' check (visibility in ('public', 'member')),
  published_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check ((status = 'draft' and published_at is null) or (status = 'published' and published_at is not null))
);

create table public.site_settings (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  value jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index posts_published_listing_idx on public.posts (status, visibility, published_at desc);
create index events_published_listing_idx on public.events (status, visibility, starts_at);
create index posts_admin_listing_idx on public.posts (created_at desc, id desc);
create index events_admin_listing_idx on public.events (created_at desc, id desc);
create index resources_admin_listing_idx on public.resources (created_at desc, id desc);
create index event_registrations_event_id_idx on public.event_registrations (event_id);
create index event_registrations_profile_id_idx on public.event_registrations (profile_id);
create index media_assets_uploaded_by_idx on public.media_assets (uploaded_by);
create index audit_log_created_at_idx on public.audit_log (created_at desc, id desc);

create trigger profiles_set_updated_at before update on public.profiles for each row execute function private.set_updated_at();
create trigger categories_set_updated_at before update on public.categories for each row execute function private.set_updated_at();
create trigger posts_set_updated_at before update on public.posts for each row execute function private.set_updated_at();
create trigger events_set_updated_at before update on public.events for each row execute function private.set_updated_at();
create trigger event_registrations_set_updated_at before update on public.event_registrations for each row execute function private.set_updated_at();
create trigger media_assets_set_updated_at before update on public.media_assets for each row execute function private.set_updated_at();
create trigger resources_set_updated_at before update on public.resources for each row execute function private.set_updated_at();
create trigger site_settings_set_updated_at before update on public.site_settings for each row execute function private.set_updated_at();
create trigger audit_log_set_updated_at before update on public.audit_log for each row execute function private.set_updated_at();

create function private.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure private.create_profile_for_new_user();

create function private.has_minimum_role(minimum_role text)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and case role
        when 'pending' then 0
        when 'member' then 1
        when 'editor' then 2
        when 'admin' then 3
        else -1
      end >= case minimum_role
        when 'member' then 1
        when 'editor' then 2
        when 'admin' then 3
        else 4
      end
  );
$$;

create function private.can_register_for_event(target_event_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role in ('member', 'editor', 'admin')
  )
  and exists (
    select 1
    from public.events
    where id = target_event_id
      and status = 'published'
      and visibility in ('public', 'member')
  );
$$;

revoke all on schema public from public;
grant usage on schema public to anon, authenticated, service_role;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;
revoke all on function private.set_updated_at() from public;
revoke all on function private.create_profile_for_new_user() from public;
revoke all on function private.has_minimum_role(text) from public;
revoke all on function private.can_register_for_event(uuid) from public;
grant execute on function private.has_minimum_role(text) to authenticated;
grant execute on function private.can_register_for_event(uuid) to authenticated;

revoke all on table public.profiles, public.categories, public.posts, public.events,
  public.event_registrations, public.media_assets, public.resources, public.site_settings,
  public.audit_log from anon, authenticated;

grant select on public.categories, public.posts, public.events, public.media_assets, public.resources to anon;
grant select on public.profiles, public.categories, public.posts, public.events, public.event_registrations,
  public.media_assets, public.resources, public.site_settings, public.audit_log to authenticated;
grant insert, update, delete on public.categories, public.posts, public.events, public.event_registrations,
  public.media_assets, public.resources, public.site_settings, public.audit_log to authenticated;
grant insert, update, delete on public.profiles to authenticated;
grant all privileges on table public.profiles, public.categories, public.posts, public.events,
  public.event_registrations, public.media_assets, public.resources, public.site_settings,
  public.audit_log to service_role;

alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.posts enable row level security;
alter table public.events enable row level security;
alter table public.event_registrations enable row level security;
alter table public.media_assets enable row level security;
alter table public.resources enable row level security;
alter table public.site_settings enable row level security;
alter table public.audit_log enable row level security;

create policy "profiles: users read self or admins read all" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select private.has_minimum_role('admin')));
create policy "profiles: admins manage" on public.profiles
  for all to authenticated
  using ((select private.has_minimum_role('admin')))
  with check ((select private.has_minimum_role('admin')));

create policy "categories: public read" on public.categories
  for select to anon, authenticated using (true);
create policy "categories: editors manage" on public.categories
  for all to authenticated
  using ((select private.has_minimum_role('editor')))
  with check ((select private.has_minimum_role('editor')));

create policy "posts: public read published public" on public.posts
  for select to anon, authenticated
  using (status = 'published' and visibility = 'public');
create policy "posts: members read published member" on public.posts
  for select to authenticated
  using (status = 'published' and visibility = 'member' and (select private.has_minimum_role('member')));
create policy "posts: editors manage" on public.posts
  for all to authenticated
  using ((select private.has_minimum_role('editor')))
  with check ((select private.has_minimum_role('editor')));

create policy "events: public read published public" on public.events
  for select to anon, authenticated
  using (status = 'published' and visibility = 'public');
create policy "events: members read published member" on public.events
  for select to authenticated
  using (status = 'published' and visibility = 'member' and (select private.has_minimum_role('member')));
create policy "events: editors manage" on public.events
  for all to authenticated
  using ((select private.has_minimum_role('editor')))
  with check ((select private.has_minimum_role('editor')));

create policy "event registrations: users read own or editors read all" on public.event_registrations
  for select to authenticated
  using (profile_id = (select auth.uid()) or (select private.has_minimum_role('editor')));
create policy "event registrations: users create own or editors create" on public.event_registrations
  for insert to authenticated
  with check (
    (profile_id = (select auth.uid()) and (select private.can_register_for_event(event_id)))
    or (select private.has_minimum_role('editor'))
  );
create policy "event registrations: users update own or editors update" on public.event_registrations
  for update to authenticated
  using (
    (profile_id = (select auth.uid()) and (select private.can_register_for_event(event_id)))
    or (select private.has_minimum_role('editor'))
  )
  with check (
    (profile_id = (select auth.uid()) and (select private.can_register_for_event(event_id)))
    or (select private.has_minimum_role('editor'))
  );
create policy "event registrations: users delete own or editors delete" on public.event_registrations
  for delete to authenticated
  using (profile_id = (select auth.uid()) or (select private.has_minimum_role('editor')));

create policy "media assets: public read public" on public.media_assets
  for select to anon, authenticated using (visibility = 'public');
create policy "media assets: members read member" on public.media_assets
  for select to authenticated
  using (visibility = 'member' and (select private.has_minimum_role('member')));
create policy "media assets: editors manage" on public.media_assets
  for all to authenticated
  using ((select private.has_minimum_role('editor')))
  with check ((select private.has_minimum_role('editor')));

create policy "resources: public read published public" on public.resources
  for select to anon, authenticated
  using (status = 'published' and visibility = 'public');
create policy "resources: members read published member" on public.resources
  for select to authenticated
  using (status = 'published' and visibility = 'member' and (select private.has_minimum_role('member')));
create policy "resources: editors manage" on public.resources
  for all to authenticated
  using ((select private.has_minimum_role('editor')))
  with check ((select private.has_minimum_role('editor')));

create policy "site settings: admins manage" on public.site_settings
  for all to authenticated
  using ((select private.has_minimum_role('admin')))
  with check ((select private.has_minimum_role('admin')));
create policy "audit log: admins manage" on public.audit_log
  for all to authenticated
  using ((select private.has_minimum_role('admin')))
  with check ((select private.has_minimum_role('admin')));
