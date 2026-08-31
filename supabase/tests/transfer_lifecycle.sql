-- Run against an isolated migrated database; every fixture rolls back.
begin;

create function pg_temp.transfer_assert(p_ok boolean, p_message text)
returns void language plpgsql as $$
begin
  if p_ok is distinct from true then raise exception 'transfer test: %', p_message; end if;
end;
$$;

create function pg_temp.transfer_expect_error(p_sql text, p_state text)
returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlstate = p_state then return; end if;
    raise;
  end;
  raise exception 'transfer test: expected SQLSTATE %', p_state;
end;
$$;

select pg_temp.transfer_assert(
  to_regprocedure('request_worker_transfer(text,text,uuid,text)') is not null,
  'transactional request RPC is missing'
);

do $$
declare
  v_fn text;
begin
  foreach v_fn in array array[
    'request_worker_transfer(text,text,uuid,text)',
    'decide_worker_transfer(uuid,transfer_status,text,text,uuid,text)',
    'escalate_worker_transfers(date,text)'
  ] loop
    perform pg_temp.transfer_assert(has_function_privilege('service_role', v_fn, 'EXECUTE'), v_fn || ' service ACL');
    perform pg_temp.transfer_assert(not has_function_privilege('authenticated', v_fn, 'EXECUTE'), v_fn || ' tenant ACL');
    perform pg_temp.transfer_assert(not has_function_privilege('anon', v_fn, 'EXECUTE'), v_fn || ' anonymous ACL');
  end loop;
end;
$$;

create function pg_temp.transfer_fail_final_audit()
returns trigger language plpgsql as $$
begin
  if new.action = 'worker.employer_changed' then
    raise exception 'injected final-audit failure' using errcode = '23514';
  end if;
  return new;
end;
$$;

do $$
declare
  v_industry uuid := gen_random_uuid();
  v_region uuid := gen_random_uuid();
  v_trade uuid := gen_random_uuid();
  v_proficiency uuid := gen_random_uuid();
  v_from uuid := gen_random_uuid();
  v_to uuid := gen_random_uuid();
  v_buyer uuid := gen_random_uuid();
  v_worker uuid := gen_random_uuid();
  v_peer uuid := gen_random_uuid();
  v_peer_two uuid := gen_random_uuid();
  v_peer_three uuid := gen_random_uuid();
  v_unemployed uuid := gen_random_uuid();
  v_listing uuid := gen_random_uuid();
  v_open_line uuid := gen_random_uuid();
  v_history_line uuid := gen_random_uuid();
  v_request uuid := gen_random_uuid();
  v_demand uuid := gen_random_uuid();
  v_below_match uuid := gen_random_uuid();
  v_above_match uuid := gen_random_uuid();
  v_accepted_match uuid := gen_random_uuid();
  v_engagement uuid := gen_random_uuid();
  v_transfer uuid;
  v_peer_transfer uuid;
  v_unemployed_transfer uuid;
  v_result jsonb;
  v_count integer;
  v_before_audits integer;
  v_today date := (now() at time zone 'Australia/Brisbane')::date;
