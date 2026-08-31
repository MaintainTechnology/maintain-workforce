-- Isolated PostgreSQL regression; no fixture survives this script.
begin;
create function pg_temp.daily_assert(p_ok boolean, p_message text) returns void language plpgsql as $$
begin
  if p_ok is distinct from true then raise exception 'daily executor test: %', p_message; end if;
end;
$$;
create function pg_temp.fail_daily_audit() returns trigger language plpgsql as $$
begin
  if new.action = 'engagement.flagged_overdue' then
    raise exception 'injected late daily audit failure' using errcode = '23514';
  end if;
  return new;
end;
$$;

select pg_temp.daily_assert(not has_function_privilege('authenticated', 'run_daily_state_transitions(date,text,text)', 'EXECUTE'), 'tenant cannot run clock');
select pg_temp.daily_assert(not has_function_privilege('anon', 'run_daily_state_transitions(date,text,text)', 'EXECUTE'), 'anonymous cannot run clock');
select pg_temp.daily_assert(has_function_privilege('service_role', 'run_daily_state_transitions(date,text,text)', 'EXECUTE'), 'service clock grant');
select pg_temp.daily_assert(not has_table_privilege('authenticated', 'engagement_compliance_review', 'SELECT'), 'compliance view is Maintain only');

do $$
declare
  v_day date := (now() at time zone 'Australia/Brisbane')::date;
  v_industry uuid := gen_random_uuid(); v_region uuid := gen_random_uuid();
  v_trade uuid := gen_random_uuid(); v_prof uuid := gen_random_uuid();
  v_supplier uuid := gen_random_uuid(); v_buyer uuid := gen_random_uuid(); v_requester uuid := gen_random_uuid();
  v_q uuid := gen_random_uuid(); v_optional_q uuid := gen_random_uuid();
  v_w1 uuid := gen_random_uuid(); v_w2 uuid := gen_random_uuid(); v_w3 uuid := gen_random_uuid();
  v_w4 uuid := gen_random_uuid(); v_w5 uuid := gen_random_uuid(); v_w6 uuid := gen_random_uuid();
  v_listing uuid := gen_random_uuid(); v_capacity uuid := gen_random_uuid(); v_expired_capacity uuid := gen_random_uuid();
  v_full_capacity uuid := gen_random_uuid(); v_request uuid := gen_random_uuid();
  v_required_demand uuid := gen_random_uuid(); v_optional_demand uuid := gen_random_uuid(); v_filled_demand uuid := gen_random_uuid();
  v_above uuid := gen_random_uuid(); v_below uuid := gen_random_uuid(); v_irrelevant uuid := gen_random_uuid();
  v_renewed uuid := gen_random_uuid(); v_expire uuid := gen_random_uuid();
  v_complete_match uuid := gen_random_uuid(); v_overdue_match uuid := gen_random_uuid(); v_last_day_match uuid := gen_random_uuid();
  v_complete uuid := gen_random_uuid(); v_overdue uuid := gen_random_uuid(); v_last_day uuid := gen_random_uuid();
  v_transfer uuid := gen_random_uuid(); v_doc uuid := gen_random_uuid(); v_mandatory_doc uuid := gen_random_uuid();
  v_result jsonb; v_audits integer; v_notifications integer; v_failed boolean := false;
