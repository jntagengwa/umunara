create extension if not exists "basejump-supabase_test_helpers" version '0.0.6';

begin;

select plan(11);

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

insert into public.posts (title, slug, author_id, status, visibility, published_at)
values
  ('Public post', 'public-post', tests.get_supabase_uid('editor@example.com'), 'published', 'public', timezone('utc', now())),
  ('Member post', 'member-post', tests.get_supabase_uid('editor@example.com'), 'published', 'member', timezone('utc', now())),
  ('Draft post', 'draft-post', tests.get_supabase_uid('editor@example.com'), 'draft', 'public', null);

select is(
  (select role from public.profiles where id = tests.get_supabase_uid('pending@example.com')),
  'pending',
  'new auth users receive a pending profile'
);

select tests.clear_authentication();
select results_eq(
  'select count(*) from public.posts',
  array[1::bigint],
  'anonymous users read only published public posts'
);

select tests.authenticate_as('pending@example.com');
select results_eq(
  'select count(*) from public.posts',
  array[1::bigint],
  'pending users read only published public posts'
);
select throws_ok(
  $$ insert into public.posts (title, slug, visibility, status) values ('No', 'no', 'public', 'published') $$,
  '42501',
  'pending users cannot publish posts'
);

select tests.authenticate_as('member@example.com');
select results_eq(
  'select count(*) from public.posts',
  array[2::bigint],
  'approved members can read published member posts'
);
select throws_ok(
  $$ insert into public.posts (title, slug, visibility, status) values ('No', 'member-no', 'public', 'draft') $$,
  '42501',
  'members cannot manage content'
);

select tests.authenticate_as('editor@example.com');
select lives_ok(
  $$ insert into public.posts (title, slug, visibility, status) values ('Editor post', 'editor-post', 'public', 'draft') $$,
  'editors can manage content'
);

select tests.authenticate_as('admin@example.com');
select results_eq(
  'select count(*) from public.profiles',
  array[4::bigint],
  'admins can read all profiles'
);
select lives_ok(
  $$ insert into public.site_settings (key, value) values ('site_name', '{"value":"Umunara"}'::jsonb) $$,
  'admins can manage site settings'
);

select tests.clear_authentication();
select throws_ok(
  $$ select * from public.site_settings $$,
  '42501',
  'anonymous users cannot read site settings'
);

select * from finish();

rollback;
