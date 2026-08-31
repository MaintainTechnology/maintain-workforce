-- Transactional aggregate intake — specs 6, 9, 10, 16.1 and 18.2.
--
-- Supabase REST calls do not span a transaction. These service-role-only functions
-- make each multi-row intake an indivisible database operation after the server action
-- has authorised the session and derived the target company and actor.

-- ================================================================ capacity create

create or replace function create_capacity_listing_transactional(
  p_company_id uuid,
  p_actor_user_id text,
  p_admin_entered boolean,
  p_evidence_note text,
  p_payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_status company_status;
  v_listing_id uuid;
  v_line_id uuid;
  v_line jsonb;
  v_worker_id uuid;
  v_worker_ids uuid[];
  v_all_worker_ids uuid[];
  v_travel_region_ids uuid[];
begin
  if nullif(trim(coalesce(p_actor_user_id, '')), '') is null then
    raise exception 'an explicit actor is required' using errcode = '22023';
  end if;
  if coalesce(p_admin_entered, false)
     and length(trim(coalesce(p_evidence_note, ''))) < 10 then
    raise exception 'concierge evidence is required' using errcode = '22023';
  end if;
  if jsonb_typeof(p_payload) is distinct from 'object'
     or jsonb_typeof(p_payload -> 'lines') is distinct from 'array'
     or jsonb_array_length(p_payload -> 'lines') = 0 then
    raise exception 'at least one capacity line is required' using errcode = '22023';
  end if;

  select c.status into v_company_status
    from company c
   where c.id = p_company_id
   for share;
  if not found or v_company_status <> 'Active'::company_status then
    raise exception 'capacity requires an Active company' using errcode = '42501';
  end if;

  -- Validate every line before taking locks or inserting a parent. Cast failures are
  -- errors too and therefore abort the same transaction without a partial aggregate.
  for v_line in select value from jsonb_array_elements(p_payload -> 'lines')
  loop
    if jsonb_typeof(v_line) is distinct from 'object'
       or nullif(v_line ->> 'trade_role_id', '') is null
       or nullif(v_line ->> 'proficiency_id', '') is null
       or nullif(v_line ->> 'available_from', '') is null
       or nullif(v_line ->> 'available_until', '') is null
       or (v_line ->> 'available_from') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
       or (v_line ->> 'available_until') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
       or nullif(v_line ->> 'location_region_id', '') is null
       or nullif(v_line ->> 'hours_per_week', '') is null
       or nullif(v_line ->> 'supplier_rate_cents', '') is null
       or jsonb_typeof(v_line -> 'worker_ids') is distinct from 'array'
       or jsonb_array_length(v_line -> 'worker_ids') = 0
       or (
         v_line ? 'travel_region_ids'
         and jsonb_typeof(v_line -> 'travel_region_ids') <> 'array'
       ) then
      raise exception 'capacity line payload is incomplete' using errcode = '22023';
    end if;

    v_worker_ids := array(
      select value::uuid from jsonb_array_elements_text(v_line -> 'worker_ids')
    );
    v_travel_region_ids := array(
      select value::uuid
        from jsonb_array_elements_text(coalesce(v_line -> 'travel_region_ids', '[]'::jsonb))
    );

    if cardinality(v_worker_ids) < 1
       or cardinality(v_worker_ids) <> (
         select count(distinct worker_id) from unnest(v_worker_ids) worker_id
       )
       or cardinality(v_travel_region_ids) <> (
         select count(distinct region_id) from unnest(v_travel_region_ids) region_id
       ) then
      raise exception 'capacity child ids must be unique' using errcode = '22023';
    end if;

    if (v_line ->> 'available_until')::date < (v_line ->> 'available_from')::date
       or (v_line ->> 'hours_per_week')::numeric <= 0
       or (v_line ->> 'hours_per_week')::numeric > 168
       or (v_line ->> 'supplier_rate_cents')::bigint <= 0 then
      raise exception 'capacity dates, hours or rate are invalid' using errcode = '23514';
    end if;

    if not exists (
      select 1
        from trade_role_proficiency trp
        join trade_role tr on tr.id = trp.trade_role_id and tr.is_active
        join proficiency p on p.id = trp.proficiency_id and p.is_active
       where trp.trade_role_id = (v_line ->> 'trade_role_id')::uuid
         and trp.proficiency_id = (v_line ->> 'proficiency_id')::uuid
    ) then
      raise exception 'trade and proficiency are not a valid active pair' using errcode = '23514';
    end if;

    if not exists (
      select 1 from region r
       where r.id = (v_line ->> 'location_region_id')::uuid and r.is_active
    ) or exists (
      select 1
        from unnest(v_travel_region_ids) selected(region_id)
       where not exists (
         select 1 from region r where r.id = selected.region_id and r.is_active
       )
    ) then
      raise exception 'capacity region is not an active catalogue value' using errcode = '23514';
    end if;

  end loop;

  -- A batch cannot overlap the same worker with itself.
  if exists (
    with proposed as (
      select
        line_number,
        worker.value::uuid as worker_id,
        (line.value ->> 'available_from')::date as available_from,
        (line.value ->> 'available_until')::date as available_until
      from jsonb_array_elements(p_payload -> 'lines') with ordinality
        as line(value, line_number)
      cross join lateral jsonb_array_elements_text(line.value -> 'worker_ids') worker(value)
    )
    select 1
      from proposed earlier
      join proposed later
        on later.worker_id = earlier.worker_id
       and later.line_number > earlier.line_number
       and daterange(later.available_from, later.available_until, '[]')
           && daterange(earlier.available_from, earlier.available_until, '[]')
  ) then
    raise exception 'capacity batch contains overlapping worker windows' using errcode = '23514';
  end if;

  select coalesce(array_agg(distinct selected.worker_id order by selected.worker_id), '{}'::uuid[])
    into v_all_worker_ids
    from (
      select worker.value::uuid as worker_id
        from jsonb_array_elements(p_payload -> 'lines') line(value)
        cross join lateral jsonb_array_elements_text(line.value -> 'worker_ids') worker(value)
    ) selected;

  -- Company -> matching worker locks -> intake advisory locks -> capacity. The
  -- shared worker lock must precede every FK/line lock, including on create, so a
  -- concurrent transfer/status change cannot race the eligibility check below.
  perform lock_match_workers(v_all_worker_ids);
  for v_worker_id in
    select worker_id from unnest(v_all_worker_ids) worker_id order by worker_id
  loop
    perform pg_advisory_xact_lock(hashtextextended(v_worker_id::text, 904));
  end loop;

  if exists (
    select 1 from jsonb_array_elements(p_payload -> 'lines') line(value)
    cross join lateral jsonb_array_elements_text(line.value -> 'worker_ids') selected(worker_id)
    where not exists (
      select 1 from worker w join worker_employment employment on employment.worker_id = w.id
       where w.id = selected.worker_id::uuid and employment.company_id = p_company_id
         and employment.end_date is null and w.status = 'Active'
         and w.primary_trade_id = (line.value ->> 'trade_role_id')::uuid
         and w.primary_proficiency_id = (line.value ->> 'proficiency_id')::uuid
    )
  ) then
    raise exception 'capacity worker is not eligible for this company and classification'
      using errcode = '23514';
  end if;

  if exists (
    with proposed as (
      select
        worker.value::uuid as worker_id,
        (line.value ->> 'available_from')::date as available_from,
        (line.value ->> 'available_until')::date as available_until
      from jsonb_array_elements(p_payload -> 'lines') line(value)
      cross join lateral jsonb_array_elements_text(line.value -> 'worker_ids') worker(value)
    )
    select 1
      from proposed p
      join capacity_line_worker link on link.worker_id = p.worker_id
      join capacity_line existing on existing.id = link.capacity_line_id
     where existing.status in ('Open'::capacity_line_status, 'Partially Committed'::capacity_line_status)
       and daterange(existing.available_from, existing.available_until, '[]')
           && daterange(p.available_from, p.available_until, '[]')
  ) then
    raise exception 'worker already has overlapping open capacity' using errcode = '23514';
  end if;

  insert into capacity_listing (
    company_id, created_by, admin_entered, evidence_note
  ) values (
    p_company_id,
    trim(p_actor_user_id),
    coalesce(p_admin_entered, false),
    case when coalesce(p_admin_entered, false) then trim(p_evidence_note) end
  ) returning id into v_listing_id;

  for v_line in select value from jsonb_array_elements(p_payload -> 'lines')
  loop
    insert into capacity_line (
      listing_id, company_id, trade_role_id, proficiency_id,
      available_from, available_until, available_days, hours_per_week,
      location_region_id, supplier_rate_cents, rate_entered_by,
      rate_entered_by_admin
    ) values (
      v_listing_id,
      p_company_id,
      (v_line ->> 'trade_role_id')::uuid,
      (v_line ->> 'proficiency_id')::uuid,
      (v_line ->> 'available_from')::date,
      (v_line ->> 'available_until')::date,
      nullif(trim(v_line ->> 'available_days'), ''),
      (v_line ->> 'hours_per_week')::numeric,
      (v_line ->> 'location_region_id')::uuid,
      (v_line ->> 'supplier_rate_cents')::bigint,
      trim(p_actor_user_id),
      coalesce(p_admin_entered, false)
    ) returning id into v_line_id;

    insert into capacity_line_worker (capacity_line_id, worker_id)
    select v_line_id, value::uuid
      from jsonb_array_elements_text(v_line -> 'worker_ids');

    insert into capacity_line_travel_region (capacity_line_id, region_id)
    select v_line_id, value::uuid
      from jsonb_array_elements_text(coalesce(v_line -> 'travel_region_ids', '[]'::jsonb));
  end loop;

  insert into audit_event (
    actor_user_id, actor_is_system, action, entity_type, entity_id, after_data
  ) values (
    trim(p_actor_user_id),
    false,
    case when coalesce(p_admin_entered, false)
      then 'concierge.capacity_created' else 'capacity.created' end,
    'capacity_listing',
    v_listing_id::text,
    jsonb_build_object(
      'company_id', p_company_id,
      'admin_entered', coalesce(p_admin_entered, false),
      'evidence_note', case when coalesce(p_admin_entered, false) then trim(p_evidence_note) end,
      'lines', p_payload -> 'lines'
    )
  );

  return v_listing_id;
end;
$$;

revoke all on function create_capacity_listing_transactional(uuid, text, boolean, text, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function create_capacity_listing_transactional(uuid, text, boolean, text, jsonb)
  to service_role;

-- ================================================================ capacity update

-- Replace the pending-003 implementation additively so update and create take the
-- same per-worker locks before enforcing the same overlap invariant.
create or replace function update_company_capacity_line(
  p_line_id uuid,
  p_available_from date,
  p_available_until date,
  p_available_days text,
  p_hours_per_week numeric,
  p_supplier_rate_cents bigint,
  p_worker_ids uuid[],
  p_travel_region_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text := auth.jwt() ->> 'sub';
  v_company_id uuid := current_company_id();
  v_before capacity_line%rowtype;
  v_before_data jsonb;
  v_after jsonb;
  v_worker_id uuid;
  v_lock_worker_ids uuid[];
begin
  if v_actor is null
     or v_company_id is null then
    raise exception 'active company access required' using errcode = '42501';
  end if;
  perform 1 from company c join company_user cu on cu.company_id = c.id
   where c.id = v_company_id and c.status = 'Active'
     and cu.user_id = v_actor and cu.accepted_at is not null
   for share of c, cu;
  if not found then
    raise exception 'active company access required' using errcode = '42501';
  end if;

  select * into v_before
    from capacity_line
   where id = p_line_id and company_id = v_company_id;
  if not found then
    raise exception 'capacity line is not owned by this company' using errcode = '42501';
  end if;

  select coalesce(array_agg(distinct selected.worker_id order by selected.worker_id), '{}'::uuid[])
    into v_lock_worker_ids
    from (
      select unnest(coalesce(p_worker_ids, '{}'::uuid[])) as worker_id
      union all
      select link.worker_id from capacity_line_worker link where link.capacity_line_id = p_line_id
    ) selected;

  perform lock_match_workers(v_lock_worker_ids);
  for v_worker_id in
    select worker_id from unnest(v_lock_worker_ids) worker_id order by worker_id
  loop
    perform pg_advisory_xact_lock(hashtextextended(v_worker_id::text, 904));
  end loop;

  select * into v_before
    from capacity_line
   where id = p_line_id and company_id = v_company_id
   for update;
  if not found then
    raise exception 'capacity line is not owned by this company' using errcode = '42501';
  end if;
  if exists (
    select 1 from capacity_line_worker link where link.capacity_line_id = p_line_id
      and not (link.worker_id = any(v_lock_worker_ids))
  ) then
    raise exception 'capacity membership changed; refresh before retrying' using errcode = '40001';
  end if;
  if v_before.status <> 'Open'::capacity_line_status then
    raise exception 'committed or historical capacity cannot be edited' using errcode = '23514';
  end if;
  -- A DATE argument also accepts PostgreSQL infinity, BC and five-digit years.
  -- Match the application's finite YYYY-MM-DD domain before any range/mutation.
  if p_available_from is null or p_available_until is null
     or not isfinite(p_available_from) or not isfinite(p_available_until)
     or p_available_from not between date '0001-01-01' and date '9999-12-31'
     or p_available_until not between date '0001-01-01' and date '9999-12-31' then
    raise exception 'capacity dates must be finite calendar dates in years 0001 to 9999'
      using errcode = '23514';
  end if;
  if p_available_until < p_available_from
     or p_hours_per_week <= 0
     or p_hours_per_week > 168
     or p_supplier_rate_cents <= 0
     or coalesce(cardinality(p_worker_ids), 0) = 0 then
    raise exception 'capacity line edit is invalid' using errcode = '23514';
  end if;
  if cardinality(p_worker_ids) <> (
       select count(distinct worker_id) from unnest(p_worker_ids) worker_id
     )
     or cardinality(coalesce(p_travel_region_ids, '{}'::uuid[])) <> (
       select count(distinct region_id)
         from unnest(coalesce(p_travel_region_ids, '{}'::uuid[])) region_id
     ) then
    raise exception 'capacity child ids must be unique' using errcode = '22023';
  end if;
  if exists (
    select 1 from match m
     where m.capacity_line_id = p_line_id
       and m.status in ('Awaiting Supplier', 'Awaiting Buyer')
  ) then
    raise exception 'an open match blocks capacity edits' using errcode = '23514';
  end if;
  if exists (
    select 1 from engagement e
     where e.capacity_line_id = p_line_id
       and e.status in ('Awaiting Commercial', 'Confirmed', 'Active')
  ) then
    raise exception 'committed capacity cannot be edited' using errcode = '23514';
  end if;

  if exists (
    select 1
      from unnest(p_worker_ids) selected(worker_id)
     where not exists (
       select 1
         from worker w
         join worker_employment employment
           on employment.worker_id = w.id
          and employment.company_id = v_company_id
          and employment.end_date is null
        where w.id = selected.worker_id
          and w.status = 'Active'::worker_status
          and w.primary_trade_id = v_before.trade_role_id
          and w.primary_proficiency_id = v_before.proficiency_id
     )
  ) then
    raise exception 'capacity worker is not eligible for this company and classification'
      using errcode = '23514';
  end if;
  if exists (
    select 1
      from unnest(coalesce(p_travel_region_ids, '{}'::uuid[])) selected(region_id)
     where not exists (
       select 1 from region r where r.id = selected.region_id and r.is_active
     )
  ) then
    raise exception 'capacity travel region is not active' using errcode = '23514';
  end if;
  if exists (
    select 1
      from unnest(p_worker_ids) selected(worker_id)
      join capacity_line_worker link on link.worker_id = selected.worker_id
      join capacity_line existing on existing.id = link.capacity_line_id
     where existing.id <> p_line_id
       and existing.status in ('Open'::capacity_line_status, 'Partially Committed'::capacity_line_status)
       and daterange(existing.available_from, existing.available_until, '[]')
           && daterange(p_available_from, p_available_until, '[]')
  ) then
    raise exception 'worker already has overlapping open capacity' using errcode = '23514';
  end if;

  v_before_data := to_jsonb(v_before) || jsonb_build_object(
    'worker_ids', coalesce((select jsonb_agg(link.worker_id order by link.worker_id)
      from capacity_line_worker link where link.capacity_line_id = p_line_id), '[]'::jsonb),
    'travel_region_ids', coalesce((select jsonb_agg(link.region_id order by link.region_id)
      from capacity_line_travel_region link where link.capacity_line_id = p_line_id), '[]'::jsonb)
  );

  update capacity_line
     set available_from = p_available_from,
         available_until = p_available_until,
         available_days = nullif(trim(p_available_days), ''),
         hours_per_week = p_hours_per_week,
         supplier_rate_cents = p_supplier_rate_cents,
         rate_entered_by = v_actor,
         rate_entered_by_admin = false,
         rate_ratified_at = null
   where id = p_line_id;

  delete from capacity_line_worker where capacity_line_id = p_line_id;
  insert into capacity_line_worker (capacity_line_id, worker_id)
  select p_line_id, worker_id from unnest(p_worker_ids) worker_id;

  delete from capacity_line_travel_region where capacity_line_id = p_line_id;
  insert into capacity_line_travel_region (capacity_line_id, region_id)
  select p_line_id, region_id
    from unnest(coalesce(p_travel_region_ids, '{}'::uuid[])) region_id;

  select to_jsonb(line) into v_after from capacity_line line where line.id = p_line_id;
  v_after := v_after || jsonb_build_object(
    'worker_ids', to_jsonb(p_worker_ids),
    'travel_region_ids', to_jsonb(coalesce(p_travel_region_ids, '{}'::uuid[]))
  );
  insert into audit_event (
    actor_user_id, actor_is_system, action, entity_type, entity_id,
    before_data, after_data
  ) values (
    v_actor, false, 'capacity.line_edited', 'capacity_line', p_line_id::text,
    v_before_data, v_after
  );

  return p_line_id;
end;
$$;

-- =================================================================== demand create

create or replace function create_demand_request_transactional(
  p_company_id uuid,
  p_actor_user_id text,
  p_admin_entered boolean,
  p_evidence_note text,
  p_payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_status company_status;
  v_request_id uuid;
  v_line_id uuid;
  v_line jsonb;
  v_skill_ids uuid[];
  v_qualification_ids uuid[];
  v_minimum_crew_size integer;
  v_minimum_hours_per_line integer;
begin
  if nullif(trim(coalesce(p_actor_user_id, '')), '') is null then
    raise exception 'an explicit actor is required' using errcode = '22023';
  end if;
  if coalesce(p_admin_entered, false)
     and length(trim(coalesce(p_evidence_note, ''))) < 10 then
    raise exception 'concierge evidence is required' using errcode = '22023';
  end if;
  if jsonb_typeof(p_payload) is distinct from 'object'
     or nullif(trim(p_payload ->> 'name'), '') is null
     or nullif(p_payload ->> 'work_region_id', '') is null
     or jsonb_typeof(p_payload -> 'lines') is distinct from 'array'
     or jsonb_array_length(p_payload -> 'lines') = 0 then
    raise exception 'demand request payload is incomplete' using errcode = '22023';
  end if;

  select c.status into v_company_status
    from company c
   where c.id = p_company_id
   for share;
  if not found or v_company_status <> 'Active'::company_status then
    raise exception 'demand requires an Active company' using errcode = '42501';
  end if;

  if not exists (
    select 1 from region r
     where r.id = (p_payload ->> 'work_region_id')::uuid and r.is_active
  ) or (
    nullif(p_payload ->> 'industry_id', '') is not null
    and not exists (
      select 1 from industry i
       where i.id = (p_payload ->> 'industry_id')::uuid and i.is_active
    )
  ) then
    raise exception 'request catalogue values are not active' using errcode = '23514';
  end if;

  select coalesce(
      (select value_int::integer from platform_config where key = 'minimum_crew_size'),
      1
    ),
    coalesce(
      (select value_int::integer from platform_config where key = 'minimum_hours_per_line'),
      8
    )
    into v_minimum_crew_size, v_minimum_hours_per_line;

  for v_line in select value from jsonb_array_elements(p_payload -> 'lines')
  loop
    if jsonb_typeof(v_line) is distinct from 'object'
       or nullif(v_line ->> 'trade_role_id', '') is null
       or nullif(v_line ->> 'proficiency_id', '') is null
       or nullif(v_line ->> 'quantity', '') is null
       or nullif(v_line ->> 'start_date', '') is null
       or nullif(v_line ->> 'end_date', '') is null
       or (v_line ->> 'start_date') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
       or (v_line ->> 'end_date') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
       or nullif(v_line ->> 'hours_per_week', '') is null
       or (
         v_line ? 'skill_ids' and jsonb_typeof(v_line -> 'skill_ids') <> 'array'
       )
       or (
         v_line ? 'qualification_ids'
         and jsonb_typeof(v_line -> 'qualification_ids') <> 'array'
       ) then
      raise exception 'demand line payload is incomplete' using errcode = '22023';
    end if;

    v_skill_ids := array(
      select value::uuid
        from jsonb_array_elements_text(coalesce(v_line -> 'skill_ids', '[]'::jsonb))
    );
    v_qualification_ids := array(
      select value::uuid
        from jsonb_array_elements_text(coalesce(v_line -> 'qualification_ids', '[]'::jsonb))
    );
    if cardinality(v_skill_ids) <> (
         select count(distinct skill_id) from unnest(v_skill_ids) skill_id
       )
       or cardinality(v_qualification_ids) <> (
         select count(distinct qualification_id)
           from unnest(v_qualification_ids) qualification_id
       ) then
      raise exception 'demand child ids must be unique' using errcode = '22023';
    end if;

    if (v_line ->> 'quantity')::integer < v_minimum_crew_size
       or (v_line ->> 'end_date')::date < (v_line ->> 'start_date')::date
       or (v_line ->> 'hours_per_week')::numeric <= 0
       or (v_line ->> 'hours_per_week')::numeric > 168
       or floor(
         (v_line ->> 'hours_per_week')::numeric
         * (((v_line ->> 'end_date')::date - (v_line ->> 'start_date')::date) + 1)
         / 7.0 + 0.5
       ) < v_minimum_hours_per_line then
      raise exception 'demand line violates booking minimums or dates' using errcode = '23514';
    end if;

    if not exists (
      select 1
        from trade_role_proficiency trp
        join trade_role tr on tr.id = trp.trade_role_id and tr.is_active
        join proficiency p on p.id = trp.proficiency_id and p.is_active
       where trp.trade_role_id = (v_line ->> 'trade_role_id')::uuid
         and trp.proficiency_id = (v_line ->> 'proficiency_id')::uuid
    ) then
      raise exception 'trade and proficiency are not a valid active pair' using errcode = '23514';
    end if;
    if exists (
      select 1
        from unnest(v_skill_ids) selected(skill_id)
       where not exists (
         select 1 from skill s
          where s.id = selected.skill_id
            and s.trade_role_id = (v_line ->> 'trade_role_id')::uuid
            and s.is_active
       )
    ) then
      raise exception 'demand skill is not active for the selected trade' using errcode = '23514';
    end if;
    if exists (
      select 1
        from unnest(v_qualification_ids) selected(qualification_id)
       where not exists (
         select 1 from qualification q
          where q.id = selected.qualification_id and q.is_active
       )
    ) then
      raise exception 'demand qualification is not active' using errcode = '23514';
    end if;
  end loop;

  insert into demand_request (
    company_id, name, industry_id, work_region_id, description,
    created_by, admin_entered, evidence_note
  ) values (
    p_company_id,
    trim(p_payload ->> 'name'),
    nullif(p_payload ->> 'industry_id', '')::uuid,
    (p_payload ->> 'work_region_id')::uuid,
    nullif(trim(p_payload ->> 'description'), ''),
    trim(p_actor_user_id),
    coalesce(p_admin_entered, false),
    case when coalesce(p_admin_entered, false) then trim(p_evidence_note) end
  ) returning id into v_request_id;

  for v_line in select value from jsonb_array_elements(p_payload -> 'lines')
  loop
    insert into demand_line (
      request_id, company_id, trade_role_id, proficiency_id, quantity,
      start_date, end_date, hours_per_week, notes
    ) values (
      v_request_id,
      p_company_id,
      (v_line ->> 'trade_role_id')::uuid,
      (v_line ->> 'proficiency_id')::uuid,
      (v_line ->> 'quantity')::integer,
      (v_line ->> 'start_date')::date,
      (v_line ->> 'end_date')::date,
      (v_line ->> 'hours_per_week')::numeric,
      nullif(trim(v_line ->> 'notes'), '')
    ) returning id into v_line_id;

    insert into demand_line_skill (demand_line_id, skill_id)
    select v_line_id, value::uuid
      from jsonb_array_elements_text(coalesce(v_line -> 'skill_ids', '[]'::jsonb));

    insert into demand_line_qualification (demand_line_id, qualification_id)
    select v_line_id, value::uuid
      from jsonb_array_elements_text(coalesce(v_line -> 'qualification_ids', '[]'::jsonb));
  end loop;

  insert into audit_event (
    actor_user_id, actor_is_system, action, entity_type, entity_id, after_data
  ) values (
    trim(p_actor_user_id),
    false,
    case when coalesce(p_admin_entered, false)
      then 'concierge.demand_created' else 'demand.created' end,
    'demand_request',
    v_request_id::text,
    jsonb_build_object(
      'company_id', p_company_id,
      'admin_entered', coalesce(p_admin_entered, false),
      'evidence_note', case when coalesce(p_admin_entered, false) then trim(p_evidence_note) end,
      'name', trim(p_payload ->> 'name'),
      'work_region_id', p_payload ->> 'work_region_id',
      'lines', p_payload -> 'lines'
    )
  );

  return v_request_id;
end;
$$;

revoke all on function create_demand_request_transactional(uuid, text, boolean, text, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function create_demand_request_transactional(uuid, text, boolean, text, jsonb)
  to service_role;

-- =================================================================== demand update

-- The six-argument function from 003 cannot replace requirement children. Remove its
-- authenticated entry point; the eight-argument form below replaces parent + children.
revoke all on function update_company_demand_line(
  uuid, integer, date, date, numeric, text
) from public, anon, authenticated, service_role;

create or replace function update_company_demand_line(
  p_line_id uuid,
  p_quantity integer,
  p_start_date date,
  p_end_date date,
  p_hours_per_week numeric,
  p_notes text,
  p_skill_ids uuid[],
  p_qualification_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text := auth.jwt() ->> 'sub';
  v_company_id uuid := current_company_id();
  v_before demand_line%rowtype;
  v_before_data jsonb;
  v_filled integer;
  v_minimum_crew_size integer;
  v_minimum_hours_per_line integer;
  v_after jsonb;
begin
  if v_actor is null
     or v_company_id is null then
    raise exception 'active company access required' using errcode = '42501';
  end if;
  perform 1 from company c join company_user cu on cu.company_id = c.id
   where c.id = v_company_id and c.status = 'Active'
     and cu.user_id = v_actor and cu.accepted_at is not null
   for share of c, cu;
  if not found then
    raise exception 'active company access required' using errcode = '42501';
  end if;

  select * into v_before
    from demand_line
   where id = p_line_id and company_id = v_company_id
   for update;
  if not found then
    raise exception 'demand line is not owned by this company' using errcode = '42501';
  end if;
  if v_before.status not in ('Open'::demand_line_status, 'Partially Filled'::demand_line_status) then
    raise exception 'filled or historical demand cannot be edited' using errcode = '23514';
  end if;
  if exists (
    select 1 from match m
     where m.demand_line_id = p_line_id
       and m.status in ('Awaiting Supplier', 'Awaiting Buyer')
  ) then
    raise exception 'an open match blocks demand edits' using errcode = '23514';
  end if;

  -- Validate the calendar domain separately, before subtracting dates below.
  -- PostgreSQL DATE includes infinities and years the application's ISO format cannot represent.
  if p_start_date is null or p_end_date is null
     or not isfinite(p_start_date) or not isfinite(p_end_date)
     or p_start_date not between date '0001-01-01' and date '9999-12-31'
     or p_end_date not between date '0001-01-01' and date '9999-12-31' then
    raise exception 'demand dates must be finite calendar dates in years 0001 to 9999'
      using errcode = '23514';
  end if;

  select count(distinct ew.worker_id)::integer
    into v_filled
    from engagement e
    join engagement_worker ew on ew.engagement_id = e.id
   where e.demand_line_id = p_line_id
     and e.status in ('Awaiting Commercial', 'Confirmed', 'Active');

  select coalesce(
      (select value_int::integer from platform_config where key = 'minimum_crew_size'),
      1
    ),
    coalesce(
      (select value_int::integer from platform_config where key = 'minimum_hours_per_line'),
      8
    )
    into v_minimum_crew_size, v_minimum_hours_per_line;

  if p_quantity < greatest(coalesce(v_filled, 0), v_minimum_crew_size)
     or p_end_date < p_start_date
     or p_hours_per_week <= 0
     or p_hours_per_week > 168
     or floor(p_hours_per_week * ((p_end_date - p_start_date) + 1) / 7.0 + 0.5)
        < v_minimum_hours_per_line then
    raise exception 'demand edit violates filled quantity, booking minimums or dates'
      using errcode = '23514';
  end if;

  if cardinality(coalesce(p_skill_ids, '{}'::uuid[])) <> (
       select count(distinct skill_id) from unnest(coalesce(p_skill_ids, '{}'::uuid[])) skill_id
     )
     or cardinality(coalesce(p_qualification_ids, '{}'::uuid[])) <> (
       select count(distinct qualification_id)
         from unnest(coalesce(p_qualification_ids, '{}'::uuid[])) qualification_id
     ) then
    raise exception 'demand child ids must be unique' using errcode = '22023';
  end if;
  if exists (
    select 1
      from unnest(coalesce(p_skill_ids, '{}'::uuid[])) selected(skill_id)
     where not exists (
       select 1 from skill s
        where s.id = selected.skill_id
          and s.trade_role_id = v_before.trade_role_id
          and s.is_active
     )
  ) then
    raise exception 'demand skill is not active for the selected trade' using errcode = '23514';
  end if;
  if exists (
    select 1
      from unnest(coalesce(p_qualification_ids, '{}'::uuid[])) selected(qualification_id)
     where not exists (
       select 1 from qualification q
        where q.id = selected.qualification_id and q.is_active
     )
  ) then
    raise exception 'demand qualification is not active' using errcode = '23514';
  end if;

  v_before_data := to_jsonb(v_before) || jsonb_build_object(
    'skill_ids', coalesce((select jsonb_agg(link.skill_id order by link.skill_id)
      from demand_line_skill link where link.demand_line_id = p_line_id), '[]'::jsonb),
    'qualification_ids', coalesce((select jsonb_agg(link.qualification_id order by link.qualification_id)
      from demand_line_qualification link where link.demand_line_id = p_line_id), '[]'::jsonb)
  );

  update demand_line
     set quantity = p_quantity,
         start_date = p_start_date,
         end_date = p_end_date,
         hours_per_week = p_hours_per_week,
         notes = nullif(trim(p_notes), '')
   where id = p_line_id;

  delete from demand_line_skill where demand_line_id = p_line_id;
  insert into demand_line_skill (demand_line_id, skill_id)
  select p_line_id, skill_id from unnest(coalesce(p_skill_ids, '{}'::uuid[])) skill_id;

  delete from demand_line_qualification where demand_line_id = p_line_id;
  insert into demand_line_qualification (demand_line_id, qualification_id)
  select p_line_id, qualification_id
    from unnest(coalesce(p_qualification_ids, '{}'::uuid[])) qualification_id;

  select to_jsonb(line) into v_after from demand_line line where line.id = p_line_id;
  v_after := v_after || jsonb_build_object(
    'skill_ids', to_jsonb(coalesce(p_skill_ids, '{}'::uuid[])),
    'qualification_ids', to_jsonb(coalesce(p_qualification_ids, '{}'::uuid[]))
  );
  insert into audit_event (
    actor_user_id, actor_is_system, action, entity_type, entity_id,
    before_data, after_data
  ) values (
    v_actor, false, 'demand.line_edited', 'demand_line', p_line_id::text,
    v_before_data, v_after
  );

  return p_line_id;
end;
$$;

revoke all on function update_company_demand_line(
  uuid, integer, date, date, numeric, text, uuid[], uuid[]
) from public, anon, authenticated, service_role;
grant execute on function update_company_demand_line(
  uuid, integer, date, date, numeric, text, uuid[], uuid[]
) to authenticated;

-- =================================================================== worker create

create or replace function create_worker_transactional(
  p_company_id uuid,
  p_actor_user_id text,
  p_admin_entered boolean,
  p_evidence_note text,
  p_payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_status company_status;
  v_worker_id uuid;
  v_email text;
  v_mobile text;
  v_travel_region_ids uuid[];
  v_skill_ids uuid[];
begin
  if nullif(trim(coalesce(p_actor_user_id, '')), '') is null then
    raise exception 'an explicit actor is required' using errcode = '22023';
  end if;
  if coalesce(p_admin_entered, false)
     and length(trim(coalesce(p_evidence_note, ''))) < 10 then
    raise exception 'concierge evidence is required' using errcode = '22023';
  end if;
  if jsonb_typeof(p_payload) is distinct from 'object'
     or nullif(trim(p_payload ->> 'first_name'), '') is null
     or nullif(trim(p_payload ->> 'last_name'), '') is null
     or nullif(trim(p_payload ->> 'mobile'), '') is null
     or nullif(trim(p_payload ->> 'email'), '') is null
     or nullif(p_payload ->> 'base_region_id', '') is null
     or nullif(p_payload ->> 'primary_trade_id', '') is null
     or nullif(p_payload ->> 'primary_proficiency_id', '') is null
     or nullif(p_payload ->> 'start_date', '') is null
     or (p_payload ->> 'start_date') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
     or coalesce((p_payload ->> 'consent_confirmed')::boolean, false) is not true
     or (
       p_payload ? 'travel_region_ids'
       and jsonb_typeof(p_payload -> 'travel_region_ids') <> 'array'
     )
     or (
       p_payload ? 'skill_ids' and jsonb_typeof(p_payload -> 'skill_ids') <> 'array'
     ) then
    raise exception 'worker payload or consent is incomplete' using errcode = '22023';
  end if;

  select c.status into v_company_status
    from company c
   where c.id = p_company_id
   for share;
  if not found
     or v_company_status not in ('Pending'::company_status, 'Active'::company_status) then
    raise exception 'worker creation requires a Pending or Active company' using errcode = '42501';
  end if;

  v_email := lower(trim(p_payload ->> 'email'));
  v_mobile := regexp_replace(trim(p_payload ->> 'mobile'), '[-[:space:]().]', '', 'g');
  v_travel_region_ids := array(
    select value::uuid
      from jsonb_array_elements_text(coalesce(p_payload -> 'travel_region_ids', '[]'::jsonb))
  );
  v_skill_ids := array(
    select value::uuid
      from jsonb_array_elements_text(coalesce(p_payload -> 'skill_ids', '[]'::jsonb))
  );

  if cardinality(v_travel_region_ids) <> (
       select count(distinct region_id) from unnest(v_travel_region_ids) region_id
     )
     or cardinality(v_skill_ids) <> (
       select count(distinct skill_id) from unnest(v_skill_ids) skill_id
     ) then
    raise exception 'worker child ids must be unique' using errcode = '22023';
  end if;
  if not exists (
    select 1 from region r
     where r.id = (p_payload ->> 'base_region_id')::uuid and r.is_active
  ) or exists (
    select 1
      from unnest(v_travel_region_ids) selected(region_id)
     where not exists (
       select 1 from region r where r.id = selected.region_id and r.is_active
     )
  ) then
    raise exception 'worker region is not active' using errcode = '23514';
  end if;
  if not exists (
    select 1
      from trade_role_proficiency trp
      join trade_role tr on tr.id = trp.trade_role_id and tr.is_active
      join proficiency p on p.id = trp.proficiency_id and p.is_active
     where trp.trade_role_id = (p_payload ->> 'primary_trade_id')::uuid
       and trp.proficiency_id = (p_payload ->> 'primary_proficiency_id')::uuid
  ) then
    raise exception 'worker trade and proficiency are not a valid active pair'
      using errcode = '23514';
  end if;
  if exists (
    select 1
      from unnest(v_skill_ids) selected(skill_id)
     where not exists (
       select 1 from skill s
        where s.id = selected.skill_id
          and s.trade_role_id = (p_payload ->> 'primary_trade_id')::uuid
          and s.is_active
     )
  ) then
    raise exception 'worker skill is not active for the selected trade' using errcode = '23514';
  end if;

  if exists (
    select 1 from worker w where lower(w.email) = v_email or w.mobile = v_mobile
  ) then
    raise exception 'worker collision on email or mobile' using errcode = '23505';
  end if;

  begin
    insert into worker (
      first_name, last_name, mobile, email, base_region_id,
      primary_trade_id, primary_proficiency_id, status,
      proficiency_assigned_by, proficiency_overridden_by_maintain,
      proficiency_changed_at, consent_confirmed_by, consent_confirmed_at
    ) values (
      trim(p_payload ->> 'first_name'),
      trim(p_payload ->> 'last_name'),
      v_mobile,
      v_email,
      (p_payload ->> 'base_region_id')::uuid,
      (p_payload ->> 'primary_trade_id')::uuid,
      (p_payload ->> 'primary_proficiency_id')::uuid,
      'Active'::worker_status,
      trim(p_actor_user_id),
      false,
      now(),
      trim(p_actor_user_id),
      now()
    ) returning id into v_worker_id;
  exception when unique_violation then
    raise exception 'worker collision on email or mobile' using errcode = '23505';
  end;

  insert into worker_employment (worker_id, company_id, start_date)
  values (v_worker_id, p_company_id, (p_payload ->> 'start_date')::date);

  insert into worker_travel_region (worker_id, region_id)
  select v_worker_id, region_id from unnest(v_travel_region_ids) region_id;

  insert into worker_skill (worker_id, skill_id)
  select v_worker_id, skill_id from unnest(v_skill_ids) skill_id;

  insert into audit_event (
    actor_user_id, actor_is_system, action, entity_type, entity_id, after_data
  ) values (
    trim(p_actor_user_id),
    false,
    case when coalesce(p_admin_entered, false)
      then 'concierge.worker_created' else 'worker.created' end,
    'worker',
    v_worker_id::text,
    jsonb_build_object(
      'company_id', p_company_id,
      'admin_entered', coalesce(p_admin_entered, false),
      'evidence_note', case when coalesce(p_admin_entered, false) then trim(p_evidence_note) end,
      'primary_trade_id', p_payload ->> 'primary_trade_id',
      'primary_proficiency_id', p_payload ->> 'primary_proficiency_id',
      'proficiency_assigned_by', trim(p_actor_user_id),
      'consent_confirmed_by', trim(p_actor_user_id)
    )
  );

  return v_worker_id;
end;
$$;

revoke all on function create_worker_transactional(uuid, text, boolean, text, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function create_worker_transactional(uuid, text, boolean, text, jsonb)
  to service_role;