begin
  insert into industry(id,name) values(v_industry, 'Daily test '||v_industry);
  insert into region(id,name) values(v_region, 'Daily test '||v_region);
  insert into proficiency(id,name,rank) values(v_prof, 'Daily test '||v_prof, 1);
  insert into trade_role(id,industry_id,name) values(v_trade,v_industry,'Daily trade');
  insert into trade_role_proficiency values(v_trade,v_prof);
  insert into qualification(id,name) values(v_q,'Required '||v_q),(v_optional_q,'Optional '||v_optional_q);
  insert into company(id,legal_name,contact_email,status) values
    (v_supplier,'Daily supplier','supplier@daily.test','Active'),
    (v_buyer,'Daily buyer','buyer@daily.test','Active'),
    (v_requester,'Daily requester','requester@daily.test','Active');
  insert into worker(id,first_name,last_name,email,mobile,primary_trade_id,primary_proficiency_id,consent_confirmed_at)
  select id,'Daily','Worker',id||'@daily.test','049'||lpad(n::text,7,'0'),v_trade,v_prof,now()
  from unnest(array[v_w1,v_w2,v_w3,v_w4,v_w5,v_w6]) with ordinality t(id,n);
  insert into worker_employment(worker_id,company_id,start_date)
  select id,v_supplier,v_day-100 from unnest(array[v_w1,v_w2,v_w3,v_w4,v_w5,v_w6]) id;
  insert into worker_qualification(worker_id,qualification_id,expiry_date) values
    (v_w1,v_q,v_day-1), (v_w2,v_q,v_day+365), (v_w2,v_optional_q,v_day-1),
    (v_w3,v_q,v_day-1), (v_w3,v_q,v_day+365);
  insert into company_document(id,company_id,doc_type,expiry_date)
    values(v_doc,v_supplier,'optional_registration',v_day-1);
  insert into platform_config(key,value_int) values('minimum_crew_size',2)
    on conflict(key) do update set value_int=excluded.value_int;
  insert into capacity_listing(id,company_id,created_by) values(v_listing,v_supplier,'daily-supplier');
  insert into capacity_line(id,listing_id,company_id,trade_role_id,proficiency_id,available_from,available_until,
    hours_per_week,location_region_id,supplier_rate_cents,status)
  values(v_capacity,v_listing,v_supplier,v_trade,v_prof,v_day-30,v_day+30,40,v_region,10000,'Open'),
    (v_expired_capacity,v_listing,v_supplier,v_trade,v_prof,v_day-5,v_day-1,40,v_region,10000,'Open'),
    (v_full_capacity,v_listing,v_supplier,v_trade,v_prof,v_day-5,v_day-1,40,v_region,10000,'Fully Committed');
  insert into capacity_line_worker(capacity_line_id,worker_id)
    select v_capacity,id from unnest(array[v_w1,v_w2,v_w3,v_w4,v_w5,v_w6]) id;
  insert into demand_request(id,company_id,name,work_region_id) values(v_request,v_buyer,'Daily requirement',v_region);
  insert into demand_line(id,request_id,company_id,trade_role_id,proficiency_id,quantity,start_date,end_date,hours_per_week,status)
  values(v_required_demand,v_request,v_buyer,v_trade,v_prof,30,v_day-5,v_day+15,40,'Open'),
    (v_optional_demand,v_request,v_buyer,v_trade,v_prof,30,v_day-5,v_day+15,40,'Open'),
    (v_filled_demand,v_request,v_buyer,v_trade,v_prof,2,v_day-5,v_day-1,40,'Filled');
  insert into demand_line_qualification(demand_line_id,qualification_id) values(v_required_demand,v_q);

  insert into match(id,demand_line_id,supplier_company_id,buyer_company_id,capacity_line_id,requested_quantity,
    trade_role_id,proficiency_id,work_region_id,engagement_start,engagement_end,hours_per_week,
    supplier_rate_cents,fee_bp,buyer_rate_cents,status)
  select id, demand, v_supplier,v_buyer,capacity,qty,v_trade,v_prof,v_region,start_on,end_on,40,10000,1000,11000,status
  from (values
    (v_above,v_required_demand,v_capacity,3,v_day,v_day+10,'Awaiting Buyer'::match_status),
    (v_below,v_required_demand,v_capacity,2,v_day,v_day+10,'Awaiting Buyer'::match_status),
    (v_irrelevant,v_optional_demand,v_capacity,2,v_day,v_day+10,'Awaiting Buyer'::match_status),
    (v_renewed,v_required_demand,v_capacity,2,v_day,v_day+10,'Awaiting Buyer'::match_status),
    (v_expire,v_optional_demand,v_expired_capacity,2,v_day-2,v_day-1,'Awaiting Supplier'::match_status),
    (v_complete_match,v_optional_demand,v_capacity,1,v_day-2,v_day-1,'Accepted'::match_status),
    (v_overdue_match,v_optional_demand,v_capacity,1,v_day-2,v_day+2,'Accepted'::match_status),
    (v_last_day_match,v_optional_demand,v_capacity,1,v_day-2,v_day,'Accepted'::match_status)
  ) m(id,demand,capacity,qty,start_on,end_on,status);
  insert into match_worker(match_id,worker_id) values
    (v_above,v_w1),(v_above,v_w2),(v_above,v_w3), (v_below,v_w1),(v_below,v_w2),
    (v_irrelevant,v_w1),(v_irrelevant,v_w2), (v_renewed,v_w2),(v_renewed,v_w3);

  insert into engagement(id,match_id,demand_line_id,capacity_line_id,buyer_company_id,supplier_company_id,
    trade_role_id,proficiency_id,work_region_id,start_date,end_date,hours_per_week,
    supplier_rate_cents,fee_bp,fee_cents_per_hour,buyer_rate_cents,expected_hours,
    estimated_supplier_value_cents,estimated_maintain_revenue_cents,estimated_buyer_value_cents)
  select map.id,m.id,m.demand_line_id,m.capacity_line_id,m.buyer_company_id,m.supplier_company_id,
    m.trade_role_id,m.proficiency_id,m.work_region_id,m.engagement_start,m.engagement_end,40,
    10000,1000,1000,11000,40,400000,40000,440000
  from match m join (values(v_complete,v_complete_match),(v_overdue,v_overdue_match),(v_last_day,v_last_day_match)) map(id,match_id)
    on map.match_id=m.id;
  insert into engagement_worker(engagement_id,worker_id,status,committed_window)
  select e.id,map.worker_id,'Awaiting Commercial',daterange(e.start_date,e.end_date,'[]')
  from engagement e join (values(v_complete,v_w4),(v_overdue,v_w5),(v_last_day,v_w6)) map(id,worker_id) on map.id=e.id;
  perform record_engagement_payment(v_complete,'Awaiting Commercial','pre-authorised','test-reference','daily-operator',v_day-5);
  perform record_engagement_payment(v_last_day,'Awaiting Commercial','pre-authorised','test-reference','daily-operator',v_day-5);
  insert into worker_transfer(id,worker_id,from_company_id,to_company_id,status,requested_by,created_at)
    values(v_transfer,v_w3,v_supplier,v_requester,'Awaiting Current Employer','daily-requester',now()-interval '20 days');

  select count(*) into v_audits from audit_event;
  select count(*) into v_notifications from notification;
  create trigger test_daily_late_failure before insert on audit_event for each row execute function pg_temp.fail_daily_audit();
  begin
    perform run_daily_state_transitions(v_day,'maintain@daily.test','https://daily.test');
  exception when check_violation then
    v_failed := true;
  end;
  drop trigger test_daily_late_failure on audit_event;
  perform pg_temp.daily_assert(v_failed,'injected late failure reached');
  perform pg_temp.daily_assert((select status='Current' from company_document where id=v_doc),'document rollback');
  perform pg_temp.daily_assert((select status='Awaiting Buyer' from match where id=v_below),'knockout rollback');
  perform pg_temp.daily_assert((select status='Confirmed' from engagement where id=v_complete),'lifecycle rollback');
  perform pg_temp.daily_assert((select count(*)=v_audits from audit_event),'audit rollback');
  perform pg_temp.daily_assert((select count(*)=v_notifications from notification),'outbox rollback');

  v_result := run_daily_state_transitions(v_day,'maintain@daily.test','https://daily.test');
  perform pg_temp.daily_assert((v_result->>'nominations_knocked_out')::integer=2,'only relevant qualification nominations knocked out');
  perform pg_temp.daily_assert((select status='Awaiting Buyer' and nomination_version=1 from match where id=v_above),'above-floor buyer version invalidated');
  perform pg_temp.daily_assert((select status='Declined' from match where id=v_below),'below-floor auto decline');
  perform pg_temp.daily_assert((select not knocked_out from match_worker where match_id=v_irrelevant and worker_id=v_w1),'unrelated qualification match retained');
  perform pg_temp.daily_assert((select not knocked_out from match_worker where match_id=v_renewed and worker_id=v_w3),'valid renewal defeats old expired record');
  perform pg_temp.daily_assert((select status='Expired' from match where id=v_expire),'capacity expiry cascades in same transaction');
  perform pg_temp.daily_assert((select status='Expired' from capacity_line where id=v_full_capacity),'fully committed capacity expires');
  perform pg_temp.daily_assert((select status='Expired' from demand_line where id=v_filled_demand),'filled demand expires');
  perform pg_temp.daily_assert((select status='Completed' from engagement where id=v_complete),'past-end engagement completes');
  perform pg_temp.daily_assert((select status='Completed' from engagement_worker where engagement_id=v_complete),'worker commitment releases with completion');
  perform pg_temp.daily_assert((select status='Active' from engagement where id=v_last_day),'final on-site day stays active');
  perform pg_temp.daily_assert((select status='Awaiting Commercial' from engagement where id=v_overdue),'overdue never activates without commercial trigger');
  perform pg_temp.daily_assert((select status='Admin Review' from worker_transfer where id=v_transfer),'due transfer escalates');
  perform pg_temp.daily_assert((select count(*)=3 from notification where entity_id=v_transfer and trigger='transfer escalated'),'escalation outbox covers both parties and Maintain');
  perform pg_temp.daily_assert((select count(*)=1 from notification where entity_id=v_above and recipient_company_id=v_buyer),'buyer re-notification persisted');
  perform pg_temp.daily_assert((select bool_and(subject is not null and body is not null and action_url like 'https://daily.test/%') from notification),'outbox payload is complete');

  select count(*) into v_audits from audit_event;
  select count(*) into v_notifications from notification;
  v_result := run_daily_state_transitions(v_day,'maintain@daily.test','https://daily.test');
  perform pg_temp.daily_assert(not exists(select 1 from jsonb_each_text(v_result) where value::integer<>0),'second run is a true no-op');
  perform pg_temp.daily_assert((select count(*)=v_audits from audit_event),'second run adds no audits');
  perform pg_temp.daily_assert((select count(*)=v_notifications from notification),'second run adds no notification rows');

  -- A real mandatory company expiry now affects the remaining nominations, but
  -- never cancels work that is already committing. Renewal clears the live flag.
  insert into company_document(id,company_id,doc_type,expiry_date) values(v_mandatory_doc,v_supplier,'public_liability',v_day-1);
  perform run_daily_state_transitions(v_day,'maintain@daily.test','https://daily.test');
  perform pg_temp.daily_assert((select status='Active' from engagement where id=v_last_day),'company expiry does not cancel engagements');
  perform pg_temp.daily_assert(exists(select 1 from engagement_compliance_review where engagement_id=v_last_day and source_id=v_supplier),'mandatory company expiry is visibly flagged');
  insert into company_document(company_id,doc_type,expiry_date) values(v_supplier,'public_liability',v_day+365);
  perform pg_temp.daily_assert(not exists(select 1 from engagement_compliance_review where engagement_id=v_last_day and source_id=v_supplier),'renewal clears company flag immediately');
end;
$$;
rollback;
