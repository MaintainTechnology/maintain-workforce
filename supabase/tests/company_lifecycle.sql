-- Isolated PostgreSQL regressions. All fixtures and injected failures roll back.
begin;
create function pg_temp.company_id(p_n integer) returns uuid language sql immutable as $$
  select ('13131313-0000-4000-8000-' || lpad(p_n::text,12,'0'))::uuid;
$$;
create function pg_temp.company_assert(p_ok boolean,p_message text) returns void language plpgsql as $$
begin
  if p_ok is distinct from true then raise exception 'company lifecycle test: %',p_message; end if;
end;
$$;
create function pg_temp.company_expect_error(p_sql text,p_state text) returns void language plpgsql as $$
begin
  begin execute p_sql;
  exception when others then if sqlstate=p_state then return; end if; raise; end;
  raise exception 'company lifecycle test: expected SQLSTATE %',p_state;
end;
$$;

do $$
declare v_fn record; v_count integer:=0;
begin
  for v_fn in select p.oid,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in ('company_verification_checklist',
    'verify_company_document_atomic','transition_company_status_atomic','reject_company_verification_atomic') loop
    v_count:=v_count+1;
    perform pg_temp.company_assert(has_function_privilege('service_role',v_fn.oid,'EXECUTE'),v_fn.proname||' service grant');
    perform pg_temp.company_assert(not has_function_privilege('authenticated',v_fn.oid,'EXECUTE'),v_fn.proname||' tenant denied');
    perform pg_temp.company_assert(not has_function_privilege('anon',v_fn.oid,'EXECUTE'),v_fn.proname||' anon denied');
  end loop;
  perform pg_temp.company_assert(v_count=4,'all four checked company RPCs must exist');
  perform pg_temp.company_assert(exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='verify_company_document_atomic'
      and 'p_expected_abn'=any(p.proargnames)), 'ABN verification must accept the value the admin reviewed');
end;
$$;

insert into industry(id,name) values(pg_temp.company_id(1),'Company Test Industry');
insert into region(id,name) values(pg_temp.company_id(2),'Company Test Region');
insert into proficiency(id,name,rank) values(pg_temp.company_id(3),'Company Test Proficiency',1);
insert into trade_role(id,industry_id,name) values(pg_temp.company_id(4),pg_temp.company_id(1),'Company Test Trade');
insert into trade_role_proficiency values(pg_temp.company_id(4),pg_temp.company_id(3));
insert into qualification(id,name) values(pg_temp.company_id(5),'Company Test Licence'),(pg_temp.company_id(6),'Different Test Licence');
insert into company(id,legal_name,contact_email,status,abn) values
 (pg_temp.company_id(10),'Company Test Supplier','company-supplier@example.test','Pending',null),
 (pg_temp.company_id(11),'Company Test Buyer','company-buyer@example.test','Active',null),
 (pg_temp.company_id(12),'Company Test Closed','company-closed@example.test','Closed',null),
 (pg_temp.company_id(13),'Company Test Suspended','company-suspended@example.test','Suspended',null),
 (pg_temp.company_id(14),'Company Test Supplied ABN','company-abn@example.test','Pending','51824753556');
insert into company_document(id,company_id,doc_type,file_path,expiry_date) values
 (pg_temp.company_id(20),pg_temp.company_id(10),'public_liability','company-test/liability.pdf',(now() at time zone 'Australia/Brisbane')::date+30),
 (pg_temp.company_id(21),pg_temp.company_id(10),'workers_comp','company-test/workers.pdf',(now() at time zone 'Australia/Brisbane')::date+30),
 (pg_temp.company_id(22),pg_temp.company_id(14),'public_liability','company-test/abn-liability.pdf',null),
 (pg_temp.company_id(23),pg_temp.company_id(14),'workers_comp','company-test/abn-workers.pdf',null),
 (pg_temp.company_id(24),pg_temp.company_id(10),'trade_licence','company-test/trade.pdf',(now() at time zone 'Australia/Brisbane')::date+30);

