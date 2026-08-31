-- Worker transfer lifecycle — spec 8, 12.7, 17, 18 and 19.
-- The service-role actions authenticate the human; each RPC owns the complete
-- state transition, employment history, cascade and audit transaction.

do $$
begin
  if exists (
    select worker_id from worker_transfer
    where status in ('Requested', 'Awaiting Current Employer', 'Admin Review', 'Approved')
    group by worker_id having count(*) > 1
  ) then
    raise exception 'duplicate live worker transfers exist; resolve them before this migration'
      using errcode = '23505';
  end if;
end;
$$;

create unique index worker_transfer_one_live
  on worker_transfer (worker_id)
  where status in ('Requested', 'Awaiting Current Employer', 'Admin Review', 'Approved');

-- The requesting side does not acquire even a worker identifier until completion.
-- The former employer retains its own historical transfer, not live profile access.
create or replace view company_transfer_view as
select
  t.id,
  case
    when t.from_company_id = current_company_id() or t.status = 'Completed'
    then t.worker_id
  end as worker_id,
  t.status,
  t.to_company_id,
  case
    when t.from_company_id = current_company_id() or t.status = 'Completed'
    then t.from_company_id
  end as from_company_id,
  t.created_at,
  t.decided_at,
  t.reason
from worker_transfer t
where t.to_company_id = current_company_id() or t.from_company_id = current_company_id();
revoke all on company_transfer_view from public, anon, authenticated;
grant select on company_transfer_view to authenticated;

-- Private snapshot only: outer entrypoints lock this complete set in the shared
-- company order, then retry if a worker's employment/transfer/match parties grow
-- while those locks were being acquired. No new company lock is taken in a cascade.
create or replace function worker_transfer_company_ids(p_worker_ids uuid[], p_company_ids uuid[])
returns uuid[]
language sql stable security definer set search_path = public
as $$
  select coalesce(array_agg(distinct company_id order by company_id), '{}'::uuid[])
  from (
    select unnest(p_company_ids) as company_id
    union all
    select we.company_id from worker_employment we
      where we.worker_id = any(p_worker_ids) and we.end_date is null
    union all
    select t.from_company_id from worker_transfer t where t.worker_id = any(p_worker_ids)
      and t.status in ('Requested', 'Awaiting Current Employer', 'Admin Review', 'Approved')
    union all
    select t.to_company_id from worker_transfer t where t.worker_id = any(p_worker_ids)
      and t.status in ('Requested', 'Awaiting Current Employer', 'Admin Review', 'Approved')
    union all
    select parties.company_id from match_worker mw join match m on m.id = mw.match_id
      cross join lateral (values(m.supplier_company_id), (m.buyer_company_id)) parties(company_id)
      where mw.worker_id = any(p_worker_ids) and not mw.knocked_out
        and m.status in ('Awaiting Supplier', 'Awaiting Buyer')
  ) companies
  where company_id is not null;
$$;
revoke all on function worker_transfer_company_ids(uuid[], uuid[]) from public, anon, authenticated, service_role;

