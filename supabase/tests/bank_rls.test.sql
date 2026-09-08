begin;
select no_plan();

create schema if not exists tests;
grant usage on schema tests to anon, authenticated, service_role;
create function tests.bank_page(page_number integer default 1, expected text default null, next_cursor text default 'cursor_1', amount bigint default 2400)
returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_object('connectionId', '20000000-0000-4000-8000-000000000001',
    'pageId', '30000000-0000-4000-8000-' || lpad(page_number::text, 12, '0'),
    'expectedCursor', expected, 'cursor', next_cursor,
    'added', jsonb_build_array(jsonb_build_object('providerTransactionId', 'bank_txn_1',
      'accountId', '40000000-0000-4000-8000-000000000001', 'amountMinor', amount,
      'currency', 'USD', 'bookedOn', '2026-09-07', 'description', 'Processor payout', 'pending', false)),
    'modified', '[]'::jsonb, 'removed', '[]'::jsonb);
$$;
create function tests.bank_link(kind text default 'processor_payout', donation text default '50000000-0000-4000-8000-000000000001')
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object('transactionId', id, 'actorId', '10000000-0000-4000-8000-000000000004',
    'kind', kind, 'donationIds', jsonb_build_array(donation))
  from public.bank_transactions where provider_transaction_id = 'bank_txn_1';
$$;
grant execute on function tests.bank_page(integer, text, text, bigint), tests.bank_link(text, text) to anon, authenticated, service_role;

insert into auth.users(id, email) values
  ('10000000-0000-4000-8000-000000000001', 'bank-pending@example.test'),
  ('10000000-0000-4000-8000-000000000002', 'bank-member@example.test'),
  ('10000000-0000-4000-8000-000000000003', 'bank-editor@example.test'),
  ('10000000-0000-4000-8000-000000000004', 'bank-admin@example.test');
update public.profiles set role = 'member', approved_at = now() where id = '10000000-0000-4000-8000-000000000002';
update public.profiles set role = 'editor', approved_at = now() where id = '10000000-0000-4000-8000-000000000003';
update public.profiles set role = 'admin', approved_at = now() where id = '10000000-0000-4000-8000-000000000004';
insert into public.bank_connections(id, institution_name, authorized_by) values
  ('20000000-0000-4000-8000-000000000001', 'Test bank', '10000000-0000-4000-8000-000000000004'),
  ('20000000-0000-4000-8000-000000000002', 'Other bank', '10000000-0000-4000-8000-000000000004');
insert into private.bank_connection_secrets(connection_id, secret_reference) values
  ('20000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001');