create function pg_temp.company_verify_ready(p_company integer default 10) returns void language plpgsql as $$
declare v_doc record;
begin
  for v_doc in select * from company_document where company_id=pg_temp.company_id(p_company)
    and doc_type in ('public_liability','workers_comp') loop
    perform verify_company_document_atomic(v_doc.company_id,v_doc.id,v_doc.doc_type,'Pending','maintain_test',null);
  end loop;
  perform verify_company_document_atomic(pg_temp.company_id(p_company),null,'payment_details','Pending','maintain_test',null);
end;
$$;

savepoint company_case;
do $$
begin
  perform pg_temp.company_expect_error('select transition_company_status_atomic(pg_temp.company_id(10),''Pending'',''Active'',''maintain_test'')','23514');
  perform pg_temp.company_assert((select status='Pending' from company where id=pg_temp.company_id(10)),'incomplete checklist stays Pending');
  perform pg_temp.company_assert(not exists(select 1 from audit_event where entity_id=pg_temp.company_id(10)::text),'incomplete checklist has no success audit');
  perform pg_temp.company_verify_ready();
  perform transition_company_status_atomic(pg_temp.company_id(10),'Pending','Active','maintain_test');
  perform pg_temp.company_assert((select status='Active' and abn is null from company where id=pg_temp.company_id(10)),'omitted ABN does not block activation');
  perform pg_temp.company_assert(not exists(select 1 from company_document where company_id=pg_temp.company_id(10) and doc_type in ('abn_verified','lh_licence')),'optional fields do not manufacture flags');
  perform pg_temp.company_assert((select count(*)=1 from audit_event where entity_id=pg_temp.company_id(10)::text and action='company.status_changed' and actor_user_id='maintain_test' and not actor_is_system),'activation has one human audit');
  perform pg_temp.company_expect_error('select transition_company_status_atomic(pg_temp.company_id(10),''Pending'',''Active'',''maintain_test'')','40001');
end;
$$;
rollback to company_case;

savepoint company_case;
create function pg_temp.company_fail_document_audit() returns trigger language plpgsql as $$
begin
  if new.action='company_document.verified' then raise exception 'injected document audit failure' using errcode='23514'; end if;
  return new;
end;
$$;
create trigger company_fail_document_audit before insert on audit_event for each row execute function pg_temp.company_fail_document_audit();
do $$
begin
  perform pg_temp.company_expect_error('select verify_company_document_atomic(pg_temp.company_id(10),pg_temp.company_id(20),''public_liability'',''Pending'',''maintain_test'',null)','23514');
  perform pg_temp.company_expect_error('select verify_company_document_atomic(pg_temp.company_id(10),null,''payment_details'',''Pending'',''maintain_test'',null)','23514');
  perform pg_temp.company_assert((select verified_at is null and verified_by is null from company_document where id=pg_temp.company_id(20)),'audit failure rolls back document verification');
  perform pg_temp.company_assert(not exists(select 1 from company_document where company_id=pg_temp.company_id(10) and doc_type='payment_details'),'audit failure rolls back reference flag creation');
end;
$$;
rollback to company_case;

savepoint company_case;
do $$
begin
  perform pg_temp.company_verify_ready();
  update company_document set expiry_date=(now() at time zone 'Australia/Brisbane')::date-1 where id=pg_temp.company_id(20);
  perform pg_temp.company_expect_error('select transition_company_status_atomic(pg_temp.company_id(10),''Pending'',''Active'',''maintain_test'')','23514');
  -- Expiry is inclusive: today's final day is still current, irrespective of a stale daily status.
  update company_document set expiry_date=(now() at time zone 'Australia/Brisbane')::date,status='Expired' where id=pg_temp.company_id(20);
  perform transition_company_status_atomic(pg_temp.company_id(10),'Pending','Active','maintain_test');
  perform pg_temp.company_assert((select status='Active' from company where id=pg_temp.company_id(10)),'inclusive expiry comes from the date, not stale status');
