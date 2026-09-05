create extension if not exists "basejump-supabase_test_helpers" version '0.0.6';

begin;

select plan(31);

select tests.rls_enabled('public');

select tests.create_supabase_user('pending@example.com');
select tests.create_supabase_user('member@example.com');
select tests.create_supabase_user('editor@example.com');
select tests.create_supabase_user('admin@example.com');

select tests.authenticate_as_service_role();
update public.profiles
set role = 'member', approved_at = timezone('utc', now())
where id = tests.get_supabase_uid('member@example.com');
update public.profiles
set role = 'editor', approved_at = timezone('utc', now())
where id = tests.get_supabase_uid('editor@example.com');
update public.profiles
set role = 'admin', approved_at = timezone('utc', now())
where id = tests.get_supabase_uid('admin@example.com');

insert into public.categories (name, slug) values ('Updates', 'updates');

insert into public.posts (title, slug, author_id, status, visibility, published_at)
values
  ('Public post', 'public-post', tests.get_supabase_uid('editor@example.com'), 'published', 'public', timezone('utc', now())),
  ('Member post', 'member-post', tests.get_supabase_uid('editor@example.com'), 'published', 'member', timezone('utc', now())),
  ('Draft post', 'draft-post', tests.get_supabase_uid('editor@example.com'), 'draft', 'public', null);

insert into public.events (title, starts_at, author_id, status, visibility, published_at)
values
  ('Public event', timezone('utc', now()) + interval '1 day', tests.get_supabase_uid('editor@example.com'), 'published', 'public', timezone('utc', now())),
  ('Member event', timezone('utc', now()) + interval '2 days', tests.get_supabase_uid('editor@example.com'), 'published', 'member', timezone('utc', now())),
  ('Draft event', timezone('utc', now()) + interval '3 days', tests.get_supabase_uid('editor@example.com'), 'draft', 'public', null);

insert into public.resources (title, storage_path, author_id, status, visibility, published_at)
values
  ('Public resource', 'resources/public.pdf', tests.get_supabase_uid('editor@example.com'), 'published', 'public', timezone('utc', now())),
  ('Member resource', 'resources/member.pdf', tests.get_supabase_uid('editor@example.com'), 'published', 'member', timezone('utc', now()));

insert into public.media_assets (storage_path, uploaded_by, visibility)
values
  ('media/public.png', tests.get_supabase_uid('editor@example.com'), 'public'),
  ('media/member.png', tests.get_supabase_uid('editor@example.com'), 'member');

select set_config(
  'test.draft_event_id',
  (select id::text from public.events where title = 'Draft event'),
  true
);

select is(
  (select role from public.profiles where id = tests.get_supabase_uid('pending@example.com')),
  'pending',
  'new auth users receive a pending profile'
);
select ok(
  has_table_privilege('service_role', 'public.profiles', 'SELECT, INSERT, UPDATE, DELETE')
  and has_table_privilege('service_role', 'public.categories', 'SELECT, INSERT, UPDATE, DELETE')
  and has_table_privilege('service_role', 'public.posts', 'SELECT, INSERT, UPDATE, DELETE')
  and has_table_privilege('service_role', 'public.events', 'SELECT, INSERT, UPDATE, DELETE')
  and has_table_privilege('service_role', 'public.event_registrations', 'SELECT, INSERT, UPDATE, DELETE')
  and has_table_privilege('service_role', 'public.media_assets', 'SELECT, INSERT, UPDATE, DELETE')
  and has_table_privilege('service_role', 'public.resources', 'SELECT, INSERT, UPDATE, DELETE')
  and has_table_privilege('service_role', 'public.site_settings', 'SELECT, INSERT, UPDATE, DELETE')
  and has_table_privilege('service_role', 'public.audit_log', 'SELECT, INSERT, UPDATE, DELETE'),
  'service_role has application table privileges'
);

select tests.clear_authentication();
select results_eq('select count(*) from public.posts', array[1::bigint], 'anonymous users read only published public posts');
select results_eq('select count(*) from public.events', array[1::bigint], 'anonymous users read only published public events');
select results_eq('select count(*) from public.resources', array[1::bigint], 'anonymous users read only published public resources');
select results_eq('select count(*) from public.media_assets', array[1::bigint], 'anonymous users read only public media assets');
select results_eq('select count(*) from public.categories', array[1::bigint], 'anonymous users can read categories');

