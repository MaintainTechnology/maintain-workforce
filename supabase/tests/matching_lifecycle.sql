-- Executable matching regressions; run only against an isolated migrated database.
-- All fixtures and fault injection are rolled back.
begin;

create function pg_temp.matching_assert(p_ok boolean, p_message text)
returns void language plpgsql as $$
begin
  if p_ok is distinct from true then raise exception 'matching test: %', p_message; end if;
end;
$$;
create function pg_temp.matching_expect_error(p_sql text, p_state text)
returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlstate = p_state then return; end if;
    raise;
  end;
  raise exception 'matching test: expected SQLSTATE %', p_state;
end;
$$;
create function pg_temp.matching_id(p_n integer) returns uuid language sql immutable as $$
  select ('80808080-0000-4000-8000-' || lpad(p_n::text,12,'0'))::uuid;
$$;

insert into industry(id,name) values(pg_temp.matching_id(1),'Matching Test Industry');
insert into region(id,name) values(pg_temp.matching_id(2),'Matching Test Region');
insert into proficiency(id,name,rank) values(pg_temp.matching_id(3),'Matching Junior',1),(pg_temp.matching_id(4),'Matching Senior',2);
insert into trade_role(id,industry_id,name) values(pg_temp.matching_id(5),pg_temp.matching_id(1),'Matching Test Trade');
insert into trade_role_proficiency(trade_role_id,proficiency_id)
values(pg_temp.matching_id(5),pg_temp.matching_id(3)),(pg_temp.matching_id(5),pg_temp.matching_id(4));
insert into qualification(id,name) values(pg_temp.matching_id(6),'Matching Worker Ticket'),(pg_temp.matching_id(7),'Matching Company Licence');
insert into company(id,legal_name,contact_email,status) values
 (pg_temp.matching_id(10),'Matching Supplier','matching-supplier@example.test','Active'),
 (pg_temp.matching_id(11),'Matching Buyer','matching-buyer@example.test','Active');
insert into worker(id,first_name,last_name,mobile,email,primary_trade_id,primary_proficiency_id,status,consent_confirmed_at)
select pg_temp.matching_id(n),'Worker',n::text,'04123400'||n,n||'@matching.example.test',
  pg_temp.matching_id(5),pg_temp.matching_id(case when n=23 then 4 else 3 end),'Active',now()
from generate_series(20,23) n;
insert into worker_employment(worker_id,company_id,start_date)
select pg_temp.matching_id(n),pg_temp.matching_id(10),'2026-01-01' from generate_series(20,23) n;
insert into capacity_listing(id,company_id,created_by) values(pg_temp.matching_id(30),pg_temp.matching_id(10),'matching_supplier');
insert into capacity_line(id,listing_id,company_id,trade_role_id,proficiency_id,available_from,available_until,
 hours_per_week,location_region_id,supplier_rate_cents,rate_entered_by,status) values
 (pg_temp.matching_id(31),pg_temp.matching_id(30),pg_temp.matching_id(10),pg_temp.matching_id(5),pg_temp.matching_id(3),
  '2026-09-01','2026-09-28',40,pg_temp.matching_id(2),5000,'matching_supplier','Open'),
 (pg_temp.matching_id(32),pg_temp.matching_id(30),pg_temp.matching_id(10),pg_temp.matching_id(5),pg_temp.matching_id(4),
  '2026-09-01','2026-09-28',40,pg_temp.matching_id(2),6000,'matching_supplier','Open');
insert into capacity_line_worker(capacity_line_id,worker_id)
select pg_temp.matching_id(case when n=23 then 32 else 31 end),pg_temp.matching_id(n) from generate_series(20,23) n;
insert into demand_request(id,company_id,name,industry_id,work_region_id,created_by)
values(pg_temp.matching_id(40),pg_temp.matching_id(11),'Matching Project',pg_temp.matching_id(1),pg_temp.matching_id(2),'matching_buyer');
insert into demand_line(id,request_id,company_id,trade_role_id,proficiency_id,quantity,start_date,end_date,hours_per_week,status)
select pg_temp.matching_id(n),pg_temp.matching_id(40),pg_temp.matching_id(11),pg_temp.matching_id(5),pg_temp.matching_id(3),
 4,'2026-09-01','2026-09-28',40,'Open' from generate_series(41,42) n;
