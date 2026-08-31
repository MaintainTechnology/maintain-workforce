-- Isolated PostgreSQL execution. The lock boundary probe introduces a participant
-- exactly between the caller's snapshot and its worker locks; everything rolls back.
begin;

create function pg_temp.transfer_lock_id(p_id integer) returns uuid language sql immutable as $$
  select ('00000000-0000-4000-a000-' || lpad(p_id::text, 12, '0'))::uuid
$$;
create function pg_temp.transfer_lock_assert(p_ok boolean, p_message text)
returns void language plpgsql as $$
begin
  if p_ok is distinct from true then raise exception 'transfer lock test: %', p_message; end if;
end;
$$;
create function pg_temp.transfer_lock_expect_retry(p_sql text)
returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when serialization_failure then return;
  end;
  raise exception 'transfer lock test: expected SQLSTATE 40001';
end;
$$;

create temporary table transfer_lock_calls (position bigserial, company_ids uuid[]);
alter function lock_match_companies(uuid[]) rename to transfer_test_real_lock_companies;
create function lock_match_companies(p_company_ids uuid[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into pg_temp.transfer_lock_calls(company_ids) values(p_company_ids);
  perform transfer_test_real_lock_companies(p_company_ids);
  if current_setting('test.transfer_new_party', true) = 'true' then
    perform set_config('test.transfer_new_party', '', true);
    insert into match_worker(match_id, worker_id)
    values(pg_temp.transfer_lock_id(71), pg_temp.transfer_lock_id(100));
  end if;
  if current_setting('test.transfer_new_due_worker', true) = 'true' then
    perform set_config('test.transfer_new_due_worker', '', true);
    insert into worker_transfer(worker_id, from_company_id, to_company_id, status, created_at)
    values(pg_temp.transfer_lock_id(101), pg_temp.transfer_lock_id(10), pg_temp.transfer_lock_id(30),
      'Awaiting Current Employer', '2026-01-01T00:00:00Z');
  end if;
end;
$$;
revoke all on function lock_match_companies(uuid[]) from public, anon, authenticated, service_role;
grant execute on function lock_match_companies(uuid[]) to service_role;

insert into industry(id, name) values(pg_temp.transfer_lock_id(1), 'Transfer lock test');
insert into region(id, name) values(pg_temp.transfer_lock_id(2), 'Transfer lock test');
insert into proficiency(id, name, rank) values(pg_temp.transfer_lock_id(3), 'Transfer lock test', 1);
insert into trade_role(id, name, industry_id)
values(pg_temp.transfer_lock_id(4), 'Transfer lock test', pg_temp.transfer_lock_id(1));
insert into trade_role_proficiency values(pg_temp.transfer_lock_id(4), pg_temp.transfer_lock_id(3));
insert into company(id, legal_name, contact_email, status)
select pg_temp.transfer_lock_id(id), 'Transfer lock company ' || id, id || '@transfer-lock.test', 'Active'
from unnest(array[10,20,30,40]) id;
insert into company_user(user_id, company_id, accepted_at)
values('transfer-lock-from', pg_temp.transfer_lock_id(10), now()), ('transfer-lock-to', pg_temp.transfer_lock_id(30), now());
insert into worker(id, first_name, last_name, email, mobile, primary_trade_id, primary_proficiency_id, consent_confirmed_at)
select pg_temp.transfer_lock_id(id), 'Transfer', 'Lock worker', id || '@transfer-lock.test', '0400000' || id,
  pg_temp.transfer_lock_id(4), pg_temp.transfer_lock_id(3), now()
from unnest(array[100,101]) id;
insert into worker_employment(worker_id, company_id, start_date)
select pg_temp.transfer_lock_id(id), pg_temp.transfer_lock_id(10), '2026-01-01' from unnest(array[100,101]) id;
insert into capacity_listing(id, company_id) values(pg_temp.transfer_lock_id(50), pg_temp.transfer_lock_id(10));
insert into capacity_line(id, listing_id, company_id, trade_role_id, proficiency_id, available_from, available_until,
  hours_per_week, location_region_id, supplier_rate_cents, status)
values(pg_temp.transfer_lock_id(51), pg_temp.transfer_lock_id(50), pg_temp.transfer_lock_id(10),
  pg_temp.transfer_lock_id(4), pg_temp.transfer_lock_id(3), '2026-01-01', '2027-01-01',
  40, pg_temp.transfer_lock_id(2), 10000, 'Open');
insert into capacity_line_worker(capacity_line_id, worker_id)
select pg_temp.transfer_lock_id(51), pg_temp.transfer_lock_id(id) from unnest(array[100,101]) id;
insert into demand_request(id, company_id, name, work_region_id)
values(pg_temp.transfer_lock_id(60), pg_temp.transfer_lock_id(20), 'Transfer lock buyer', pg_temp.transfer_lock_id(2)),
  (pg_temp.transfer_lock_id(62), pg_temp.transfer_lock_id(40), 'New transfer counterparty', pg_temp.transfer_lock_id(2));
insert into demand_line(id, request_id, company_id, trade_role_id, proficiency_id, quantity, start_date, end_date, hours_per_week)
select pg_temp.transfer_lock_id(line), pg_temp.transfer_lock_id(request), pg_temp.transfer_lock_id(buyer),
  pg_temp.transfer_lock_id(4), pg_temp.transfer_lock_id(3), 2, '2026-01-01', '2027-01-01', 40
from (values(61,60,20), (63,62,40)) d(line,request,buyer);
insert into match(id, demand_line_id, supplier_company_id, buyer_company_id, capacity_line_id, requested_quantity,
  trade_role_id, proficiency_id, work_region_id, engagement_start, engagement_end, hours_per_week,
  supplier_rate_cents, fee_bp, buyer_rate_cents, status)
select pg_temp.transfer_lock_id(id), pg_temp.transfer_lock_id(demand), pg_temp.transfer_lock_id(10),
  pg_temp.transfer_lock_id(buyer), pg_temp.transfer_lock_id(51), 2, pg_temp.transfer_lock_id(4),
  pg_temp.transfer_lock_id(3), pg_temp.transfer_lock_id(2), '2026-01-01', '2027-01-01', 40, 10000, 1000, 11000, 'Awaiting Buyer'
from (values(70,61,20), (71,63,40)) m(id,demand,buyer);
insert into match_worker(match_id, worker_id)
select pg_temp.transfer_lock_id(70), pg_temp.transfer_lock_id(id) from unnest(array[100,101]) id;
insert into platform_config(key, value_int) values('minimum_crew_size', 2)
on conflict(key) do update set value_int = 2;

do $$
declare
  v_transfer uuid;
  v_result jsonb;
  v_first_companies uuid[];
  v_companies uuid[] := array[pg_temp.transfer_lock_id(10), pg_temp.transfer_lock_id(20), pg_temp.transfer_lock_id(30)];
  v_workers uuid[] := array[pg_temp.transfer_lock_id(100)];
begin
  v_result := request_worker_transfer('100@transfer-lock.test', '0400000100', pg_temp.transfer_lock_id(30), 'transfer-lock-to');
  v_transfer := (v_result ->> 'transfer_id')::uuid;
  select company_ids into v_first_companies from pg_temp.transfer_lock_calls order by position limit 1;
  perform pg_temp.transfer_lock_assert(v_first_companies = v_companies,
    'request locks sorted employer, requester and every open-match counterparty');

  truncate pg_temp.transfer_lock_calls;
  perform decide_worker_transfer(v_transfer, 'Awaiting Current Employer', 'withdraw', 'transfer-lock-to', pg_temp.transfer_lock_id(30), null);
  select company_ids into v_first_companies from pg_temp.transfer_lock_calls order by position limit 1;
  perform pg_temp.transfer_lock_assert(v_first_companies = v_companies, 'withdraw also starts with the complete company set');
  v_result := request_worker_transfer('100@transfer-lock.test', '0400000100', pg_temp.transfer_lock_id(30), 'transfer-lock-to');
  v_transfer := (v_result ->> 'transfer_id')::uuid;

  -- A supplier may finish a new nomination while the outer transaction waits for
  -- its original company locks. No entrypoint may acquire the new company later.
  perform set_config('test.transfer_new_party', 'true', true);
  perform pg_temp.transfer_lock_expect_retry(format(
    'select request_worker_transfer(%L,%L,%L,%L)', '100@transfer-lock.test', '0400000100', pg_temp.transfer_lock_id(30), 'transfer-lock-to'));
  perform set_config('test.transfer_new_party', '', true);
  perform set_config('test.transfer_new_party', 'true', true);
  perform pg_temp.transfer_lock_expect_retry(format(
    'select decide_worker_transfer(%L,%L,%L,%L,%L,null)', v_transfer, 'Awaiting Current Employer', 'approve', 'transfer-lock-from', pg_temp.transfer_lock_id(10)));
  perform set_config('test.transfer_new_party', '', true);
  perform pg_temp.transfer_lock_assert((select status = 'Awaiting Current Employer' from worker_transfer where id = v_transfer),
    'new-counterparty retry leaves transfer undecided');
  perform pg_temp.transfer_lock_assert(not exists(select 1 from match_worker where match_id = pg_temp.transfer_lock_id(71)),
    'injected participant rolls back with the rejected decision');

  update worker_transfer set created_at = '2026-01-01T00:00:00Z' where id = v_transfer;
  perform set_config('test.transfer_new_party', 'true', true);
  perform pg_temp.transfer_lock_expect_retry('select escalate_worker_transfers(''2026-08-01'', null)');
  perform set_config('test.transfer_new_party', '', true);
  perform set_config('test.transfer_new_due_worker', 'true', true);
  perform pg_temp.transfer_lock_expect_retry('select escalate_worker_transfers(''2026-08-01'', null)');
  perform set_config('test.transfer_new_due_worker', '', true);
  perform pg_temp.transfer_lock_assert((select status = 'Awaiting Current Employer' from worker_transfer where id = v_transfer),
    'incomplete escalation snapshots leave status and audit unchanged');

  truncate pg_temp.transfer_lock_calls;
  v_result := escalate_worker_transfers('2026-08-01', null);
  select company_ids into v_first_companies from pg_temp.transfer_lock_calls order by position limit 1;
  perform pg_temp.transfer_lock_assert(v_first_companies = v_companies, 'public escalation locks all due participants before workers');
  perform pg_temp.transfer_lock_assert(jsonb_array_length(v_result) = 1, 'public escalation retains its result shape');

  perform decide_worker_transfer(v_transfer, 'Admin Review', 'withdraw', 'transfer-lock-to', pg_temp.transfer_lock_id(30), null);
  v_result := request_worker_transfer('100@transfer-lock.test', '0400000100', pg_temp.transfer_lock_id(30), 'transfer-lock-to');
  v_transfer := (v_result ->> 'transfer_id')::uuid;
  update worker_transfer set created_at = '2026-01-01T00:00:00Z' where id = v_transfer;
  perform pg_temp.transfer_lock_expect_retry(format(
    'select escalate_worker_transfers_prelocked(''2026-08-01'', null, %L::uuid[], %L::uuid[])',
    array[pg_temp.transfer_lock_id(10), pg_temp.transfer_lock_id(30)], v_workers));
  perform pg_temp.transfer_lock_expect_retry(format(
    'select escalate_worker_transfers_prelocked(''2026-08-01'', null, %L::uuid[], ''{}''::uuid[])', v_companies));
  perform lock_match_companies(v_companies);
  perform lock_match_workers(v_workers);
  truncate pg_temp.transfer_lock_calls;
  v_result := escalate_worker_transfers_prelocked('2026-08-01', null, v_companies, v_workers);
  perform pg_temp.transfer_lock_assert(jsonb_array_length(v_result) = 1, 'private cron escalation uses the prelocked snapshot');
  perform pg_temp.transfer_lock_assert(not exists(select 1 from pg_temp.transfer_lock_calls), 'private core never acquires company locks');
  perform pg_temp.transfer_lock_assert(not has_function_privilege('service_role',
    'escalate_worker_transfers_prelocked(date,text,uuid[],uuid[])', 'EXECUTE'), 'prelocked core is not a standalone RPC');

  truncate pg_temp.transfer_lock_calls;
  v_result := decide_worker_transfer(v_transfer, 'Admin Review', 'approve', 'maintain-transfer-lock-test', null, null);
  select company_ids into v_first_companies from pg_temp.transfer_lock_calls order by position limit 1;
  perform pg_temp.transfer_lock_assert(v_first_companies = v_companies, 'approval first locks the full sorted company set');
  perform pg_temp.transfer_lock_assert(not exists(select 1 from pg_temp.transfer_lock_calls where not company_ids <@ v_first_companies),
    'cascade helper company locks are entirely reentrant');
  perform pg_temp.transfer_lock_assert(v_result ->> 'status' = 'Completed', 'normal approval still completes atomically');
end;
$$;

rollback;