end;
$$;
rollback to company_case;

savepoint company_case;
do $$
begin
  perform pg_temp.company_verify_ready(14);
  perform pg_temp.company_expect_error('select transition_company_status_atomic(pg_temp.company_id(14),''Pending'',''Active'',''maintain_test'')','23514');
  perform verify_company_document_atomic(pg_temp.company_id(14),null,'abn_verified','Pending','maintain_test',null,'51824753556');
  perform pg_temp.company_assert((select number='51824753556' from company_document where company_id=pg_temp.company_id(14) and doc_type='abn_verified'),'ABN verification records the value checked');
  update company set abn='53004085616' where id=pg_temp.company_id(14);
  perform pg_temp.company_expect_error('select transition_company_status_atomic(pg_temp.company_id(14),''Pending'',''Active'',''maintain_test'')','23514');
  perform pg_temp.company_expect_error('select verify_company_document_atomic(pg_temp.company_id(14),null,''abn_verified'',''Pending'',''maintain_test'',null,''51824753556'')','40001');
  perform pg_temp.company_assert((select number='51824753556' from company_document where company_id=pg_temp.company_id(14) and doc_type='abn_verified'),'stale ABN form cannot overwrite the verified value');
  perform pg_temp.company_assert((select count(*)=1 from audit_event where action='company_document.verified' and after_data->>'doc_type'='abn_verified'),'stale ABN form writes no success audit');
  perform pg_temp.company_expect_error('select verify_company_document_atomic(pg_temp.company_id(14),null,''abn_verified'',''Pending'',''maintain_test'',null)','40001');
  perform verify_company_document_atomic(pg_temp.company_id(14),null,'abn_verified','Pending','maintain_test',null,'53004085616');
  perform transition_company_status_atomic(pg_temp.company_id(14),'Pending','Active','maintain_test');
  perform pg_temp.company_assert((select status='Active' from company where id=pg_temp.company_id(14)),'supplied ABN activates only after current-value verification');
end;
$$;
rollback to company_case;

savepoint company_case;
do $$
begin
  perform pg_temp.company_verify_ready(14);
  -- The displayed ABN changes through an ordinary same-status profile update before
  -- the first verification submit. Nothing may mark the unseen new ABN verified.
  update company set abn='53004085616' where id=pg_temp.company_id(14);
  perform pg_temp.company_expect_error('select verify_company_document_atomic(pg_temp.company_id(14),null,''abn_verified'',''Pending'',''maintain_test'',null,''51824753556'')','40001');
  perform pg_temp.company_assert(not exists(select 1 from company_document where company_id=pg_temp.company_id(14) and doc_type='abn_verified'),'stale ABN form cannot create a verified flag');
  perform pg_temp.company_assert(not exists(select 1 from audit_event where action='company_document.verified' and after_data->>'doc_type'='abn_verified'),'stale ABN creation has no success audit');
  perform pg_temp.company_expect_error('select transition_company_status_atomic(pg_temp.company_id(14),''Pending'',''Active'',''maintain_test'')','23514');
  update company set abn=null where id=pg_temp.company_id(14);
  perform pg_temp.company_expect_error('select verify_company_document_atomic(pg_temp.company_id(14),null,''abn_verified'',''Pending'',''maintain_test'',null,''51824753556'')','40001');
  perform transition_company_status_atomic(pg_temp.company_id(14),'Pending','Active','maintain_test');
  perform pg_temp.company_assert((select status='Active' and abn is null from company where id=pg_temp.company_id(14)),'removing an optional ABN still permits activation without a flag');
end;
$$;
rollback to company_case;

