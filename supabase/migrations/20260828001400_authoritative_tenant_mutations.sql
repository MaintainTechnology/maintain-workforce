-- Intake is an aggregate transaction, not a sequence of independently writable REST
-- rows. Revoke both table AND column INSERT grants left by 003; revoking only the
-- table privilege does not remove an existing column grant in PostgreSQL.
do $$
declare
  v_table text;
  v_columns text;
begin
  foreach v_table in array array[
    'capacity_listing', 'capacity_line', 'capacity_line_worker', 'capacity_line_travel_region',
    'demand_request', 'demand_line', 'demand_line_skill', 'demand_line_qualification'
  ]
  loop
    execute format('revoke insert on table public.%I from public, anon, authenticated', v_table);
    select string_agg(quote_ident(a.attname), ', ' order by a.attnum) into v_columns
      from pg_attribute a
     where a.attrelid = format('public.%I', v_table)::regclass
       and a.attnum > 0 and not a.attisdropped;
    execute format('revoke insert (%s) on table public.%I from public, anon, authenticated',
      v_columns, v_table);
  end loop;
end;
$$;

-- Preserve the public worker-status contract and notification IDs while delegating
-- nomination changes to the same version-aware primitive used by matching/transfer.
create or replace function set_company_worker_status(
  p_worker_id uuid,
  p_expected_status worker_status,
  p_status worker_status,
  p_actor_user_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claim_actor text := auth.jwt() ->> 'sub';
  v_actor text;
  v_is_service_role boolean := coalesce(auth.jwt() ->> 'role', '') = 'service_role';
  v_company_id uuid := current_company_id();
  v_company_ids uuid[];
  v_current_company_ids uuid[];
  v_before worker%rowtype;
  v_match record;
  v_result jsonb;
  v_knocked_out_match_ids uuid[] := '{}'::uuid[];
  v_declined_match_ids uuid[] := '{}'::uuid[];
  v_buyer_declined_match_ids uuid[] := '{}'::uuid[];
  v_buyer_renotification_match_ids uuid[] := '{}'::uuid[];
begin
  if p_worker_id is null or p_expected_status is null or p_status is null then
    raise exception 'worker and exact prior/next statuses are required' using errcode = '22004';
  end if;

  if v_is_service_role then
    v_actor := nullif(trim(coalesce(p_actor_user_id, '')), '');
    if v_actor is null then
      raise exception 'an explicit Maintain actor is required' using errcode = '42501';
    end if;
    if p_expected_status not in ('Active', 'Inactive', 'Suspended')
       or p_status not in ('Active', 'Inactive', 'Suspended') then
      raise exception 'invalid worker status transition' using errcode = '23514';
    end if;
  else
    v_actor := nullif(trim(coalesce(v_claim_actor, '')), '');
    if p_actor_user_id is not null or v_actor is null or v_company_id is null
       or not current_company_has_status(array['Pending'::company_status, 'Active'::company_status])
       or not exists (
         select 1 from worker_employment employment
          where employment.worker_id = p_worker_id and employment.company_id = v_company_id
            and employment.end_date is null
       ) then
      raise exception 'company write access required' using errcode = '42501';
    end if;
    if p_expected_status not in ('Active', 'Inactive') or p_status not in ('Active', 'Inactive') then
      raise exception 'company users cannot set that worker status' using errcode = '42501';
    end if;
  end if;

  -- A knockout may touch several buyers. Lock the complete, sorted company set
  -- BEFORE the worker so 013 suspension and 008/010 transactions share one order.
  select coalesce(array_agg(distinct party.id order by party.id), '{}'::uuid[])
    into v_company_ids
    from (
      select v_company_id as id
      union all
      select e.company_id from worker_employment e where e.worker_id = p_worker_id and e.end_date is null
      union all
      select unnest(array[m.supplier_company_id, m.buyer_company_id])
        from match m join match_worker mw on mw.match_id = m.id
       where mw.worker_id = p_worker_id and not mw.knocked_out
         and m.status in ('Awaiting Supplier', 'Awaiting Buyer')
    ) party where party.id is not null;
  perform lock_match_companies(v_company_ids);

  if not v_is_service_role then
    perform 1 from company c join company_user cu on cu.company_id = c.id
     where c.id = v_company_id and c.status in ('Pending', 'Active')
       and cu.user_id = v_actor and cu.accepted_at is not null
     for share of cu;
    if not found then raise exception 'company write access required' using errcode = '42501'; end if;
  end if;

  perform lock_match_workers(array[p_worker_id]);
  select * into v_before from worker where id = p_worker_id;
  if not found then raise exception 'worker is not company-manageable' using errcode = '42501'; end if;

  -- A proposal or transfer may have committed while we waited for the worker. Do
  -- not acquire a new company lock out of order; abort and let the caller refresh.
  select coalesce(array_agg(distinct party.id order by party.id), '{}'::uuid[])
    into v_current_company_ids
    from (
      select v_company_id as id
      union all
      select e.company_id from worker_employment e where e.worker_id = p_worker_id and e.end_date is null
      union all
      select unnest(array[m.supplier_company_id, m.buyer_company_id])
        from match m join match_worker mw on mw.match_id = m.id
       where mw.worker_id = p_worker_id and not mw.knocked_out
         and m.status in ('Awaiting Supplier', 'Awaiting Buyer')
    ) party where party.id is not null;
  if not (v_current_company_ids <@ v_company_ids) then
    raise exception 'worker companies changed; refresh before retrying' using errcode = '40001';
  end if;
  if not v_is_service_role and (
    v_before.status not in ('Active', 'Inactive') or not exists (
      select 1 from worker_employment e
       where e.worker_id = p_worker_id and e.company_id = v_company_id and e.end_date is null
    )
  ) then
    raise exception 'worker is not company-manageable' using errcode = '42501';
  end if;
  if v_before.status <> p_expected_status then
    raise exception 'worker status changed; refresh before retrying' using errcode = '40001';
  end if;

  if v_before.status <> p_status then
    if p_status <> 'Active' then
      perform d.id from demand_line d where exists (
        select 1 from match m join match_worker mw on mw.match_id = m.id
         where m.demand_line_id = d.id and mw.worker_id = p_worker_id and not mw.knocked_out
           and m.status in ('Awaiting Supplier', 'Awaiting Buyer')
      ) order by d.id for update;
    end if;

    update worker set status = p_status where id = p_worker_id;
    insert into audit_event (
      actor_user_id, actor_is_system, action, entity_type, entity_id, before_data, after_data
    ) values (
      v_actor, false, 'worker.status_changed', 'worker', p_worker_id::text,
      jsonb_build_object('status', v_before.status), jsonb_build_object('status', p_status)
    );

    if p_status <> 'Active' then
      for v_match in
        select m.id, m.demand_line_id from match m join match_worker mw on mw.match_id = m.id
         where mw.worker_id = p_worker_id and not mw.knocked_out
           and m.status in ('Awaiting Supplier', 'Awaiting Buyer')
         order by m.demand_line_id, m.id
      loop
        v_result := knock_out_match_nomination_atomic(v_match.id, p_worker_id,
          'worker is no longer active', v_actor, false);
        if coalesce((v_result ->> 'changed')::boolean, false) then
          v_knocked_out_match_ids := array_append(v_knocked_out_match_ids, v_match.id);
          if v_result ->> 'status_after' = 'Declined' then
            v_declined_match_ids := array_append(v_declined_match_ids, v_match.id);
            if v_result ->> 'status_before' = 'Awaiting Buyer' then
              v_buyer_declined_match_ids := array_append(v_buyer_declined_match_ids, v_match.id);
            end if;
          elsif v_result ->> 'status_before' = 'Awaiting Buyer' then
            v_buyer_renotification_match_ids := array_append(v_buyer_renotification_match_ids, v_match.id);
          end if;
        end if;
      end loop;
    end if;
  end if;

  return jsonb_build_object(
    'worker_id', p_worker_id,
    'knocked_out_match_ids', to_jsonb(v_knocked_out_match_ids),
    'declined_match_ids', to_jsonb(v_declined_match_ids),
    'buyer_declined_match_ids', to_jsonb(v_buyer_declined_match_ids),
    'buyer_renotification_match_ids', to_jsonb(v_buyer_renotification_match_ids)
  );
end;
$$;
revoke all on function set_company_worker_status(uuid, worker_status, worker_status, text)
  from public, anon, authenticated, service_role;
grant execute on function set_company_worker_status(uuid, worker_status, worker_status, text)
  to authenticated, service_role;

-- Withdrawals do not add workers or change nominations, but must still fence the
-- company status/membership before their line lock. A concurrent suspension cannot
-- leave a tenant write authorised from an earlier, now-stale Active snapshot.
create or replace function withdraw_company_capacity_line(p_line_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text := auth.jwt() ->> 'sub';
  v_company_id uuid := current_company_id();
  v_before capacity_line%rowtype;
begin
  if v_actor is null or v_company_id is null then
    raise exception 'active company access required' using errcode = '42501';
  end if;
  perform 1 from company c join company_user cu on cu.company_id = c.id
   where c.id = v_company_id and c.status = 'Active'
     and cu.user_id = v_actor and cu.accepted_at is not null
   for share of c, cu;
  if not found then raise exception 'active company access required' using errcode = '42501'; end if;

  select * into v_before from capacity_line
   where id = p_line_id and company_id = v_company_id for update;
  if not found then raise exception 'capacity line is not owned by this company' using errcode = '42501'; end if;
  if v_before.status = 'Withdrawn' then return p_line_id; end if;
  if v_before.status not in ('Open', 'Partially Committed') then
    raise exception 'capacity line cannot transition to Withdrawn' using errcode = '23514';
  end if;
  if exists (select 1 from match m where m.capacity_line_id = p_line_id
    and m.status in ('Awaiting Supplier', 'Awaiting Buyer')) then
    raise exception 'an open match blocks capacity withdrawal' using errcode = '23514';
  end if;

  update capacity_line set status = 'Withdrawn' where id = p_line_id;
  insert into audit_event (
    actor_user_id, actor_is_system, action, entity_type, entity_id, before_data, after_data
  ) values (
    v_actor, false, 'capacity.withdrawn', 'capacity_line', p_line_id::text,
    jsonb_build_object('status', v_before.status), jsonb_build_object('status', 'Withdrawn')
  );
  return p_line_id;
end;
$$;
revoke all on function withdraw_company_capacity_line(uuid) from public, anon, authenticated, service_role;
grant execute on function withdraw_company_capacity_line(uuid) to authenticated;

create or replace function withdraw_company_demand_line(p_line_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text := auth.jwt() ->> 'sub';
  v_company_id uuid := current_company_id();
  v_before demand_line%rowtype;
begin
  if v_actor is null or v_company_id is null then
    raise exception 'active company access required' using errcode = '42501';
  end if;
  perform 1 from company c join company_user cu on cu.company_id = c.id
   where c.id = v_company_id and c.status = 'Active'
     and cu.user_id = v_actor and cu.accepted_at is not null
   for share of c, cu;
  if not found then raise exception 'active company access required' using errcode = '42501'; end if;

  select * into v_before from demand_line
   where id = p_line_id and company_id = v_company_id for update;
  if not found then raise exception 'demand line is not owned by this company' using errcode = '42501'; end if;
  if v_before.status = 'Withdrawn' then return p_line_id; end if;
  if v_before.status not in ('Open', 'Partially Filled') then
    raise exception 'demand line cannot transition to Withdrawn' using errcode = '23514';
  end if;
  if exists (select 1 from match m where m.demand_line_id = p_line_id
    and m.status in ('Awaiting Supplier', 'Awaiting Buyer')) then
    raise exception 'an open match blocks demand withdrawal' using errcode = '23514';
  end if;

  update demand_line set status = 'Withdrawn' where id = p_line_id;
  insert into audit_event (
    actor_user_id, actor_is_system, action, entity_type, entity_id, before_data, after_data
  ) values (
    v_actor, false, 'demand.withdrawn', 'demand_line', p_line_id::text,
    jsonb_build_object('status', v_before.status), jsonb_build_object('status', 'Withdrawn')
  );
  return p_line_id;
end;
$$;
revoke all on function withdraw_company_demand_line(uuid) from public, anon, authenticated, service_role;
grant execute on function withdraw_company_demand_line(uuid) to authenticated;