insert into platform_config(key,value_int) values('fee_bp',2000),('minimum_crew_size',1),('minimum_hours_per_line',8)
on conflict(key) do update set value_int=excluded.value_int;

create function pg_temp.matching_propose(p_workers integer[], p_capacity integer default 31,
 p_demand integer default 41,p_higher boolean default false,p_override boolean default false)
returns uuid language plpgsql as $$
declare v_result jsonb;
begin
  v_result:=propose_matches_atomic(pg_temp.matching_id(p_demand),
    (select jsonb_agg(jsonb_build_object('capacity_line_id',pg_temp.matching_id(p_capacity),'worker_id',pg_temp.matching_id(n)))
      from unnest(p_workers) n),p_higher,p_override,case when p_override then 'Maintain reviewed the exception' end,
      'matching_maintain','2026-08-31');
  return (v_result->'matches'->0->>'match_id')::uuid;
end;
$$;
create function pg_temp.matching_supplier(p_match uuid,p_workers integer[])
returns jsonb language sql as $$
 select accept_match_as_supplier(p_match,'Awaiting Supplier',array(select pg_temp.matching_id(n) from unnest(p_workers) n),
   pg_temp.matching_id(10),'matching_supplier',false,null,'2026-08-31');
$$;
create function pg_temp.matching_buyer(p_match uuid,p_count integer default 1,p_version integer default 1)
returns jsonb language sql as $$
 select accept_match_as_buyer(p_match,'Awaiting Buyer',p_count,p_version,
   pg_temp.matching_id(11),'matching_buyer',false,null,'2026-08-31');
$$;

-- Privilege isolation is tested against the real function grants, not source strings.
do $$
declare v_fn record; v_count integer:=0;
begin
 for v_fn in select p.oid,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in ('propose_matches_atomic','accept_match_as_supplier',
 'substitute_match_nominations','accept_match_as_buyer','decline_match_atomic','withdraw_match_atomic',
 'expire_match_atomic','knock_out_match_nomination_atomic','record_match_qualification_override') loop
   v_count:=v_count+1;
   perform pg_temp.matching_assert(has_function_privilege('service_role',v_fn.oid,'EXECUTE'),v_fn.proname||' service grant');
   perform pg_temp.matching_assert(not has_function_privilege('authenticated',v_fn.oid,'EXECUTE'),v_fn.proname||' tenant denied');
   perform pg_temp.matching_assert(not has_function_privilege('anon',v_fn.oid,'EXECUTE'),v_fn.proname||' anonymous denied');
 end loop;
 perform pg_temp.matching_assert(v_count=9,'all nine public matching mutation RPCs exist');
end;
$$;

savepoint matching_case;
do $$
declare v_candidates jsonb;
begin
 v_candidates:=jsonb_build_array(
   jsonb_build_object('capacity_line_id',pg_temp.matching_id(31),'worker_id',pg_temp.matching_id(20)),
   jsonb_build_object('capacity_line_id',pg_temp.matching_id(32),'worker_id',pg_temp.matching_id(20)));
 perform pg_temp.matching_expect_error(format(
   'select propose_matches_atomic(%L,%L::jsonb,true,false,null,%L,%L::date)',
   pg_temp.matching_id(41),v_candidates,'matching_maintain','2026-08-31'),'23514');
 perform pg_temp.matching_assert(not exists(select 1 from match),'invalid multi-line shortlist leaves no partial proposal');
 perform pg_temp.matching_assert(not exists(select 1 from audit_event where entity_type='match'),'invalid shortlist leaves no audit fragment');
 update demand_line set quantity=1 where id=pg_temp.matching_id(41);
 perform pg_temp.matching_propose(array[20]);
 perform pg_temp.matching_expect_error('select pg_temp.matching_propose(array[21])','40001');
 perform pg_temp.matching_assert((select count(*)=1 from match),'locked pending budget prevents over-proposal');
end;
$$;
rollback to matching_case;

