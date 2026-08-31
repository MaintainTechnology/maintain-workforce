-- Run inside the matching_lifecycle.sql fixture transaction (before its scenario
-- tests), with accepted intake_supplier / intake_buyer memberships. Every scenario
-- rolls back to its savepoint. No linked database is required or modified.

savepoint worker_status_case;
select set_config('request.jwt.claims', '{"sub":"intake_supplier","role":"authenticated"}', true);
do $$
declare v_match uuid; v_result jsonb;
begin
  v_match := pg_temp.matching_propose(array[20,21]);
  perform pg_temp.matching_supplier(v_match, array[20,21]);
  v_result := set_company_worker_status(pg_temp.matching_id(20), 'Active', 'Inactive');
  perform pg_temp.matching_assert(v_result -> 'knocked_out_match_ids' = jsonb_build_array(v_match)
    and v_result -> 'buyer_renotification_match_ids' = jsonb_build_array(v_match)
    and v_result -> 'declined_match_ids' = '[]'::jsonb, 'above-floor notification IDs preserved');
  perform pg_temp.matching_expect_error(format('select pg_temp.matching_buyer(%L,1,1)', v_match), '40001');
  perform pg_temp.matching_buyer(v_match, 1, 2);
  perform pg_temp.matching_assert((select count(*)=1 from engagement_worker
    where worker_id=pg_temp.matching_id(21)), 'only surviving nomination committed with refreshed version');
end;
$$;
rollback to worker_status_case;

savepoint worker_status_case;
select set_config('request.jwt.claims', '{"sub":"intake_supplier","role":"authenticated"}', true);
create function pg_temp.worker_status_fail_knockout_audit() returns trigger language plpgsql as $$
begin
  if new.action='match.nomination_knocked_out' then
    raise exception 'injected knockout audit failure' using errcode='23514';
  end if;
  return new;
end;
$$;
create trigger worker_status_fail_knockout_audit before insert on audit_event
  for each row execute function pg_temp.worker_status_fail_knockout_audit();
do $$
declare v_match uuid;
begin
  v_match := pg_temp.matching_propose(array[20,21]);
  perform pg_temp.matching_supplier(v_match, array[20,21]);
  perform pg_temp.matching_expect_error(format('select set_company_worker_status(%L,%L,%L)',
    pg_temp.matching_id(20), 'Active', 'Inactive'), '23514');
  perform pg_temp.matching_assert((select status='Active' from worker where id=pg_temp.matching_id(20)),
    'late audit error rolls back worker status');
  perform pg_temp.matching_assert((select nomination_version=1 and status='Awaiting Buyer' from match where id=v_match),
    'late audit error rolls back buyer version/status');
  perform pg_temp.matching_assert((select count(*)=2 from match_worker where match_id=v_match and not knocked_out),
    'late audit error rolls back all nomination knockouts');
  perform pg_temp.matching_assert(not exists(select 1 from audit_event where action='worker.status_changed'),
    'late audit error rolls back preceding worker audit');
end;
$$;
rollback to worker_status_case;

savepoint worker_status_case;
select set_config('request.jwt.claims', '{"sub":"intake_supplier","role":"authenticated"}', true);
do $$
declare v_match uuid; v_result jsonb;
begin
  v_match := pg_temp.matching_propose(array[20]);
  perform pg_temp.matching_supplier(v_match, array[20]);
  v_result := set_company_worker_status(pg_temp.matching_id(20), 'Active', 'Inactive');
  perform pg_temp.matching_assert(v_result -> 'declined_match_ids' = jsonb_build_array(v_match)
    and v_result -> 'buyer_declined_match_ids' = jsonb_build_array(v_match)
    and v_result -> 'buyer_renotification_match_ids' = '[]'::jsonb, 'below-floor notification IDs preserved');
  perform pg_temp.matching_assert((select status='Declined' and nomination_version=2 from match where id=v_match),
    'below-floor knockout atomically closes and versions proposal');
  perform pg_temp.matching_assert((select count(*)=1 from audit_event
    where entity_id=v_match::text and action='match.auto_declined'), 'auto-decline audited once');
  perform pg_temp.matching_expect_error(format('select set_company_worker_status(%L,%L,%L)',
    pg_temp.matching_id(20), 'Active', 'Inactive'), '40001');
