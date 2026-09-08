begin;
select no_plan();
insert into auth.users(id, email) values ('12000000-0000-4000-8000-000000000001', 'sync-admin@example.test');
update public.profiles set role = 'admin', approved_at = now() where id = '12000000-0000-4000-8000-000000000001';
select public.create_bank_connection('{"connectionId":"22000000-0000-4000-8000-000000000001","actorId":"12000000-0000-4000-8000-000000000001","secretReference":"62000000-0000-4000-8000-000000000001","institutionName":"Fixture Bank","accounts":[{"providerAccountId":"a1","name":"Checking","mask":"1234","type":"depository","subtype":"checking","currency":"USD"}]}');
select ok(not has_function_privilege(role, fn, 'EXECUTE'), role || ' denied ' || fn)
from (values ('anon'), ('authenticated')) roles(role) cross join (values
  ('public.claim_bank_sync(uuid,uuid)'), ('public.bind_bank_sync_item(uuid,uuid,text)'),
  ('public.save_bank_worker_page(jsonb)'), ('public.restart_bank_sync(uuid,uuid)'),
  ('public.release_bank_sync(uuid,uuid,text)'), ('public.enqueue_bank_webhook(text,text,text)')) functions(fn);
set local role service_role;
select is(public.claim_bank_sync('22000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000001')->>'outcome', 'ready', 'initial job claimed');
select is(public.claim_bank_sync('22000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000002')->>'outcome', 'busy', 'concurrent worker excluded');
select public.bind_bank_sync_item('22000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000001', repeat('a',64));
select public.enqueue_bank_webhook(repeat('a',64), repeat('b',64), 'TRANSACTIONS.SYNC_UPDATES_AVAILABLE');
select public.enqueue_bank_webhook(repeat('a',64), repeat('b',64), 'TRANSACTIONS.SYNC_UPDATES_AVAILABLE');
select is((select count(*) from public.bank_webhook_events), 1::bigint, 'duplicate webhook recorded once');
select is((select requested_version from public.bank_sync_requests), 2::bigint, 'duplicate schedules once');
select public.save_bank_worker_page('{"leaseId":"32000000-0000-4000-8000-000000000001","hasMore":true,"page":{"connectionId":"22000000-0000-4000-8000-000000000001","pageId":"42000000-0000-4000-8000-000000000001","expectedCursor":null,"cursor":"page-one","added":[],"modified":[],"removed":[]}}');
select is((select sync_cursor::text from public.bank_connections), 'page-one', 'page cursor committed');
select is(public.restart_bank_sync('22000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000001')->'cursor', 'null'::jsonb, 'mutation restarts original cursor');
select is((select sync_cursor::text from public.bank_connections), null::text, 'restart is durable');
select public.save_bank_worker_page('{"leaseId":"32000000-0000-4000-8000-000000000001","hasMore":false,"page":{"connectionId":"22000000-0000-4000-8000-000000000001","pageId":"42000000-0000-4000-8000-000000000002","expectedCursor":null,"cursor":"final","added":[],"modified":[],"removed":[]}}');
select is((select completed_version from public.bank_sync_requests), 1::bigint, 'completion retains newer webhook work');
select is(public.save_bank_worker_page('{"leaseId":"32000000-0000-4000-8000-000000000001","hasMore":false,"page":{"connectionId":"22000000-0000-4000-8000-000000000001","pageId":"42000000-0000-4000-8000-000000000002","expectedCursor":null,"cursor":"final","added":[],"modified":[],"removed":[]}}')->>'outcome', 'duplicate', 'lost final response can replay');
select is(public.claim_bank_sync('22000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000002')->>'cursor', 'final', 'next cycle uses committed cursor');
select public.release_bank_sync('22000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000002', 'continue');
select is(public.claim_bank_sync('22000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000003')->>'cursor', 'final', 'bounded continuation preserves cursor');
select throws_ok($$select public.restart_bank_sync('22000000-0000-4000-8000-000000000001','32000000-0000-4000-8000-000000000002')$$, '40001', 'Bank sync lease expired.', 'stale worker fenced out');
reset role;
update public.bank_sync_requests set lease_expires_at = now() - interval '1 second';
set local role service_role;
select is(public.claim_bank_sync('22000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000004')->>'cursor', 'final', 'expired worker recovers cycle start');
select public.release_bank_sync('22000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000004', 'disconnected');
select is(public.claim_bank_sync('22000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000005')->>'outcome', 'idle', 'disconnected connection not imported');
select is((select count(*) from public.donations), 0::bigint, 'sync never creates donations');
reset role;
select * from finish();
rollback;
