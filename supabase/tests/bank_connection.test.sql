begin;
select no_plan();
create schema if not exists tests;
grant usage on schema tests to service_role;
insert into auth.users(id, email) values
  ('11000000-0000-4000-8000-000000000001', 'connection-admin@example.test'),
  ('11000000-0000-4000-8000-000000000002', 'connection-member@example.test');
update public.profiles set role = 'admin', approved_at = now() where id = '11000000-0000-4000-8000-000000000001';
update public.profiles set role = 'member', approved_at = now() where id = '11000000-0000-4000-8000-000000000002';
create function tests.connection_input() returns jsonb language sql immutable as $$
  select '{"connectionId":"21000000-0000-4000-8000-000000000001","actorId":"11000000-0000-4000-8000-000000000001","secretReference":"61000000-0000-4000-8000-000000000001","institutionName":"Fixture Bank","accounts":[{"providerAccountId":"a1","name":"Business checking","mask":"1234","type":"depository","subtype":"checking","currency":"USD"}]}'::jsonb;
$$;
grant execute on function tests.connection_input() to service_role;
select ok(not has_function_privilege(role, 'public.create_bank_connection(jsonb)', 'EXECUTE'), role || ' cannot connect directly') from (values ('anon'), ('authenticated')) roles(role);
select ok(not has_function_privilege(role, 'private.create_bank_connection(jsonb)', 'EXECUTE'), role || ' cannot invoke privileged write') from (values ('anon'), ('authenticated')) roles(role);
select ok(not has_table_privilege(role, 'public.bank_sync_requests', permission), role || ' cannot access sync requests') from (values ('anon'), ('authenticated')) roles(role) cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE')) permissions(permission);
select ok(relrowsecurity, 'sync requests enable RLS') from pg_class where oid = 'public.bank_sync_requests'::regclass;
select ok(not prosecdef, 'public connection wrapper is invoker') from pg_proc where oid = 'public.create_bank_connection(jsonb)'::regprocedure;
set local role service_role;
select throws_ok($$ select public.create_bank_connection(tests.connection_input() || '{"actorId":"11000000-0000-4000-8000-000000000002"}') $$, '42501', 'Administrator approval required.', 'nonadmin actor rejected');
select throws_ok($$ select public.create_bank_connection(tests.connection_input() || '{"accessToken":"private"}') $$, '22023', 'Invalid bank connection.', 'raw secrets rejected');
select throws_ok($$ select public.create_bank_connection(jsonb_set(tests.connection_input(), '{accounts,0,mask}', '"123456789"')) $$, '23514', null, 'full account numbers rejected');
select is((select count(*) from public.bank_connections), 0::bigint, 'invalid account rolls back connection');
select is((select count(*) from public.bank_sync_requests), 0::bigint, 'invalid account schedules nothing');
select is(public.create_bank_connection(tests.connection_input()), '{"id":"21000000-0000-4000-8000-000000000001","institutionName":"Fixture Bank","status":"active","lastSyncedAt":null}'::jsonb, 'safe DTO returned');
select is((select count(*) from public.bank_accounts), 1::bigint, 'selected account saved');
select is((select count(*) from public.bank_sync_requests where completed_at is null), 1::bigint, 'one durable initial sync request');
select is((select count(*) from public.audit_log where action = 'bank.connection.created'), 1::bigint, 'audit committed with connection');
select is((select count(*) from public.donations), 0::bigint, 'connecting creates no donation');
select throws_ok($$ select public.create_bank_connection(tests.connection_input()) $$, '23505', null, 'duplicate identity cannot repeat writes');
select is((select count(*) from public.audit_log where action = 'bank.connection.created'), 1::bigint, 'duplicate leaves one audit');
reset role;
select is((select count(*) from private.bank_connection_secrets), 1::bigint, 'only one opaque reference persisted');
select * from finish();
rollback;