end;
$$;
rollback to worker_status_case;

savepoint worker_status_case;
select set_config('request.jwt.claims', '{"sub":"intake_supplier","role":"authenticated"}', true);
set local role authenticated;
select pg_temp.matching_expect_error(format('select set_company_worker_status(%L,%L,%L)',
  pg_temp.matching_id(20), 'Active', 'Suspended'), '42501');
select pg_temp.matching_expect_error(format('select set_company_worker_status(%L,%L,%L,%L)',
  pg_temp.matching_id(20), 'Active', 'Inactive', 'forged_maintain'), '42501');
select pg_temp.matching_expect_error(format('select set_company_worker_status(%L,null,%L)',
  pg_temp.matching_id(20), 'Inactive'), '22004');
select set_config('request.jwt.claims', '{"sub":"intake_buyer","role":"authenticated"}', true);
select pg_temp.matching_expect_error(format('select set_company_worker_status(%L,%L,%L)',
  pg_temp.matching_id(20), 'Active', 'Inactive'), '42501');
reset role;
update company_user set accepted_at=null where user_id='intake_supplier';
select set_config('request.jwt.claims', '{"sub":"intake_supplier","role":"authenticated"}', true);
set local role authenticated;
select pg_temp.matching_expect_error(format('select set_company_worker_status(%L,%L,%L)',
  pg_temp.matching_id(20), 'Active', 'Inactive'), '42501');
reset role;
rollback to worker_status_case;

savepoint worker_status_case;
update company set status='Pending' where id=pg_temp.matching_id(10);
select set_config('request.jwt.claims', '{"sub":"intake_supplier","role":"authenticated"}', true);
set local role authenticated;
select set_company_worker_status(pg_temp.matching_id(20), 'Active', 'Inactive');
reset role;
select pg_temp.matching_assert((select status='Inactive' from worker where id=pg_temp.matching_id(20)),
  'Pending employer can prepare worker status');
update company set status='Suspended' where id=pg_temp.matching_id(10);
set local role authenticated;
select pg_temp.matching_expect_error(format('select set_company_worker_status(%L,%L,%L)',
  pg_temp.matching_id(20), 'Inactive', 'Active'), '42501');
reset role;
update company set status='Closed' where id=pg_temp.matching_id(10);
set local role authenticated;
select pg_temp.matching_expect_error(format('select set_company_worker_status(%L,%L,%L)',
  pg_temp.matching_id(20), 'Inactive', 'Active'), '42501');
reset role;
rollback to worker_status_case;

savepoint worker_status_case;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
select pg_temp.matching_expect_error(format('select set_company_worker_status(%L,%L,%L)',
  pg_temp.matching_id(20), 'Active', 'Suspended'), '42501');
select set_company_worker_status(pg_temp.matching_id(20), 'Active', 'Suspended', 'maintain_test');
reset role;
select pg_temp.matching_assert((select status='Suspended' from worker where id=pg_temp.matching_id(20)),
  'explicit Maintain actor can suspend worker');
select pg_temp.matching_assert((select actor_user_id='maintain_test' from audit_event
  where action='worker.status_changed' and entity_id=pg_temp.matching_id(20)::text), 'Maintain status actor audited');
select set_config('request.jwt.claims', '{"sub":"intake_supplier","role":"authenticated"}', true);
set local role authenticated;
select pg_temp.matching_expect_error(format('select set_company_worker_status(%L,%L,%L)',
  pg_temp.matching_id(20), 'Suspended', 'Active'), '42501');
select pg_temp.matching_expect_error(format('select set_company_worker_status(%L,%L,%L)',
  pg_temp.matching_id(20), 'Active', 'Active'), '42501');
reset role;
rollback to worker_status_case;

savepoint worker_status_case;
select set_config('request.jwt.claims', '{"sub":"intake_supplier","role":"authenticated"}', true);
set local role authenticated;
select set_company_worker_status(pg_temp.matching_id(20), 'Active', 'Active');
reset role;
select pg_temp.matching_assert(not exists(select 1 from audit_event where action='worker.status_changed'),
  'unchanged status does not manufacture a second transition');
rollback to worker_status_case;