savepoint company_case;
do $$
begin
  perform pg_temp.company_expect_error('select verify_company_document_atomic(pg_temp.company_id(10),null,''public_liability'',''Pending'',''maintain_test'',null)','23514');
  perform pg_temp.company_expect_error('select verify_company_document_atomic(pg_temp.company_id(10),pg_temp.company_id(22),''public_liability'',''Pending'',''maintain_test'',null)','23503');
  perform pg_temp.company_expect_error('select verify_company_document_atomic(pg_temp.company_id(10),pg_temp.company_id(999),''public_liability'',''Pending'',''maintain_test'',null)','23503');
  perform pg_temp.company_expect_error('select verify_company_document_atomic(pg_temp.company_id(10),pg_temp.company_id(20),''workers_comp'',''Pending'',''maintain_test'',null)','23514');
  perform pg_temp.company_expect_error('select verify_company_document_atomic(pg_temp.company_id(10),pg_temp.company_id(20),''public_liability'',''Pending'','' '',null)','42501');
  perform pg_temp.company_expect_error('select verify_company_document_atomic(pg_temp.company_id(10),pg_temp.company_id(20),''public_liability'',''Active'',''maintain_test'',null)','40001');
  update company_document set file_path=null where id=pg_temp.company_id(20);
  perform pg_temp.company_expect_error('select verify_company_document_atomic(pg_temp.company_id(10),pg_temp.company_id(20),''public_liability'',''Pending'',''maintain_test'',null)','23514');
  update company_document set file_path='company-test/liability.pdf',expiry_date=(now() at time zone 'Australia/Brisbane')::date-1 where id=pg_temp.company_id(20);
  perform pg_temp.company_expect_error('select verify_company_document_atomic(pg_temp.company_id(10),pg_temp.company_id(20),''public_liability'',''Pending'',''maintain_test'',null)','23514');
  perform pg_temp.company_assert(not exists(select 1 from company_document where verified_at is not null),'invalid verification never updates a document');
  perform pg_temp.company_assert(not exists(select 1 from audit_event where entity_type='company_document'),'invalid verification never audits success');
end;
$$;
rollback to company_case;

savepoint company_case;
do $$
begin
  perform pg_temp.company_expect_error('select transition_company_status_atomic(pg_temp.company_id(12),''Closed'',''Active'',''maintain_test'')','23514');
  perform pg_temp.company_expect_error('select transition_company_status_atomic(pg_temp.company_id(11),''Active'',''Pending'',''maintain_test'')','23514');
  perform pg_temp.company_expect_error('select transition_company_status_atomic(pg_temp.company_id(13),''Suspended'',''Pending'',''maintain_test'')','23514');
  perform pg_temp.company_expect_error('select transition_company_status_atomic(pg_temp.company_id(10),''Pending'',''Suspended'',''maintain_test'')','23514');
  perform pg_temp.company_expect_error('select transition_company_status_atomic(pg_temp.company_id(11),''Active'',''Active'',''maintain_test'')','23514');
  perform pg_temp.company_expect_error('select transition_company_status_atomic(pg_temp.company_id(11),''Active'',''Closed'',null)','42501');
  perform transition_company_status_atomic(pg_temp.company_id(11),'Active','Suspended','maintain_test');
  perform transition_company_status_atomic(pg_temp.company_id(11),'Suspended','Active','maintain_test');
  perform transition_company_status_atomic(pg_temp.company_id(10),'Pending','Closed','maintain_test');
  perform transition_company_status_atomic(pg_temp.company_id(13),'Suspended','Closed','maintain_test');
  perform pg_temp.company_expect_error('select transition_company_status_atomic(pg_temp.company_id(10),''Closed'',''Pending'',''maintain_test'')','23514');
end;
$$;
rollback to company_case;

savepoint company_case;
do $$
begin
  perform reject_company_verification_atomic(pg_temp.company_id(10),'Pending','Updated insurance required','maintain_test');
  perform pg_temp.company_assert((select status='Pending' from company where id=pg_temp.company_id(10)),'rejection leaves Pending');
  perform pg_temp.company_assert((select after_data->>'reason'='Updated insurance required' from audit_event where entity_id=pg_temp.company_id(10)::text),'rejection reason is atomic evidence');
  perform pg_temp.company_expect_error('select reject_company_verification_atomic(pg_temp.company_id(11),''Active'',''Updated insurance required'',''maintain_test'')','23514');
  perform pg_temp.company_expect_error('select reject_company_verification_atomic(pg_temp.company_id(11),''Pending'',''Updated insurance required'',''maintain_test'')','40001');
  perform pg_temp.company_expect_error('select reject_company_verification_atomic(pg_temp.company_id(10),''Pending'','' '',''maintain_test'')','23514');