savepoint matching_case;
do $$
declare v_match uuid;
begin
 v_match:=pg_temp.matching_propose(array[23],32,41,true);
 perform pg_temp.matching_supplier(v_match,array[23]);
 perform pg_temp.matching_assert((select status='Awaiting Buyer' from match where id=v_match),'higher proficiency nominee accepted');
 perform pg_temp.matching_expect_error(format('select pg_temp.matching_supplier(%L,array[23])',v_match),'40001');
 perform pg_temp.matching_assert((select count(*)=1 from match_worker where match_id=v_match),'supplier double-click cannot duplicate nominations');
end;
$$;
rollback to matching_case;

savepoint matching_case;
do $$
declare v_match uuid; v_accepted jsonb; v_engagement uuid;
begin
 v_match:=pg_temp.matching_propose(array[20]);
 perform pg_temp.matching_expect_error(format('select pg_temp.matching_supplier(%L,array[20,21])',v_match),'23514');
 perform pg_temp.matching_assert(not exists(select 1 from match_worker where match_id=v_match),'quantity failure writes no nominations');
 perform pg_temp.matching_supplier(v_match,array[20]);
 perform substitute_match_nominations(v_match,'Awaiting Buyer',1,array[pg_temp.matching_id(21)],pg_temp.matching_id(10),'matching_supplier','2026-08-31');
 perform pg_temp.matching_expect_error(format('select pg_temp.matching_buyer(%L,1,1)',v_match),'40001');
 -- A later fee edit cannot move the accepted rate or any estimate.
 update platform_config set value_int=3000 where key='fee_bp';
 v_accepted:=pg_temp.matching_buyer(v_match,1,2);
 v_engagement:=(v_accepted->>'engagement_id')::uuid;
 perform pg_temp.matching_assert(v_accepted->>'accepted'='true','buyer creates canonical engagement');
 perform pg_temp.matching_assert((select status='Awaiting Commercial' and payment_status='none'
   and commercial_confirmed_at is null and fee_bp=2000 and expected_hours=160 and estimated_buyer_value_cents=960000
   from engagement where id=v_engagement),'initial lifecycle state and frozen estimates');
 perform pg_temp.matching_assert((select worker_id=pg_temp.matching_id(21) and status='Awaiting Commercial'
   and committed_window=daterange('2026-09-01','2026-09-28','[]') from engagement_worker where engagement_id=v_engagement),
   'exact replacement worker/window copied');
 perform pg_temp.matching_expect_error(format('select pg_temp.matching_buyer(%L,1,2)',v_match),'40001');
 perform pg_temp.matching_assert((select count(*)=1 from engagement where match_id=v_match),'buyer double-click cannot duplicate engagement');
end;
$$;
set constraints all immediate;
set constraints all deferred;
rollback to matching_case;

-- Inject failure after engagement insertion to prove the entire buyer transaction rolls back.
savepoint matching_case;
create function pg_temp.matching_fail_final_audit() returns trigger language plpgsql as $$
begin
 if new.action='engagement.created' then raise exception 'injected audit failure' using errcode='23514'; end if;
 return new;
end;
$$;
create trigger matching_fail_final_audit before insert on audit_event for each row execute function pg_temp.matching_fail_final_audit();
do $$
declare v_match uuid;
begin
 v_match:=pg_temp.matching_propose(array[20]);
 perform pg_temp.matching_supplier(v_match,array[20]);
 perform pg_temp.matching_expect_error(format('select pg_temp.matching_buyer(%L)',v_match),'23514');
 perform pg_temp.matching_assert((select status='Awaiting Buyer' from match where id=v_match),'audit failure rolls back Accepted');
 perform pg_temp.matching_assert(not exists(select 1 from engagement where match_id=v_match),'audit failure rolls back engagement');
 perform pg_temp.matching_assert(not exists(select 1 from engagement_worker),'audit failure rolls back worker commitments');
end;
$$;
rollback to matching_case;