insert into public.bank_accounts(id, connection_id, provider_account_id, name, mask, subtype, currency) values
  ('40000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'account_1', 'Business checking', '1234', 'checking', 'USD'),
  ('40000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'account_2', 'Other checking', '9876', 'checking', 'USD');
insert into public.donations(id, provider, provider_reference, gross_amount_minor, fee_amount_minor, refunded_amount_minor, currency, status, cadence, received_at, last_event_at) values
  ('50000000-0000-4000-8000-000000000001', 'stripe', 'bank_gift_1', 2500, 100, 0, 'USD', 'succeeded', 'one_time', now(), now()),
  ('50000000-0000-4000-8000-000000000002', 'manual', 'bank_gift_2', 2400, 0, 0, 'USD', 'succeeded', 'one_time', now(), now()),
  ('50000000-0000-4000-8000-000000000003', 'stripe', 'bank_gift_3', 2500, 100, 0, 'EUR', 'succeeded', 'one_time', now(), now()),
  ('50000000-0000-4000-8000-000000000004', 'paypal', 'bank_gift_4', 2500, 0, 0, 'USD', 'pending', 'one_time', now(), now());

select ok(relrowsecurity, relname || ' enables RLS') from pg_class where oid in (
  'public.bank_connections'::regclass, 'private.bank_connection_secrets'::regclass,
  'public.bank_accounts'::regclass, 'public.bank_transactions'::regclass,
  'public.bank_sync_pages'::regclass, 'public.bank_webhook_events'::regclass, 'public.reconciliation_links'::regclass);
select ok(not has_table_privilege(browser_role, table_name, privilege), browser_role || ' cannot ' || privilege || ' ' || table_name)
from (values ('anon'), ('authenticated')) roles(browser_role)
cross join (values ('public.bank_connections'), ('private.bank_connection_secrets'), ('public.bank_accounts'),
  ('public.bank_transactions'), ('public.bank_sync_pages'), ('public.bank_webhook_events'), ('public.reconciliation_links')) tables(table_name)
cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) privileges(privilege);
select ok(not has_table_privilege('service_role', table_name, privilege), 'service cannot bypass RPC via ' || privilege || ' ' || table_name)
from (values ('public.bank_connections'), ('public.bank_accounts'), ('public.bank_transactions'),
  ('public.bank_sync_pages'), ('public.bank_webhook_events'), ('public.reconciliation_links'), ('private.bank_connection_secrets')) tables(table_name)
cross join (values ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE')) privileges(privilege);
select ok(not has_function_privilege(browser_role, function_name, 'EXECUTE'), browser_role || ' cannot execute ' || function_name)
from (values ('anon'), ('authenticated')) roles(browser_role)
cross join (values ('public.save_bank_sync_page(jsonb)'), ('private.save_bank_sync_page(jsonb)'),
  ('public.link_bank_reconciliation(jsonb)'), ('private.link_bank_reconciliation(jsonb)')) functions(function_name);
select ok(not prosecdef, proname || ' public wrapper uses invoker permissions') from pg_proc
where oid in ('public.save_bank_sync_page(jsonb)'::regprocedure, 'public.link_bank_reconciliation(jsonb)'::regprocedure);

set local role service_role;
select is(public.save_bank_sync_page(tests.bank_page())->>'outcome', 'applied', 'service persists a page');
select is(public.save_bank_sync_page(tests.bank_page())->>'outcome', 'duplicate', 'same page replay is idempotent');
select is((select count(*) from public.bank_transactions), 1::bigint, 'unique provider identity');
select is((select sync_cursor::text from public.bank_connections where id = '20000000-0000-4000-8000-000000000001'), 'cursor_1', 'successful page advances cursor');
select is(public.save_bank_sync_page(tests.bank_page(100, 'cursor_1', 'cursor_1') || '{"added":[]}')->>'outcome', 'applied', 'empty no-op page can retain its cursor');
select throws_ok($$select public.save_bank_sync_page(tests.bank_page(2, null, 'cursor_2'))$$, '40001', 'Bank sync cursor conflict.', 'stale writer fails');
select throws_ok($$select public.save_bank_sync_page(tests.bank_page(1, null, 'different'))$$, '22023', 'Bank page identity conflict.', 'page ID cannot be reused for other content');
select throws_ok($$select public.save_bank_sync_page(tests.bank_page(2, 'cursor_1', 'cursor_2') || '{"accessToken":"forbidden"}')$$, '22023', 'Invalid bank sync page.', 'raw secrets rejected');
select throws_ok($$select public.save_bank_sync_page(jsonb_set(tests.bank_page(2, 'cursor_1', 'cursor_2'), '{added,0,amountMinor}', '1.5'))$$, '22023', 'Invalid bank transaction snapshot.', 'fractional money rejected');
select throws_ok($$select public.save_bank_sync_page(tests.bank_page(2, 'cursor_1', 'cursor_2', 9007199254740992))$$, '23514', null, 'unsafe money rejected');
select throws_ok($$select public.save_bank_sync_page(jsonb_set(tests.bank_page(2, 'cursor_1', 'cursor_2'), '{added,0,bookedOn}', '"2026-02-30"'))$$, '22008', null, 'invalid date rejected');
select throws_ok($$select public.save_bank_sync_page(jsonb_set(tests.bank_page(2, 'cursor_1', 'cursor_2'), '{added,0,currency}', '"ZZZ"'))$$, '23514', null, 'invalid currency rejected');
select throws_ok($$select public.save_bank_sync_page(jsonb_set(tests.bank_page(2, 'cursor_1', 'cursor_2'), '{removed}', '["bank_txn_1"]'))$$, '22023', 'Duplicate bank transaction identity.', 'overlapping changes rejected');
select throws_ok($$select public.save_bank_sync_page(jsonb_set(tests.bank_page(2, 'cursor_1', 'cursor_2'), '{added,0,accountId}', '"40000000-0000-4000-8000-000000000002"'))$$, '22023', 'Bank account unavailable.', 'cross-connection accounts rejected');
select is((select count(*) from public.bank_sync_pages), 2::bigint, 'failed pages leave no receipt');
select is((select amount_minor::bigint from public.bank_transactions), 2400::bigint, 'failed pages leave money unchanged');
select throws_ok($$select public.save_bank_sync_page(jsonb_set(tests.bank_page(2, 'cursor_1', 'cursor_2', 2100), '{modified}',
  jsonb_build_array((tests.bank_page()->'added'->0) || '{"providerTransactionId":"bad_second","accountId":"40000000-0000-4000-8000-000000000002"}')))$$,
  '22023', 'Bank account unavailable.', 'failure after first write rolls back the whole page');
select is((select amount_minor::bigint from public.bank_transactions), 2400::bigint, 'early page write rolled back');
select is((select sync_cursor::text from public.bank_connections where id = '20000000-0000-4000-8000-000000000001'), 'cursor_1', 'failed page does not advance cursor');

select throws_ok($$select public.link_bank_reconciliation(jsonb_set(tests.bank_link(), '{actorId}', '"10000000-0000-4000-8000-000000000002"'))$$, '42501', 'Administrator required.', 'RPC checks current admin actor');
select throws_ok($$select public.link_bank_reconciliation(tests.bank_link('donation'))$$, '22023', 'Incompatible reconciliation target.', 'processor gifts cannot become offline gifts');
select throws_ok($$select public.link_bank_reconciliation(tests.bank_link('processor_payout', '50000000-0000-4000-8000-000000000003'))$$, '22023', 'Incompatible reconciliation target.', 'currency mismatch rejected');
select throws_ok($$select public.link_bank_reconciliation(tests.bank_link('processor_payout', '50000000-0000-4000-8000-000000000004'))$$, '22023', 'Incompatible reconciliation target.', 'unsettled gift rejected');
select is(public.link_bank_reconciliation(tests.bank_link())->>'outcome', 'applied', 'payout linked atomically');
select is(public.link_bank_reconciliation(tests.bank_link())->>'outcome', 'duplicate', 'exact link replay returns original links');
select is((select count(*) from public.donations), 4::bigint, 'payout creates no gift');
select is((select count(*) from public.reconciliation_links), 1::bigint, 'link replay creates no extra link');
select is((select classification::text from public.bank_transactions), 'processor_payout', 'link classifies source');
select is((select count(*) from public.audit_log where action = 'bank.reconciliation.linked'), 1::bigint, 'link and audit are committed together');
select throws_ok($$select public.link_bank_reconciliation(tests.bank_link('donation', '50000000-0000-4000-8000-000000000002'))$$, '22023', 'Bank transaction cannot be reconciled.', 'incompatible source classification rejected');

select is(public.save_bank_sync_page(tests.bank_page(2, 'cursor_1', 'cursor_2', 2300))->>'outcome', 'applied', 'modified provider identity upserts');
select is((select count(*) from public.bank_transactions), 1::bigint, 'modification retains original row');
select is((select count(*) from public.reconciliation_links where revoked_at is not null), 1::bigint, 'financial change revokes link without deletion');
select is((select classification::text from public.bank_transactions), 'unreviewed', 'changed credit returns to review');
select throws_ok($$select public.link_bank_reconciliation(tests.bank_link())$$, '22023', 'Reconciliation amounts do not match.', 'amount mismatch rejected');
select is(public.save_bank_sync_page(tests.bank_page(3, 'cursor_2', 'cursor_3'))->>'outcome', 'applied', 'restored amount persists');
select is(public.link_bank_reconciliation(tests.bank_link())->>'outcome', 'applied', 'revoked historical match permits new match');
select is(public.save_bank_sync_page(tests.bank_page(4, 'cursor_3', 'cursor_4') || '{"added":[],"removed":["bank_txn_1"]}')->>'outcome', 'applied', 'removal persists');
select ok((select removed_at is not null from public.bank_transactions), 'removed transaction remains recorded');
select is((select count(*) from public.reconciliation_links where revoked_at is null), 0::bigint, 'removal revokes active matches');
select throws_ok($$select public.link_bank_reconciliation(tests.bank_link())$$, '22023', 'Bank transaction cannot be reconciled.', 'removed source cannot be linked');
select is(public.save_bank_sync_page(tests.bank_page())->>'outcome', 'duplicate', 'old duplicate page remains harmless');
select is((select sync_cursor::text from public.bank_connections where id = '20000000-0000-4000-8000-000000000001'), 'cursor_4', 'old replay cannot rewind cursor');
select is(public.save_bank_sync_page(tests.bank_page(5, 'cursor_4', 'cursor_5') || '{"added":[],"removed":["never_imported"]}')->>'outcome', 'applied', 'unknown removals are safely consumed');
select throws_ok($$delete from public.bank_transactions$$, '42501', null, 'service cannot hard delete');
reset role;
select throws_ok($$delete from public.bank_transactions$$, '42501', 'Bank history cannot be deleted.', 'owner deletion also rejected');
insert into public.donations(id, provider, provider_reference, gross_amount_minor, fee_amount_minor, refunded_amount_minor, currency, status, cadence, received_at, last_event_at) values
  ('50000000-0000-4000-8000-000000000005', 'stripe', 'bank_gift_5', 2500, 100, 0, 'USD', 'succeeded', 'one_time', now(), now()),
  ('50000000-0000-4000-8000-000000000006', 'stripe', 'bank_gift_6', 2500, 100, 0, 'USD', 'succeeded', 'one_time', now(), now());
set local role service_role;
select is(public.save_bank_sync_page(jsonb_set(tests.bank_page(6, 'cursor_5', 'cursor_6'), '{added}', jsonb_build_array(
  tests.bank_page()->'added'->0,
  (tests.bank_page()->'added'->0) || '{"providerTransactionId":"bank_txn_2"}',
  (tests.bank_page()->'added'->0) || '{"providerTransactionId":"bank_txn_offline"}',
  (tests.bank_page()->'added'->0) || '{"providerTransactionId":"bank_txn_multi","amountMinor":4800}'
)))->>'outcome', 'applied', 'removed source can be restored and new rows imported');
select is(public.link_bank_reconciliation(tests.bank_link())->>'outcome', 'applied', 'restored source can be matched again');
select throws_ok($$select public.link_bank_reconciliation(jsonb_set(tests.bank_link(), '{transactionId}',
  to_jsonb((select id from public.bank_transactions where provider_transaction_id = 'bank_txn_2'))))$$,
  '23505', null, 'same donation cannot link to a second bank source');
select is((select classification::text from public.bank_transactions where provider_transaction_id = 'bank_txn_2'), 'unreviewed', 'failed link leaves classification unchanged');
select is(public.link_bank_reconciliation(jsonb_set(tests.bank_link('donation', '50000000-0000-4000-8000-000000000002'), '{transactionId}',
  to_jsonb((select id from public.bank_transactions where provider_transaction_id = 'bank_txn_offline'))))->>'outcome', 'applied', 'offline gift permits one source and target');
select is(public.link_bank_reconciliation(jsonb_set(tests.bank_link(), '{transactionId}',
  to_jsonb((select id from public.bank_transactions where provider_transaction_id = 'bank_txn_multi')))
  || '{"donationIds":["50000000-0000-4000-8000-000000000005","50000000-0000-4000-8000-000000000006"]}')->>'outcome',
  'applied', 'one processor payout groups compatible gifts');
select is((select count(*) from public.donations), 6::bigint, 'all reconciliation paths retain gift count');
select is((select sum(matched_amount_minor) from public.reconciliation_links where bank_transaction_id =
  (select id from public.bank_transactions where provider_transaction_id = 'bank_txn_multi') and revoked_at is null),
  4800::numeric, 'stored allocation snapshots equal bank credit');
reset role;
update public.bank_connections set status = 'disconnected' where id = '20000000-0000-4000-8000-000000000001';
set local role service_role;
select throws_ok($$select public.save_bank_sync_page(tests.bank_page(7, 'cursor_6', 'cursor_7'))$$, '22023', 'Bank connection unavailable.', 'disconnected sync rejected');
reset role;

set local role anon;
select throws_ok($$select * from public.bank_transactions$$, '42501', null, 'anonymous table read denied');
select throws_ok($$select public.save_bank_sync_page(tests.bank_page())$$, '42501', null, 'anonymous RPC denied');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select throws_ok($$select * from public.bank_transactions$$, '42501', null, 'pending table read denied');
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
select throws_ok($$select * from public.bank_transactions$$, '42501', null, 'member table read denied');
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);
select throws_ok($$select * from public.bank_transactions$$, '42501', null, 'editor table read denied');
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000004', true);
select throws_ok($$select * from public.bank_transactions$$, '42501', null, 'admin browser table read also denied');
select throws_ok($$select public.save_bank_sync_page(tests.bank_page())$$, '42501', null, 'admin browser RPC denied');
select throws_ok($$select * from private.bank_connection_secrets$$, '42501', null, 'admin browser secret references denied');
reset role;

-- Rolled-back grants prove RLS still denies every browser role, including admins.
grant select on public.bank_connections, public.bank_accounts, public.bank_transactions,
  public.bank_sync_pages, public.bank_webhook_events, public.reconciliation_links to anon, authenticated;
set local role anon;
select is((select count(*) from public.bank_transactions), 0::bigint, 'anonymous RLS fails closed');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select is((select count(*) from public.bank_transactions), 0::bigint, 'pending RLS fails closed');
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
select is((select count(*) from public.bank_transactions), 0::bigint, 'member RLS fails closed');
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);
select is((select count(*) from public.bank_transactions), 0::bigint, 'editor RLS fails closed');
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000004', true);
select is((select count(*) from public.bank_transactions), 0::bigint, 'admin browser RLS fails closed');
reset role;
select * from finish();
rollback;