select tests.authenticate_as('pending@example.com');
select results_eq('select count(*) from public.posts', array[1::bigint], 'pending users read only published public posts');
select throws_ok(
  $$ insert into public.posts (title, slug, visibility, status) values ('No', 'no', 'public', 'published') $$,
  '42501',
  null,
  'pending users cannot publish posts'
);
select throws_ok(
  $$ insert into public.event_registrations (event_id, profile_id) values ((select id from public.events where title = 'Public event'), auth.uid()) $$,
  '42501',
  null,
  'pending users cannot register for events'
);

select tests.authenticate_as('member@example.com');
select results_eq('select count(*) from public.posts', array[2::bigint], 'approved members can read published member posts');
select results_eq('select count(*) from public.events', array[2::bigint], 'approved members can read published member events');
select results_eq('select count(*) from public.resources', array[2::bigint], 'approved members can read published member resources');
select results_eq('select count(*) from public.media_assets', array[2::bigint], 'approved members can read member media assets');
select throws_ok(
  $$ insert into public.posts (title, slug, visibility, status) values ('No', 'member-no', 'public', 'draft') $$,
  '42501',
  null,
  'members cannot manage content'
);
update public.profiles set role = 'admin' where id = auth.uid();
select is((select role from public.profiles where id = auth.uid()), 'member', 'members cannot self-promote');
select throws_ok(
  $$ insert into public.site_settings (key, value) values ('member-setting', '{}'::jsonb) $$,
  '42501',
  null,
  'members cannot mutate site settings'
);
select throws_ok(
  $$ insert into public.audit_log (action, entity_type) values ('member-write', 'profile') $$,
  '42501',
  null,
  'members cannot mutate audit data'
);
select lives_ok(
  $$ insert into public.event_registrations (event_id, profile_id) values ((select id from public.events where title = 'Member event'), auth.uid()) $$,
  'approved members can register for published member events'
);
select throws_ok(
  $$ insert into public.event_registrations (event_id, profile_id) values ((select id from public.events where title = 'Draft event'), auth.uid()) $$,
  '42501',
  null,
  'members cannot register for draft events'
);
select throws_ok(
  $$ update public.event_registrations set event_id = current_setting('test.draft_event_id')::uuid where profile_id = auth.uid() $$,
  '42501',
  null,
  'members cannot move registrations to draft events'
);

select tests.authenticate_as('editor@example.com');
select lives_ok(
  $$ insert into public.posts (title, slug, visibility, status) values ('Editor post', 'editor-post', 'public', 'draft') $$,
  'editors can manage content'
);
update public.profiles set full_name = 'Escalated' where id = auth.uid();
select is((select full_name from public.profiles where id = auth.uid()), null, 'editors cannot mutate profiles');
select throws_ok(
  $$ insert into public.site_settings (key, value) values ('editor-setting', '{}'::jsonb) $$,
  '42501',
  null,
  'editors cannot mutate site settings'
);
select throws_ok(
  $$ insert into public.audit_log (action, entity_type) values ('editor-write', 'profile') $$,
  '42501',
  null,
  'editors cannot mutate audit data'
);
select lives_ok(
  $$ insert into public.categories (name, slug) values ('Editor category', 'editor-category') $$,
  'editors can manage categories'
);

select tests.authenticate_as('admin@example.com');
select results_eq('select count(*) from public.profiles', array[4::bigint], 'admins can read all profiles');
select lives_ok(
  $$ insert into public.site_settings (key, value) values ('site_name', '{"value":"Umunara"}'::jsonb) $$,
  'admins can manage site settings'
);
select lives_ok(
  $$ insert into public.audit_log (action, entity_type) values ('admin-write', 'profile') $$,
  'admins can manage audit data'
);

select tests.clear_authentication();
select throws_ok(
  $$ select * from public.site_settings $$,
  '42501',
  null,
  'anonymous users cannot read site settings'
);

select * from finish();

rollback;