savepoint matching_case;
do $$
declare v_first uuid; v_other uuid; v_result jsonb;
begin
 v_first:=pg_temp.matching_propose(array[20]);
 perform pg_temp.matching_supplier(v_first,array[20]);
 perform pg_temp.matching_expect_error('select pg_temp.matching_propose(array[20],31,42,false,false)','23514');
 v_other:=pg_temp.matching_propose(array[20],31,42,false,true);
 perform pg_temp.matching_supplier(v_other,array[20]);
 v_result:=pg_temp.matching_buyer(v_first);
 perform pg_temp.matching_assert(jsonb_array_length(v_result->'competing_matches')=1,'competing knockout returned for delivery');
 perform pg_temp.matching_assert((select status='Declined' from match where id=v_other),'competing match auto-declined');
 perform pg_temp.matching_assert(not exists(select 1 from match_worker where match_id=v_other and not knocked_out),'competing holds released');
 perform pg_temp.matching_assert((select count(*)=1 from audit_event where entity_id=v_other::text and action='match.auto_declined'),'single competing auto-decline audit');
end;
$$;
set constraints all immediate;
set constraints all deferred;
rollback to matching_case;

savepoint matching_case;
do $$
declare v_match uuid; v_first jsonb; v_again jsonb; v_final jsonb;
begin
 v_match:=pg_temp.matching_propose(array[20,21]);
 perform pg_temp.matching_supplier(v_match,array[20,21]);
 v_first:=knock_out_match_nomination_atomic(v_match,pg_temp.matching_id(20),'qualification expired',null,true);
 v_again:=knock_out_match_nomination_atomic(v_match,pg_temp.matching_id(20),'qualification expired',null,true);
 perform pg_temp.matching_assert(v_first->>'changed'='true' and v_first->>'status_after'='Awaiting Buyer'
   and v_first->>'remaining_count'='1','above-floor knockout returns buyer re-presentation');
 perform pg_temp.matching_assert(v_again->>'changed'='false','duplicate knockout is no-op');
 v_final:=knock_out_match_nomination_atomic(v_match,pg_temp.matching_id(21),'qualification expired',null,true);
 perform pg_temp.matching_assert(v_final->>'status_after'='Declined','last nomination auto-declines');
 perform pg_temp.matching_assert((select count(*)=2 from audit_event where entity_id=v_match::text and action='match.nomination_knocked_out'),
   'exact knockout audit cardinality');
end;
$$;
rollback to matching_case;

savepoint matching_case;
do $$
declare v_match uuid; v_result jsonb;
begin
 v_match:=pg_temp.matching_propose(array[20]);
 perform pg_temp.matching_supplier(v_match,array[20]);
 update worker set status='Inactive' where id=pg_temp.matching_id(20);
 v_result:=pg_temp.matching_buyer(v_match);
 perform pg_temp.matching_assert(v_result->>'accepted'='false' and v_result->>'declined'='true','buyer rechecks eligibility');
 perform pg_temp.matching_assert(not exists(select 1 from engagement where match_id=v_match),'ineligible crew cannot create engagement');
end;
$$;
rollback to matching_case;

savepoint matching_case;
do $$
declare v_match uuid; v_result jsonb;
begin
 v_match:=pg_temp.matching_propose(array[20]);
 perform pg_temp.matching_expect_error(format('select decline_match_atomic(%L,%L,%L,%L,%L,false,null,null)',
   v_match,'Awaiting Supplier','supplier',pg_temp.matching_id(11),'matching_buyer'),'42501');
 v_result:=decline_match_atomic(v_match,'Awaiting Supplier','supplier',pg_temp.matching_id(10),'matching_supplier',false,null,'unavailable');
 perform pg_temp.matching_assert(v_result->>'status_after'='Declined','supplier decline committed');
 perform pg_temp.matching_expect_error(format('select withdraw_match_atomic(%L,%L,%L,null)',v_match,'Awaiting Supplier','matching_maintain'),'40001');
 v_match:=pg_temp.matching_propose(array[21]);
 perform pg_temp.matching_assert(expire_match_atomic(v_match,'2026-08-31')->>'changed'='false','new match is not expired');
 update match set proposed_at='2026-08-24T00:00:00+10' where id=v_match;
 perform pg_temp.matching_assert(expire_match_atomic(v_match,'2026-08-31')->>'status_after'='Expired','seven Brisbane calendar days expire');
 perform pg_temp.matching_assert(expire_match_atomic(v_match,'2026-08-31')->>'changed'='false','expiry retry is no-op');
end;
$$;
rollback to matching_case;