end;
$$;
rollback to company_case;

insert into worker(id,first_name,last_name,mobile,email,primary_trade_id,primary_proficiency_id,consent_confirmed_at)
select pg_temp.company_id(n),'Company Test',n::text,'04003100'||n,n||'@company-test.example.test',pg_temp.company_id(4),pg_temp.company_id(3),now()
from generate_series(30,32) n;
insert into worker_employment(worker_id,company_id,start_date)
select pg_temp.company_id(n),pg_temp.company_id(10),(now() at time zone 'Australia/Brisbane')::date-30 from generate_series(30,32) n;

savepoint company_case;
do $$
begin
  insert into trade_role_qualification values(pg_temp.company_id(4),pg_temp.company_id(5),true,'company');
  perform pg_temp.company_verify_ready();
  perform pg_temp.company_expect_error('select transition_company_status_atomic(pg_temp.company_id(10),''Pending'',''Active'',''maintain_test'')','23514');
  perform pg_temp.company_expect_error('select verify_company_document_atomic(pg_temp.company_id(10),pg_temp.company_id(24),''trade_licence'',''Pending'',''maintain_test'',pg_temp.company_id(6))','23514');
  perform verify_company_document_atomic(pg_temp.company_id(10),pg_temp.company_id(24),'trade_licence','Pending','maintain_test',pg_temp.company_id(5));
  perform pg_temp.company_assert((select qualification_id=pg_temp.company_id(5) from company_document where id=pg_temp.company_id(24)),'verification attaches the catalogue licence, not a generic flag');
  perform transition_company_status_atomic(pg_temp.company_id(10),'Pending','Active','maintain_test');
end;
$$;
rollback to company_case;

-- Open matches are withdrawn atomically; accepted work remains committing.
insert into capacity_listing(id,company_id,created_by) values(pg_temp.company_id(40),pg_temp.company_id(10),'company_supplier');
insert into capacity_line(id,listing_id,company_id,trade_role_id,proficiency_id,available_from,available_until,hours_per_week,location_region_id,supplier_rate_cents,rate_entered_by,status)
values(pg_temp.company_id(41),pg_temp.company_id(40),pg_temp.company_id(10),pg_temp.company_id(4),pg_temp.company_id(3),
 (now() at time zone 'Australia/Brisbane')::date+1,(now() at time zone 'Australia/Brisbane')::date+14,40,pg_temp.company_id(2),5000,'company_supplier','Open');
insert into capacity_line_worker(capacity_line_id,worker_id) select pg_temp.company_id(41),pg_temp.company_id(n) from generate_series(30,32) n;
insert into demand_request(id,company_id,name,work_region_id,created_by)
values(pg_temp.company_id(50),pg_temp.company_id(11),'Company Test Project',pg_temp.company_id(2),'company_buyer');
insert into demand_line(id,request_id,company_id,trade_role_id,proficiency_id,quantity,start_date,end_date,hours_per_week,status)
values(pg_temp.company_id(51),pg_temp.company_id(50),pg_temp.company_id(11),pg_temp.company_id(4),pg_temp.company_id(3),3,
 (now() at time zone 'Australia/Brisbane')::date+1,(now() at time zone 'Australia/Brisbane')::date+14,40,'Open');
insert into platform_config(key,value_int) values('fee_bp',2000),('minimum_crew_size',1),('minimum_hours_per_line',8)
on conflict(key) do update set value_int=excluded.value_int;