create or replace function request_worker_transfer(
  p_email text,
  p_mobile text,
  p_to_company_id uuid,
  p_actor_user_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_mobile text := regexp_replace(trim(coalesce(p_mobile, '')), '[[:space:]().-]', '', 'g');
  v_worker_id uuid;
  v_match_count integer;
  v_from_company_id uuid;
  v_transfer worker_transfer%rowtype;
  v_next_status transfer_status;
  v_company_ids uuid[];
begin
  if nullif(trim(coalesce(p_actor_user_id, '')), '') is null then
    raise exception 'transfer actor required' using errcode = '42501';
  end if;
  if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     or length(v_email) > 254 or v_mobile !~ '^\+?[0-9]{6,18}$' then
    raise exception 'transfer contact details are invalid' using errcode = '22023';
  end if;

  -- Read-only authorisation precedes contact resolution. The same membership and
  -- writable state are locked/rechecked after the full company snapshot is known.
  perform 1 from company c join company_user cu on cu.company_id = c.id
   where c.id = p_to_company_id and c.status in ('Pending', 'Active')
     and cu.user_id = p_actor_user_id and cu.accepted_at is not null;
  if not found then raise exception 'company transfer access required' using errcode = '42501'; end if;

  select count(distinct w.id), min(w.id::text)::uuid into v_match_count, v_worker_id
    from worker w
   where lower(trim(w.email)) = v_email
      or regexp_replace(trim(w.mobile), '[[:space:]().-]', '', 'g') = v_mobile;
  if v_match_count <> 1 then
    -- No contact-field, worker-name or current-employer disclosure.
    raise exception 'transfer contact details cannot resolve one record' using errcode = '22023';
  end if;
  v_company_ids := worker_transfer_company_ids(array[v_worker_id], array[p_to_company_id]);
  perform lock_match_companies(v_company_ids);
  perform 1 from company c join company_user cu on cu.company_id = c.id
   where c.id = p_to_company_id and c.status in ('Pending', 'Active')
     and cu.user_id = p_actor_user_id and cu.accepted_at is not null
   for share of cu;
  if not found then raise exception 'company transfer access required' using errcode = '42501'; end if;

  perform pg_advisory_xact_lock(hashtext(v_worker_id::text));
  perform 1 from worker where id = v_worker_id for update;
  if not (worker_transfer_company_ids(array[v_worker_id], array[p_to_company_id]) <@ v_company_ids) then
    raise exception 'transfer companies changed; retry' using errcode = '40001';
  end if;
  select count(distinct w.id) into v_match_count from worker w
   where lower(trim(w.email)) = v_email
      or regexp_replace(trim(w.mobile), '[[:space:]().-]', '', 'g') = v_mobile;
  if v_match_count <> 1 or not exists (
    select 1 from worker w where w.id = v_worker_id
    and (lower(trim(w.email)) = v_email or regexp_replace(trim(w.mobile), '[[:space:]().-]', '', 'g') = v_mobile)
  ) then
    raise exception 'transfer contact details changed; retry' using errcode = '40001';
  end if;
  select company_id into v_from_company_id from worker_employment
   where worker_id = v_worker_id and end_date is null for update;
  if v_from_company_id = p_to_company_id then
    raise exception 'worker already belongs to requesting company' using errcode = '23514';
  end if;

  select * into v_transfer from worker_transfer where worker_id = v_worker_id
    and status in ('Requested', 'Awaiting Current Employer', 'Admin Review', 'Approved') for update;
  if found then
    if v_transfer.to_company_id <> p_to_company_id then
      raise exception 'a transfer is already pending' using errcode = '23505';
    end if;
    return jsonb_build_object(
      'transfer_id', v_transfer.id, 'status', v_transfer.status,
      'from_company_id', v_transfer.from_company_id, 'to_company_id', v_transfer.to_company_id,
      'transition', 'requested', 'created', false, 'lines_touched', 0, 'knockouts', '[]'::jsonb
    );
  end if;

  insert into worker_transfer(worker_id, from_company_id, to_company_id, status, requested_by)
  values(v_worker_id, v_from_company_id, p_to_company_id, 'Requested', p_actor_user_id)
  returning * into v_transfer;
  insert into audit_event(actor_user_id, actor_is_system, action, entity_type, entity_id, after_data)
  values(p_actor_user_id, false, 'worker_transfer.requested', 'worker_transfer', v_transfer.id,
    jsonb_build_object('status', 'Requested', 'worker_id', v_worker_id, 'to_company_id', p_to_company_id));

  v_next_status := case when v_from_company_id is null then 'Admin Review'::transfer_status
                       else 'Awaiting Current Employer'::transfer_status end;
  update worker_transfer set status = v_next_status where id = v_transfer.id;
  insert into audit_event(actor_user_id, actor_is_system, action, entity_type, entity_id, before_data, after_data)
  values(p_actor_user_id, false, 'worker_transfer.routed', 'worker_transfer', v_transfer.id,
    jsonb_build_object('status', 'Requested'),
    jsonb_build_object('status', v_next_status, 'reason', case when v_from_company_id is null then 'no current employer' else 'current employer decision required' end));

  return jsonb_build_object(
    'transfer_id', v_transfer.id, 'status', v_next_status,
    'from_company_id', v_from_company_id, 'to_company_id', p_to_company_id,
    'transition', 'requested', 'created', true, 'lines_touched', 0, 'knockouts', '[]'::jsonb
  );
end;
$$;
revoke all on function request_worker_transfer(text, text, uuid, text) from public, anon, authenticated, service_role;
grant execute on function request_worker_transfer(text, text, uuid, text) to service_role;

create or replace function decide_worker_transfer(
  p_transfer_id uuid,
  p_expected_status transfer_status,
  p_decision text,
  p_actor_user_id text,
  p_actor_company_id uuid default null,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_snapshot worker_transfer%rowtype;
  v_transfer worker_transfer%rowtype;
  v_employment worker_employment%rowtype;
  v_target_status transfer_status;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_today date := (now() at time zone 'Australia/Brisbane')::date;
  v_removed_line_ids uuid[] := '{}'::uuid[];
  v_demand_id uuid;
  v_match_id uuid;
  v_knockout jsonb;
  v_knockouts jsonb := '[]'::jsonb;
  v_company_ids uuid[];
begin
  if nullif(trim(coalesce(p_actor_user_id, '')), '') is null then
    raise exception 'transfer actor required' using errcode = '42501';
  end if;
  if p_expected_status is null or p_decision is null or p_decision not in ('approve','decline','withdraw','review')
     or length(coalesce(v_reason, '')) > 1000 then
    raise exception 'transfer decision is invalid' using errcode = '22023';
  end if;
  select * into v_snapshot from worker_transfer where id = p_transfer_id;
  if not found then raise exception 'transfer is unavailable' using errcode = '42501'; end if;

  v_company_ids := worker_transfer_company_ids(array[v_snapshot.worker_id],
    array[v_snapshot.from_company_id, v_snapshot.to_company_id, p_actor_company_id]);
  perform lock_match_companies(v_company_ids);
  if p_actor_company_id is not null then
    perform 1 from company c join company_user cu on cu.company_id = c.id
     where c.id = p_actor_company_id and c.status in ('Pending', 'Active')
       and cu.user_id = p_actor_user_id and cu.accepted_at is not null
     for share of cu;
    if not found then raise exception 'company transfer access required' using errcode = '42501'; end if;
  end if;
  if p_decision = 'approve' then
    perform 1 from company where id = v_snapshot.to_company_id and status in ('Pending', 'Active');
    if not found then raise exception 'requesting company is not writable' using errcode = '42501'; end if;
  end if;

  -- Same ordering as matching (hashtext, worker), with intake's capacity-membership
  -- lock taken before the worker row. No match lock is held while acquiring a worker.
  perform pg_advisory_xact_lock(hashtext(v_snapshot.worker_id::text));
  perform pg_advisory_xact_lock(hashtextextended(v_snapshot.worker_id::text, 904));
  perform 1 from worker where id = v_snapshot.worker_id for update;
  if not (worker_transfer_company_ids(array[v_snapshot.worker_id],
    array[v_snapshot.from_company_id, v_snapshot.to_company_id, p_actor_company_id]) <@ v_company_ids) then
    raise exception 'transfer companies changed; retry' using errcode = '40001';
  end if;
  select * into v_transfer from worker_transfer
   where id = p_transfer_id and status = p_expected_status for update;
  if not found then raise exception 'transfer changed; refresh before deciding' using errcode = '40001'; end if;
  if v_transfer.worker_id <> v_snapshot.worker_id
     or v_transfer.from_company_id is distinct from v_snapshot.from_company_id
     or v_transfer.to_company_id <> v_snapshot.to_company_id then
    raise exception 'transfer identity changed; refresh before deciding' using errcode = '40001';
  end if;

  if p_decision = 'withdraw' then
    if p_actor_company_id is null or p_actor_company_id <> v_transfer.to_company_id then
      raise exception 'only the requesting company may withdraw' using errcode = '42501';
    end if;
    if v_transfer.status not in ('Requested', 'Awaiting Current Employer', 'Admin Review') then
      raise exception 'only a pending transfer may be withdrawn' using errcode = '23514';
    end if;
    v_target_status := 'Withdrawn';
  elsif p_decision = 'review' then
    if p_actor_company_id is not null then
      raise exception 'Maintain review access required' using errcode = '42501';
    end if;
    if v_transfer.status not in ('Requested', 'Awaiting Current Employer') or length(coalesce(v_reason, '')) < 10 then
      raise exception 'exceptional Admin Review requires a pending request and evidence' using errcode = '23514';
    end if;
    v_target_status := 'Admin Review';
  else
    if p_actor_company_id is null then
      if v_transfer.status <> 'Admin Review' then
        raise exception 'Maintain decisions require Admin Review' using errcode = '23514';
      end if;
    else
      if p_actor_company_id is distinct from v_transfer.from_company_id then
        raise exception 'only the current employer may decide' using errcode = '42501';
      end if;
      if v_transfer.status <> 'Awaiting Current Employer' then
        raise exception 'employer decision requires Awaiting Current Employer' using errcode = '23514';
      end if;
    end if;
    v_target_status := case when p_decision = 'approve' then 'Approved'::transfer_status else 'Declined'::transfer_status end;
  end if;

  if p_decision = 'approve' then
    select * into v_employment from worker_employment
     where worker_id = v_transfer.worker_id and end_date is null for update;
    if v_employment.company_id is distinct from v_transfer.from_company_id then
      raise exception 'current employment changed; review a new request' using errcode = '40001';
    end if;
    if v_employment.start_date > v_today then
      raise exception 'future employment cannot be closed before its start' using errcode = '23514';
    end if;

    -- Check both authoritative and denormalised statuses, failing closed even if a
    -- legacy row is inconsistent. Matching holds the same worker lock before insert.
    perform 1 from engagement_worker ew join engagement e on e.id = ew.engagement_id
     where ew.worker_id = v_transfer.worker_id
       and (ew.status in ('Awaiting Commercial', 'Confirmed', 'Active')
            or e.status in ('Awaiting Commercial', 'Confirmed', 'Active'))
     order by e.id for update of e, ew;
    if found then
      raise exception 'resolve committing engagements before transfer approval' using errcode = '23514';
    end if;
  end if;

  update worker_transfer set status = v_target_status,
    decided_by = case when p_decision = 'review' then null else p_actor_user_id end,
    decided_at = case when p_decision = 'review' then null else now() end,
    reason = v_reason
   where id = p_transfer_id and status = p_expected_status;
  if not found then raise exception 'transfer changed; refresh before deciding' using errcode = '40001'; end if;
  insert into audit_event(actor_user_id, actor_is_system, action, entity_type, entity_id, before_data, after_data)
  values(p_actor_user_id, false,
    case p_decision when 'approve' then 'worker_transfer.approved' when 'decline' then 'worker_transfer.declined'
      when 'withdraw' then 'worker_transfer.withdrawn' else 'worker_transfer.forced_admin_review' end,
    'worker_transfer', p_transfer_id, jsonb_build_object('status', v_transfer.status),
    jsonb_build_object('status', v_target_status, 'reason', v_reason));

  if p_decision = 'approve' then
    if v_transfer.from_company_id is not null then
      update worker_employment set end_date = v_today, end_reason = 'transfer'
       where id = v_employment.id and worker_id = v_transfer.worker_id
         and company_id = v_transfer.from_company_id and end_date is null;
      if not found then raise exception 'current employment changed' using errcode = '40001'; end if;
    end if;
    insert into worker_employment(worker_id, company_id, start_date)
    values(v_transfer.worker_id, v_transfer.to_company_id, v_today);

    -- Proposals take demand before capacity. Acquire the affected demand rows in
    -- a stable order before any capacity lock, including when several transfers
    -- affect different nominations on the same set of demand lines.
    for v_demand_id in
      select distinct m.demand_line_id from match_worker mw join match m on m.id = mw.match_id
       where mw.worker_id = v_transfer.worker_id and not mw.knocked_out
         and m.status in ('Awaiting Supplier', 'Awaiting Buyer') order by m.demand_line_id
    loop
      perform 1 from demand_line where id = v_demand_id for update;
    end loop;

    -- Shared matching primitive re-locks the worker reentrantly, then demand/match,
    -- increments the presented version, releases holds below crew minimum and audits.
    for v_match_id in
      select mw.match_id from match_worker mw join match m on m.id = mw.match_id
       where mw.worker_id = v_transfer.worker_id and not mw.knocked_out
         and m.status in ('Awaiting Supplier', 'Awaiting Buyer') order by mw.match_id
    loop
      v_knockout := knock_out_match_nomination_atomic(
        v_match_id, v_transfer.worker_id, 'worker transferred to another business', p_actor_user_id, false, null, null
      );
      if (v_knockout ->> 'changed')::boolean then
        v_knockouts := v_knockouts || jsonb_build_array(v_knockout);
      end if;
    end loop;

    -- Intake serialises any new membership using lock 904; lock the existing lines
    -- as well so their open/history status cannot change under the cascade.
    perform 1 from capacity_line cl join capacity_line_worker cw on cw.capacity_line_id = cl.id
     where cw.worker_id = v_transfer.worker_id and cl.company_id = v_transfer.from_company_id
       and cl.status in ('Open', 'Partially Committed') order by cl.id for update of cl;
    with removed as (
      delete from capacity_line_worker cw using capacity_line cl
       where cw.capacity_line_id = cl.id and cw.worker_id = v_transfer.worker_id
         and cl.company_id = v_transfer.from_company_id and cl.status in ('Open', 'Partially Committed')
      returning cw.capacity_line_id
    ) select coalesce(array_agg(capacity_line_id order by capacity_line_id), '{}'::uuid[])
      into v_removed_line_ids from removed;
    if cardinality(v_removed_line_ids) > 0 then
      insert into audit_event(actor_user_id, actor_is_system, action, entity_type, entity_id, before_data, after_data)
      values(p_actor_user_id, false, 'capacity_line_worker.removed_on_transfer', 'worker', v_transfer.worker_id,
        jsonb_build_object('capacity_line_ids', v_removed_line_ids), jsonb_build_object('removed', true, 'reason', 'transfer'));
    end if;

    update worker_transfer set status = 'Completed' where id = p_transfer_id and status = 'Approved';
    if not found then raise exception 'approval did not complete' using errcode = '40001'; end if;
    v_target_status := 'Completed';
    insert into audit_event(actor_user_id, actor_is_system, action, entity_type, entity_id, before_data, after_data)
    values(p_actor_user_id, false, 'worker_transfer.completed', 'worker_transfer', p_transfer_id,
      jsonb_build_object('status', 'Approved'), jsonb_build_object('status', 'Completed'));
    insert into audit_event(actor_user_id, actor_is_system, action, entity_type, entity_id, before_data, after_data)
    values(p_actor_user_id, false, 'worker.employer_changed', 'worker', v_transfer.worker_id,
      jsonb_build_object('employer_company_id', v_transfer.from_company_id),
      jsonb_build_object('employer_company_id', v_transfer.to_company_id, 'end_reason', 'transfer', 'transfer_id', p_transfer_id));
  end if;

  return jsonb_build_object(
    'transfer_id', p_transfer_id, 'status', v_target_status,
    'from_company_id', v_transfer.from_company_id, 'to_company_id', v_transfer.to_company_id,
    'transition', p_decision, 'lines_touched', cardinality(v_removed_line_ids), 'knockouts', v_knockouts
  );
end;
$$;
revoke all on function decide_worker_transfer(uuid, transfer_status, text, text, uuid, text) from public, anon, authenticated, service_role;
grant execute on function decide_worker_transfer(uuid, transfer_status, text, text, uuid, text) to service_role;

create or replace function worker_transfer_review_due_on(p_created_at timestamptz)
returns date
language plpgsql stable strict security definer set search_path = public
as $$
declare
  v_due_on date := (p_created_at at time zone 'Australia/Brisbane')::date;
  v_days integer := 0;
begin
  while v_days < 5 loop
    v_due_on := v_due_on + 1;
    if extract(isodow from v_due_on) <= 5
       and not exists(select 1 from public_holiday where holiday_date = v_due_on) then
      v_days := v_days + 1;
    end if;
  end loop;
  return v_due_on;
end;
$$;
revoke all on function worker_transfer_review_due_on(timestamptz) from public, anon, authenticated, service_role;

-- Private cron core: the outer daily transaction already holds its complete
-- company/worker snapshot. Validate coverage instead of taking late locks here.
create or replace function escalate_worker_transfers_prelocked(
  p_effective_date date,
  p_actor_user_id text,
  p_locked_company_ids uuid[],
  p_locked_worker_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_snapshot worker_transfer%rowtype;
  v_transfer worker_transfer%rowtype;
  v_due_on date;
  v_results jsonb := '[]'::jsonb;
begin
  if p_effective_date is null or (p_actor_user_id is not null and nullif(trim(p_actor_user_id), '') is null) then
    raise exception 'escalation date and actor are invalid' using errcode = '22023';
  end if;
  if p_locked_company_ids is null or p_locked_worker_ids is null
     or array_position(p_locked_company_ids, null) is not null
     or array_position(p_locked_worker_ids, null) is not null then
    raise exception 'escalation lock snapshot is invalid' using errcode = '22004';
  end if;
  for v_snapshot in
    select * from worker_transfer where status = 'Awaiting Current Employer'
      and worker_transfer_review_due_on(created_at) <= p_effective_date
    order by worker_id, id
  loop
    if not (v_snapshot.worker_id = any(p_locked_worker_ids))
       or not (worker_transfer_company_ids(array[v_snapshot.worker_id],
         array[v_snapshot.from_company_id, v_snapshot.to_company_id]) <@ p_locked_company_ids) then
      raise exception 'transfer escalation participants changed; retry' using errcode = '40001';
    end if;
    select * into v_transfer from worker_transfer
      where id = v_snapshot.id and status = 'Awaiting Current Employer' for update skip locked;
    if not found then continue; end if;
    if v_transfer.worker_id <> v_snapshot.worker_id
       or v_transfer.from_company_id is distinct from v_snapshot.from_company_id
       or v_transfer.to_company_id <> v_snapshot.to_company_id then
      raise exception 'transfer escalation identity changed; retry' using errcode = '40001';
    end if;
    v_due_on := worker_transfer_review_due_on(v_transfer.created_at);
    if p_effective_date < v_due_on then continue; end if;
    update worker_transfer set status = 'Admin Review'
     where id = v_transfer.id and status = 'Awaiting Current Employer';
    if not found then continue; end if;
    insert into audit_event(actor_user_id, actor_is_system, action, entity_type, entity_id, before_data, after_data)
    values(p_actor_user_id, p_actor_user_id is null, 'worker_transfer.escalated_to_admin_review', 'worker_transfer', v_transfer.id,
      jsonb_build_object('status', 'Awaiting Current Employer'),
      jsonb_build_object('status', 'Admin Review', 'due_on', v_due_on));
    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'transfer_id', v_transfer.id, 'status', 'Admin Review',
      'from_company_id', v_transfer.from_company_id, 'to_company_id', v_transfer.to_company_id,
      'transition', 'escalated', 'lines_touched', 0, 'knockouts', '[]'::jsonb
    ));
  end loop;
  return v_results;
end;
$$;
revoke all on function escalate_worker_transfers_prelocked(date, text, uuid[], uuid[]) from public, anon, authenticated, service_role;

create or replace function escalate_worker_transfers(
  p_effective_date date,
  p_actor_user_id text default null
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_worker_ids uuid[];
  v_company_ids uuid[];
begin
  if p_effective_date is null or (p_actor_user_id is not null and nullif(trim(p_actor_user_id), '') is null) then
    raise exception 'escalation date and actor are invalid' using errcode = '22023';
  end if;
  select coalesce(array_agg(distinct worker_id order by worker_id), '{}'::uuid[])
    into v_worker_ids from worker_transfer where status = 'Awaiting Current Employer'
      and worker_transfer_review_due_on(created_at) <= p_effective_date;
  v_company_ids := worker_transfer_company_ids(v_worker_ids, '{}'::uuid[]);
  perform lock_match_companies(v_company_ids);
  perform lock_match_workers(v_worker_ids);
  return escalate_worker_transfers_prelocked(p_effective_date, p_actor_user_id, v_company_ids, v_worker_ids);
end;
$$;
revoke all on function escalate_worker_transfers(date, text) from public, anon, authenticated, service_role;
grant execute on function escalate_worker_transfers(date, text) to service_role;