savepoint matching_case;
do $$
declare v_match uuid;
begin
 insert into trade_role_qualification(trade_role_id,qualification_id,is_mandatory,level) values
   (pg_temp.matching_id(5),pg_temp.matching_id(6),true,'worker'),
   (pg_temp.matching_id(5),pg_temp.matching_id(7),true,'company');
 insert into demand_line_qualification(demand_line_id,qualification_id) values(pg_temp.matching_id(41),pg_temp.matching_id(6));
 insert into worker_qualification(worker_id,qualification_id,status,expiry_date) values
   (pg_temp.matching_id(20),pg_temp.matching_id(6),'Expired','2026-07-01'),
   (pg_temp.matching_id(20),pg_temp.matching_id(6),'Expiring Soon','2026-09-10'),
   (pg_temp.matching_id(20),pg_temp.matching_id(6),'Current','2027-09-01');
 insert into company_document(company_id,qualification_id,doc_type,status,expiry_date) values
   (pg_temp.matching_id(10),null,'public_liability','Expired','2026-07-01'),
   (pg_temp.matching_id(10),null,'public_liability','Current','2027-07-01'),
   (pg_temp.matching_id(10),pg_temp.matching_id(7),'trade_licence','Expired','2026-07-01'),
   (pg_temp.matching_id(10),pg_temp.matching_id(7),'trade_licence','Current','2027-07-01');
 perform pg_temp.matching_assert(company_is_match_compliant(pg_temp.matching_id(10),'2026-08-31'),'company renewal supersedes expired history');
 perform pg_temp.matching_assert(proposal_candidate_failure(pg_temp.matching_id(41),pg_temp.matching_id(31),pg_temp.matching_id(20),false,false,'2026-08-31') is null,
   'current worker renewal removes old expiry and in-window warning');
 v_match:=pg_temp.matching_propose(array[20]);
 perform pg_temp.matching_supplier(v_match,array[20]);
 perform pg_temp.matching_buyer(v_match);
end;
$$;
set constraints all immediate;
set constraints all deferred;
rollback to matching_case;

-- A previously audited in-window expiry never waives validity on the decision day.
savepoint matching_case;
do $$
declare v_match uuid; v_result jsonb;
begin
 insert into demand_line_qualification(demand_line_id,qualification_id)
 values(pg_temp.matching_id(41),pg_temp.matching_id(6));
 insert into worker_qualification(worker_id,qualification_id,status,expiry_date)
 values(pg_temp.matching_id(20),pg_temp.matching_id(6),'Current','2026-09-05');
 v_match:=pg_temp.matching_propose(array[20],31,41,false,true);
 perform pg_temp.matching_supplier(v_match,array[20]);
 perform pg_temp.matching_assert(match_nomination_failure(v_match,pg_temp.matching_id(20),'2026-09-06') is not null,
   'a stale Current status and old override cannot permit an actually expired required ticket');
 perform pg_temp.matching_assert(proposal_candidate_failure(pg_temp.matching_id(41),pg_temp.matching_id(31),
   pg_temp.matching_id(20),false,true,'2026-09-06') is not null,'proposal also enforces the actual decision date');
 v_result:=accept_match_as_buyer(v_match,'Awaiting Buyer',1,1,pg_temp.matching_id(11),
   'matching_buyer',false,null,'2026-09-06');
 perform pg_temp.matching_assert(v_result->>'accepted'='false','expired nonmandatory required ticket blocks buyer commitment');
 perform pg_temp.matching_assert(not exists(select 1 from engagement),'expired ticket creates no commitment');
 insert into worker_qualification(worker_id,qualification_id,status,expiry_date)
 values(pg_temp.matching_id(20),pg_temp.matching_id(6),'Current','2027-09-05');
 perform pg_temp.matching_assert(proposal_candidate_failure(pg_temp.matching_id(41),pg_temp.matching_id(31),
   pg_temp.matching_id(20),false,false,'2026-09-06') is null,'renewal satisfies current-day and full-window checks');
end;
$$;
rollback to matching_case;