create function pg_temp.company_market() returns void language plpgsql as $$
declare v_match uuid; v_day date:=(now() at time zone 'Australia/Brisbane')::date; v_n integer;
begin
  perform pg_temp.company_verify_ready();
  perform transition_company_status_atomic(pg_temp.company_id(10),'Pending','Active','maintain_test');
  for v_n in 30..32 loop
    v_match:=(propose_matches_atomic(pg_temp.company_id(51),jsonb_build_array(jsonb_build_object(
      'capacity_line_id',pg_temp.company_id(41),'worker_id',pg_temp.company_id(v_n))),false,false,null,'maintain_test',v_day)->'matches'->0->>'match_id')::uuid;
    if v_n>30 then
      perform accept_match_as_supplier(v_match,'Awaiting Supplier',array[pg_temp.company_id(v_n)],pg_temp.company_id(10),'company_supplier',false,null,v_day);
    end if;
    if v_n=32 then
      perform accept_match_as_buyer(v_match,'Awaiting Buyer',1,1,pg_temp.company_id(11),'company_buyer',false,null,v_day);
    end if;
  end loop;
end;
$$;

savepoint company_case;
do $$
declare v_result jsonb;
begin
  perform pg_temp.company_market();
  v_result:=transition_company_status_atomic(pg_temp.company_id(10),'Active','Suspended','maintain_test');
  perform pg_temp.company_assert(jsonb_array_length(v_result->'withdrawn_matches')=2,'both open states returned for notices');
  perform pg_temp.company_assert((select count(*)=2 from match where status='Withdrawn'),'both open states withdrawn');
  perform pg_temp.company_assert(not exists(select 1 from match_worker mw join match m on m.id=mw.match_id where m.status='Withdrawn' and not mw.knocked_out),'soft holds released');
  perform pg_temp.company_assert(not exists(select 1 from match where status='Withdrawn' and nomination_version=0),'presentation versions invalidated');
  perform pg_temp.company_assert((select count(*)=1 from engagement where status='Awaiting Commercial'),'existing commitment not cancelled');
  perform pg_temp.company_assert((select count(*)=1 from engagement_worker where status='Awaiting Commercial'),'worker commitment remains intact');
  perform pg_temp.company_assert((select count(*)=2 from audit_event where action='match.withdrawn' and actor_user_id='maintain_test' and not actor_is_system),'withdrawals audited to human');
end;
$$;
rollback to company_case;

savepoint company_case;
do $$
begin
  perform pg_temp.company_market();
  perform transition_company_status_atomic(pg_temp.company_id(11),'Active','Closed','maintain_test');
  perform pg_temp.company_assert((select count(*)=2 from match where status='Withdrawn'),'buyer closure also withdraws both open states');
  perform pg_temp.company_assert((select count(*)=1 from engagement where status='Awaiting Commercial'),'buyer closure leaves existing work intact');
end;
$$;
rollback to company_case;

savepoint company_case;
select pg_temp.company_market();
create function pg_temp.company_fail_final_audit() returns trigger language plpgsql as $$
begin
  if new.action='company.status_changed' then raise exception 'injected final audit failure' using errcode='23514'; end if;
  return new;
end;
$$;
create trigger company_fail_final_audit before insert on audit_event for each row execute function pg_temp.company_fail_final_audit();
do $$
begin
  perform pg_temp.company_expect_error('select transition_company_status_atomic(pg_temp.company_id(10),''Active'',''Suspended'',''maintain_test'')','23514');
  perform pg_temp.company_assert((select status='Active' from company where id=pg_temp.company_id(10)),'late audit failure rolls back company status');
  perform pg_temp.company_assert((select count(*)=2 from match where status in ('Awaiting Supplier','Awaiting Buyer')),'late audit failure restores open matches');
  perform pg_temp.company_assert(not exists(select 1 from match_worker where knocked_out),'late audit failure restores nominations');
  perform pg_temp.company_assert(not exists(select 1 from audit_event where action='match.withdrawn'),'late audit failure leaves no partial withdrawal audit');
end;
$$;
rollback to company_case;
rollback;