begin
  insert into industry(id, name) values(v_industry, 'Transfer test ' || v_industry);
  insert into region(id, name) values(v_region, 'Transfer test ' || v_region);
  insert into proficiency(id, name, rank) values(v_proficiency, 'Transfer test ' || v_proficiency, 1);
  insert into trade_role(id, name, industry_id) values(v_trade, 'Transfer test', v_industry);
  insert into trade_role_proficiency values(v_trade, v_proficiency);
  insert into company(id, legal_name, contact_email, status) values
    (v_from, 'Transfer employer', 'from@transfer.test', 'Active'),
    (v_to, 'Transfer requester', 'to@transfer.test', 'Active'),
    (v_buyer, 'Transfer buyer', 'buyer@transfer.test', 'Active');
  insert into company_user(user_id, company_id, accepted_at) values
    ('transfer-from', v_from, now()), ('transfer-to', v_to, now()), ('transfer-buyer', v_buyer, now());
  insert into worker(id, first_name, last_name, email, mobile, primary_trade_id, primary_proficiency_id, consent_confirmed_at)
  select id, 'Transfer', 'Worker', id || '@transfer.test', '04' || lpad(ord::text, 8, '0'), v_trade, v_proficiency, now()
  from unnest(array[v_worker, v_peer, v_peer_two, v_peer_three, v_unemployed]) with ordinality as ids(id, ord);
  insert into worker_employment(worker_id, company_id, start_date)
  select id, v_from, v_today - 30 from unnest(array[v_worker, v_peer, v_peer_two, v_peer_three]) id;

  -- Either contact can collide, but two different matched workers must never be guessed between.
  perform pg_temp.transfer_expect_error(format(
    'select request_worker_transfer(%L,%L,%L,%L)', v_worker || '@transfer.test', '0400000002', v_to, 'transfer-to'
  ), '22023');
  v_result := request_worker_transfer(upper(v_worker || '@transfer.test'), '04 0000 0001', v_to, 'transfer-to');
  v_transfer := (v_result ->> 'transfer_id')::uuid;
  perform pg_temp.transfer_assert(v_result ->> 'status' = 'Awaiting Current Employer', 'request transitions synchronously');
  perform pg_temp.transfer_assert((select count(*) = 2 from audit_event where entity_id = v_transfer::text), 'both entry-state audits persist');
  v_result := request_worker_transfer(v_worker || '@transfer.test', '0400000001', v_to, 'transfer-to');
  perform pg_temp.transfer_assert(v_result ->> 'created' = 'false', 'repeat own request is idempotent');
  perform pg_temp.transfer_expect_error(format(
    'select request_worker_transfer(%L,%L,%L,%L)', v_worker || '@transfer.test', '0400000001', v_buyer, 'transfer-buyer'
  ), '23505');
  perform pg_temp.transfer_expect_error(format(
    'insert into worker_transfer(worker_id,from_company_id,to_company_id) values(%L,%L,%L)', v_worker, v_from, v_buyer
  ), '23505');
  perform set_config('request.jwt.claims', json_build_object('sub','transfer-to','role','authenticated')::text, true);
  perform pg_temp.transfer_assert((select worker_id is null and from_company_id is null from company_transfer_view where id = v_transfer), 'requester has no worker or employer identifier');

  perform pg_temp.transfer_expect_error(format(
    'select decide_worker_transfer(%L,%L,%L,%L,%L,null)', v_transfer, 'Awaiting Current Employer', 'withdraw', 'transfer-buyer', v_buyer
  ), '42501');
  perform decide_worker_transfer(v_transfer, 'Awaiting Current Employer', 'withdraw', 'transfer-to', v_to, null);
  perform pg_temp.transfer_expect_error(format(
    'select decide_worker_transfer(%L,%L,%L,%L,%L,null)', v_transfer, 'Awaiting Current Employer', 'approve', 'transfer-from', v_from
  ), '40001');
  v_result := request_worker_transfer(v_worker || '@transfer.test', '0400000001', v_to, 'transfer-to');
  v_transfer := (v_result ->> 'transfer_id')::uuid;
  perform decide_worker_transfer(v_transfer, 'Awaiting Current Employer', 'decline', 'transfer-from', v_from, 'Not moving yet');
  perform pg_temp.transfer_assert((select status = 'Declined' from worker_transfer where id = v_transfer), 'holder declines only waiting request');
  v_result := request_worker_transfer(v_worker || '@transfer.test', '0400000001', v_to, 'transfer-to');
  v_transfer := (v_result ->> 'transfer_id')::uuid;

  -- A worker with no open employer is associated only after Maintain review.
  v_result := request_worker_transfer(v_unemployed || '@transfer.test', '0400000005', v_to, 'transfer-to');
  v_unemployed_transfer := (v_result ->> 'transfer_id')::uuid;
  perform pg_temp.transfer_assert(v_result ->> 'status' = 'Admin Review', 'unemployed worker goes to review');
  perform decide_worker_transfer(v_unemployed_transfer, 'Admin Review', 'approve', 'maintain-transfer-test', null, null);
  perform pg_temp.transfer_assert((select company_id = v_to from worker_employment where worker_id = v_unemployed and end_date is null), 'unemployed approval opens employment');

  insert into capacity_listing(id,company_id) values(v_listing,v_from);
  insert into capacity_line(id,listing_id,company_id,trade_role_id,proficiency_id,available_from,available_until,hours_per_week,location_region_id,supplier_rate_cents,status) values
    (v_open_line,v_listing,v_from,v_trade,v_proficiency,v_today,v_today+30,40,v_region,10000,'Partially Committed'),
    (v_history_line,v_listing,v_from,v_trade,v_proficiency,v_today-30,v_today-1,40,v_region,10000,'Withdrawn');
  insert into capacity_line_worker(capacity_line_id,worker_id)
  select v_open_line,id from unnest(array[v_worker,v_peer,v_peer_two,v_peer_three]) id;
  insert into capacity_line_worker values(v_history_line,v_worker);
  insert into demand_request(id,company_id,name,work_region_id) values(v_request,v_buyer,'Transfer test',v_region);
  insert into demand_line(id,request_id,company_id,trade_role_id,proficiency_id,quantity,start_date,end_date,hours_per_week)
  values(v_demand,v_request,v_buyer,v_trade,v_proficiency,20,v_today,v_today+30,40);
  insert into match(id,demand_line_id,supplier_company_id,buyer_company_id,capacity_line_id,requested_quantity,trade_role_id,proficiency_id,work_region_id,engagement_start,engagement_end,hours_per_week,supplier_rate_cents,fee_bp,buyer_rate_cents,status)
  select id,v_demand,v_from,v_buyer,v_open_line,3,v_trade,v_proficiency,v_region,v_today,v_today+30,40,10000,1000,11000,status::match_status
  from (values(v_below_match,'Awaiting Buyer'),(v_above_match,'Awaiting Buyer'),(v_accepted_match,'Accepted')) as m(id,status);
  insert into match_worker(match_id,worker_id) values
    (v_below_match,v_worker),(v_below_match,v_peer),
    (v_above_match,v_worker),(v_above_match,v_peer_two),(v_above_match,v_peer_three),(v_accepted_match,v_peer);
  insert into platform_config(key,value_int) values('minimum_crew_size',2)
  on conflict(key) do update set value_int=2;

  -- Lodging a request is allowed while committed; neither employer nor Maintain can complete it.
  insert into engagement(id,match_id,demand_line_id,capacity_line_id,buyer_company_id,supplier_company_id,trade_role_id,proficiency_id,work_region_id,start_date,end_date,hours_per_week,supplier_rate_cents,fee_bp,fee_cents_per_hour,buyer_rate_cents,expected_hours,estimated_supplier_value_cents,estimated_maintain_revenue_cents,estimated_buyer_value_cents)
  values(v_engagement,v_accepted_match,v_demand,v_open_line,v_buyer,v_from,v_trade,v_proficiency,v_region,v_today,v_today+30,40,10000,1000,1000,11000,160,1600000,160000,1760000);
  insert into engagement_worker(engagement_id,worker_id,status,committed_window)
  values(v_engagement,v_peer,'Awaiting Commercial',daterange(v_today,v_today+30,'[]'));
  v_result := request_worker_transfer(v_peer || '@transfer.test', '0400000002', v_to, 'transfer-to');
  v_peer_transfer := (v_result ->> 'transfer_id')::uuid;
  perform pg_temp.transfer_expect_error(format(
    'select decide_worker_transfer(%L,%L,%L,%L,%L,null)', v_peer_transfer, 'Awaiting Current Employer','approve','transfer-from',v_from
  ), '23514');
  perform pg_temp.transfer_expect_error(format(
    'select decide_worker_transfer(%L,%L,%L,%L,null,null)',v_peer_transfer,'Awaiting Current Employer','approve','maintain-transfer-test'
  ), '23514');
  perform decide_worker_transfer(v_peer_transfer,'Awaiting Current Employer','review','maintain-transfer-test',null,'Exceptional employer review needed');
  perform pg_temp.transfer_expect_error(format(
    'select decide_worker_transfer(%L,%L,%L,%L,null,null)',v_peer_transfer,'Admin Review','approve','maintain-transfer-test'
  ), '23514');
  perform pg_temp.transfer_assert((select company_id = v_from from worker_employment where worker_id = v_peer and end_date is null), 'committing block changes no employer');

  -- Force the final audit to fail after all cascade work: no intermediate state may survive.
  select count(*) into v_before_audits from audit_event;
  create trigger transfer_test_final_audit before insert on audit_event
    for each row execute function pg_temp.transfer_fail_final_audit();
  perform pg_temp.transfer_expect_error(format(
    'select decide_worker_transfer(%L,%L,%L,%L,%L,null)',v_transfer,'Awaiting Current Employer','approve','transfer-from',v_from
  ), '23514');
  drop trigger transfer_test_final_audit on audit_event;
  perform pg_temp.transfer_assert((select company_id = v_from from worker_employment where worker_id = v_worker and end_date is null), 'late failure rolls employment back');
  perform pg_temp.transfer_assert((select status = 'Awaiting Current Employer' from worker_transfer where id = v_transfer), 'late failure rolls status back');
  perform pg_temp.transfer_assert((select count(*) = 2 from capacity_line_worker where worker_id = v_worker), 'late failure rolls capacity removal back');
  perform pg_temp.transfer_assert((select not knocked_out from match_worker where match_id=v_below_match and worker_id=v_worker), 'late failure rolls nominations back');
  perform pg_temp.transfer_assert((select count(*) = v_before_audits from audit_event), 'late failure rolls all audits back');

  v_result := decide_worker_transfer(v_transfer,'Awaiting Current Employer','approve','transfer-from',v_from,null);
  perform pg_temp.transfer_assert(v_result ->> 'status' = 'Completed', 'approval completes synchronously');
  perform pg_temp.transfer_assert((select company_id = v_to from worker_employment where worker_id = v_worker and end_date is null), 'new employment belongs to requester');
  perform pg_temp.transfer_assert((select end_date = v_today and end_reason = 'transfer' from worker_employment where worker_id = v_worker and company_id=v_from), 'old employment closes historically');
  perform pg_temp.transfer_assert((select count(*)=0 from capacity_line_worker where capacity_line_id=v_open_line and worker_id=v_worker), 'only old open membership removed');
  perform pg_temp.transfer_assert((select count(*)=1 from capacity_line_worker where capacity_line_id=v_history_line and worker_id=v_worker), 'historical listing membership survives');
  perform pg_temp.transfer_assert((select status='Declined' from match where id=v_below_match), 'below-minimum match auto-declines');
  perform pg_temp.transfer_assert((select status='Awaiting Buyer' and nomination_version=1 from match where id=v_above_match), 'above-minimum buyer presentation invalidated');
  perform pg_temp.transfer_assert(jsonb_array_length(v_result -> 'knockouts')=2, 'postcommit knockout notification output');
  perform pg_temp.transfer_assert((select count(*)=1 from audit_event where action='worker.employer_changed' and entity_id=v_worker::text), 'employer change audited');

  -- The fifth day uses Brisbane creation date and holidays, then a repeated run is a no-op.
  perform decide_worker_transfer(v_peer_transfer,'Admin Review','withdraw','transfer-to',v_to,null);
  v_result := request_worker_transfer(v_peer || '@transfer.test','0400000002',v_to,'transfer-to');
  v_peer_transfer := (v_result ->> 'transfer_id')::uuid;
  update worker_transfer set created_at='2026-04-26T22:00:00Z' where id=v_peer_transfer;
  insert into public_holiday(holiday_date,name) values('2026-05-04','QLD Labour Day') on conflict(holiday_date) do nothing;
  v_result := escalate_worker_transfers('2026-05-04',null);
  perform pg_temp.transfer_assert((select status='Awaiting Current Employer' from worker_transfer where id=v_peer_transfer), 'holiday cannot count as fifth business day');
  v_result := escalate_worker_transfers('2026-05-05',null);
  perform pg_temp.transfer_assert((select status='Admin Review' from worker_transfer where id=v_peer_transfer), 'fifth day escalates on deadline');
  select count(*) into v_count from audit_event where entity_id=v_peer_transfer::text and action='worker_transfer.escalated_to_admin_review';
  perform pg_temp.transfer_assert(v_count=1, 'one system escalation audit');
  v_result := escalate_worker_transfers('2026-05-05',null);
  perform pg_temp.transfer_assert(jsonb_array_length(v_result)=0, 'repeat escalation changes nothing');

  -- Resolving the engagement first permits Maintain approval, and accepted-match history survives.
  perform transition_engagement_lifecycle(v_engagement,'Awaiting Commercial','Cancelled','maintain-transfer-test',false,v_today,null,null,null,'Resolved before transfer',false,null);
  perform decide_worker_transfer(v_peer_transfer,'Admin Review','approve','maintain-transfer-test',null,null);
  perform pg_temp.transfer_assert((select not knocked_out from match_worker where match_id=v_accepted_match and worker_id=v_peer), 'terminal accepted nomination retained');

  -- Exact source ownership is re-checked at completion, not trusted from the request.
  v_result := request_worker_transfer(v_peer_three || '@transfer.test','0400000004',v_to,'transfer-to');
  v_transfer := (v_result ->> 'transfer_id')::uuid;
  update worker_employment set company_id=v_buyer where worker_id=v_peer_three and end_date is null;
  perform pg_temp.transfer_expect_error(format(
    'select decide_worker_transfer(%L,%L,%L,%L,%L,null)',v_transfer,'Awaiting Current Employer','approve','transfer-from',v_from
  ), '40001');
end;
$$;

rollback;