-- Proposal classification uses the worker-wide union, even when this one line
-- is completely committed. Actual nominations still reject its hard overlap.
savepoint matching_case;
do $$
declare v_committed uuid; v_next uuid;
begin
 update capacity_line set available_until='2026-09-14' where id=pg_temp.matching_id(31);
 insert into capacity_line(id,listing_id,company_id,trade_role_id,proficiency_id,available_from,available_until,
 hours_per_week,location_region_id,supplier_rate_cents,rate_entered_by,status)
 select pg_temp.matching_id(33),listing_id,company_id,trade_role_id,proficiency_id,'2026-09-15','2026-09-28',
 hours_per_week,location_region_id,supplier_rate_cents,rate_entered_by,'Open'
 from capacity_line where id=pg_temp.matching_id(31);
 insert into capacity_line_worker(capacity_line_id,worker_id) values(pg_temp.matching_id(33),pg_temp.matching_id(20));
 v_committed:=pg_temp.matching_propose(array[20]);
 perform pg_temp.matching_supplier(v_committed,array[20]);
 perform pg_temp.matching_buyer(v_committed);
 perform pg_temp.matching_assert(proposal_candidate_failure(pg_temp.matching_id(42),pg_temp.matching_id(31),
   pg_temp.matching_id(20),false,true,'2026-08-31') is null,'50 percent worker-wide availability permits audited Greyed proposal');
 v_next:=pg_temp.matching_propose(array[20],31,42,false,true);
 perform pg_temp.matching_expect_error(format('select pg_temp.matching_supplier(%L,array[20])',v_next),'23514');
 update capacity_line set status='Withdrawn' where id=pg_temp.matching_id(33);
 perform pg_temp.matching_assert(proposal_candidate_failure(pg_temp.matching_id(42),pg_temp.matching_id(31),
   pg_temp.matching_id(20),false,true,'2026-08-31') is not null,'zero percent availability remains excluded');
end;
$$;
rollback to matching_case;

savepoint matching_case;
do $$
declare v_match uuid;
begin
 v_match:=pg_temp.matching_propose(array[20]);
 insert into capacity_listing(id,company_id,created_by)
 values(pg_temp.matching_id(60),pg_temp.matching_id(11),'matching_buyer');
 insert into demand_request(id,company_id,name,industry_id,work_region_id,created_by)
 values(pg_temp.matching_id(61),pg_temp.matching_id(10),'Moved source',pg_temp.matching_id(1),pg_temp.matching_id(2),'matching_supplier');
 update capacity_line set company_id=pg_temp.matching_id(11),listing_id=pg_temp.matching_id(60) where id=pg_temp.matching_id(31);
 perform pg_temp.matching_assert(match_nomination_failure(v_match,pg_temp.matching_id(20),'2026-08-31') is not null,
   'nomination checks the capacity source still belongs to the locked supplier');
 update capacity_line set company_id=pg_temp.matching_id(10),listing_id=pg_temp.matching_id(30) where id=pg_temp.matching_id(31);
 update demand_line set company_id=pg_temp.matching_id(10),request_id=pg_temp.matching_id(61) where id=pg_temp.matching_id(41);
 perform pg_temp.matching_assert(match_nomination_failure(v_match,pg_temp.matching_id(20),'2026-08-31') is not null,
   'nomination checks the demand source still belongs to the locked buyer');
 update demand_line set company_id=pg_temp.matching_id(11),request_id=pg_temp.matching_id(40) where id=pg_temp.matching_id(41);
 update capacity_line set available_until='2026-09-14' where id=pg_temp.matching_id(31);
 perform pg_temp.matching_assert(match_nomination_failure(v_match,pg_temp.matching_id(20),'2026-08-31') is not null,
   'nomination cannot commit dates no longer offered by its source capacity');
end;
$$;
rollback to matching_case;

do $$
begin
 perform lock_match_companies(array[pg_temp.matching_id(11),pg_temp.matching_id(10),pg_temp.matching_id(10)]);
 perform lock_match_companies(array[]::uuid[]);
 perform pg_temp.matching_expect_error('select lock_match_companies(null)','22004');
 perform pg_temp.matching_expect_error('select lock_match_companies(array[null]::uuid[])','22004');
 perform pg_temp.matching_expect_error('select lock_match_companies(array[pg_temp.matching_id(999)])','23503');
 perform pg_temp.matching_assert(not has_function_privilege('authenticated','lock_match_companies(uuid[])','EXECUTE'),
   'company locking is not a tenant RPC');
end;
$$;

rollback;
