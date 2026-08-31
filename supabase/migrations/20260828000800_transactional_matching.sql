-- Transactional matching state machine — modules 10.3, 11, 12, 13.1, 18 and 21.
--
-- Every authoritative match mutation is a service-role-only function. Application
-- code authenticates the human and supplies the actor; these functions lock and
-- re-read the marketplace facts, apply the state change and append its audit evidence
-- in one database transaction. Email remains a post-commit, non-blocking concern.

alter table match
  add column nomination_version integer not null default 0
  check (nomination_version >= 0);

-- The proposal selection is a feasibility shortlist, never an assignment. Persisting
-- it makes the proposal's server-validated evidence inspectable without abusing
-- match_worker, whose rows are supplier-owned nominations and soft holds.
create table match_shortlist_worker (
  match_id uuid not null references match(id) on delete cascade,
  worker_id uuid not null references worker(id),
  created_at timestamptz not null default now(),
  primary key (match_id, worker_id)
);

alter table match_shortlist_worker enable row level security;
revoke all on match_shortlist_worker from public, anon, authenticated;
grant select, insert, update, delete on match_shortlist_worker to service_role;

-- The displayed buyer shape is guarded by both quantity and this version. A same-size
-- substitution can change aggregate skills/ticket facts, so quantity alone is not a
-- sufficient acceptance token.
create or replace view buyer_match_view
as
select
  m.id,
  m.demand_line_id,
  m.status,
  m.requested_quantity,
  m.engagement_start,
  m.engagement_end,
  m.hours_per_week,
  m.buyer_rate_cents,
  m.proposed_at,
  (select count(*) from match_worker mw where mw.match_id = m.id and not mw.knocked_out)
    as nominated_count,
  m.nomination_version
from match m
where m.buyer_company_id = current_company_id()
  and m.status <> 'Awaiting Supplier';

create or replace view supplier_match_view
as
select
  m.id,
  m.capacity_line_id,
  m.status,
  m.requested_quantity,
  m.engagement_start,
  m.engagement_end,
  m.hours_per_week,
  m.supplier_rate_cents,
  m.proposed_at,
  m.qualification_override_by is not null as has_qualification_override,
  m.nomination_version
from match m
where m.supplier_company_id = current_company_id();

revoke all on buyer_match_view, supplier_match_view from public, anon, authenticated;
grant select on buyer_match_view, supplier_match_view to authenticated;

-- ---------------------------------------------------------------- eligibility helpers

create or replace function company_is_match_compliant(
  p_company_id uuid,
  p_effective_date date
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from company c
     where c.id = p_company_id
       and c.status = 'Active'
  )
  and not exists (
    select 1
      from company_document d
     where d.company_id = p_company_id
       and (
         d.status = 'Expired'
         or (d.expiry_date is not null and d.expiry_date < p_effective_date)
       )
       and not exists (
         select 1 from company_document renewal
          where renewal.company_id = d.company_id
            and renewal.doc_type = d.doc_type
            and renewal.qualification_id is not distinct from d.qualification_id
            and renewal.status <> 'Expired'
            and (renewal.expiry_date is null or renewal.expiry_date >= p_effective_date)
       )
       and (
         d.doc_type in ('public_liability', 'workers_comp')
         or exists (
           select 1
             from trade_role_qualification trq
             join worker w on w.primary_trade_id = trq.trade_role_id
             join worker_employment we
               on we.worker_id = w.id
              and we.company_id = p_company_id
              and we.end_date is null
            where trq.level = 'company'
              and trq.is_mandatory = true
              and trq.qualification_id = d.qualification_id
         )
       )
  );
$$;

revoke all on function company_is_match_compliant(uuid, date)
  from public, anon, authenticated;

-- NULL means eligible. A sentence means the selected worker is no longer a legal
-- proposal candidate. This mirrors the Excluded class plus the two grey conditions
-- that cannot be carried into a nomination without resolution/override.
create or replace function proposal_candidate_failure(
  p_demand_line_id uuid,
  p_capacity_line_id uuid,
  p_worker_id uuid,
  p_include_higher_proficiency boolean,
  p_qualification_override boolean,
  p_effective_date date
)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_demand record;
  v_capacity record;
  v_worker worker%rowtype;
  v_window daterange;
begin
  select dl.*, dr.work_region_id
    into v_demand
    from demand_line dl
    join demand_request dr on dr.id = dl.request_id
   where dl.id = p_demand_line_id;
  if not found then return 'the demand line no longer exists'; end if;

  select cl.*, p.rank as proficiency_rank
    into v_capacity
    from capacity_line cl
    join proficiency p on p.id = cl.proficiency_id
   where cl.id = p_capacity_line_id;
  if not found then return 'the capacity line no longer exists'; end if;

  select * into v_worker from worker where id = p_worker_id;
  if not found then return 'the worker no longer exists'; end if;

  if v_demand.status not in ('Open', 'Partially Filled')
     or v_demand.end_date < p_effective_date then
    return 'the demand line is no longer open';
  end if;
  if v_capacity.status not in ('Open', 'Partially Committed', 'Fully Committed')
     or v_capacity.available_until < p_effective_date then
    return 'the capacity line is no longer live';
  end if;
  if not company_is_match_compliant(v_demand.company_id, p_effective_date)
     or not company_is_match_compliant(v_capacity.company_id, p_effective_date) then
    return 'one of the companies is not Active and compliant';
  end if;
  if v_capacity.company_id = v_demand.company_id then
    return 'a company cannot match with itself';
  end if;
  if v_capacity.trade_role_id <> v_demand.trade_role_id then
    return 'the trade no longer matches';
  end if;
  if v_capacity.proficiency_id <> v_demand.proficiency_id then
    if not p_include_higher_proficiency
       or v_capacity.proficiency_rank <= (
         select p.rank from proficiency p where p.id = v_demand.proficiency_id
       ) then
      return 'the proficiency no longer matches the selected level';
    end if;
  end if;
  if not exists (
    select 1 from trade_role_proficiency trp
     where trp.trade_role_id = v_capacity.trade_role_id
       and trp.proficiency_id = v_capacity.proficiency_id
  ) then
    return 'the capacity classification is not in the active trade catalogue';
  end if;
  if v_capacity.available_from > v_demand.end_date
     or v_capacity.available_until < v_demand.start_date then
    return 'the capacity and demand windows no longer intersect';
  end if;
  if v_capacity.location_region_id <> v_demand.work_region_id
     and not exists (
       select 1 from capacity_line_travel_region ctr
        where ctr.capacity_line_id = p_capacity_line_id
          and ctr.region_id = v_demand.work_region_id
     ) then
    return 'the work region is not covered by the capacity line';
  end if;
  if v_capacity.supplier_rate_cents <= 0 or v_capacity.hours_per_week <= 0 then
    return 'the capacity line has no valid confirmed rate or hours';
  end if;
  if v_worker.status <> 'Active' then return 'the worker is not Active'; end if;
  if v_worker.primary_trade_id <> v_capacity.trade_role_id
     or v_worker.primary_proficiency_id <> v_capacity.proficiency_id then
    return 'the worker classification no longer matches the capacity line';
  end if;
  if not exists (
    select 1 from capacity_line_worker clw
     where clw.capacity_line_id = p_capacity_line_id
       and clw.worker_id = p_worker_id
  ) then
    return 'the worker is no longer attached to the capacity line';
  end if;
  if not exists (
    select 1 from worker_employment we
     where we.worker_id = p_worker_id
       and we.company_id = v_capacity.company_id
       and we.end_date is null
  ) then
    return 'the worker is no longer employed by the supplying business';
  end if;

  v_window := daterange(
    greatest(v_demand.start_date, v_capacity.available_from),
    least(v_demand.end_date, v_capacity.available_until),
    '[]'
  );

  if exists (
    select 1
      from demand_line_qualification dlq
     where dlq.demand_line_id = p_demand_line_id
       and not exists (
         select 1 from worker_qualification wq
          where wq.worker_id = p_worker_id
            and wq.qualification_id = dlq.qualification_id
            and wq.status <> 'Expired'
            and (wq.expiry_date is null or wq.expiry_date >= greatest(v_demand.start_date, p_effective_date))
       )
  ) then
    return 'a required qualification is missing or expires before the demand starts';
  end if;
  if not p_qualification_override and exists (
    select 1
      from demand_line_qualification dlq
     where dlq.demand_line_id = p_demand_line_id
       and not exists (
         select 1 from worker_qualification wq
          where wq.worker_id = p_worker_id and wq.qualification_id = dlq.qualification_id
            and wq.status <> 'Expired'
            and (wq.expiry_date is null or wq.expiry_date >= greatest(upper(v_window) - 1, p_effective_date))
       )
  ) then
    return 'a required qualification expires inside the proposed window without an override';
  end if;
  if exists (
    select 1 from trade_role_qualification trq
    join worker_qualification wq
      on wq.qualification_id = trq.qualification_id and wq.worker_id = p_worker_id
    where trq.trade_role_id = v_worker.primary_trade_id
      and trq.level = 'worker' and trq.is_mandatory
      and (wq.status = 'Expired' or wq.expiry_date < p_effective_date)
      and not exists (
        select 1 from worker_qualification renewal
         where renewal.worker_id = wq.worker_id and renewal.qualification_id = wq.qualification_id
           and renewal.status <> 'Expired'
           and (renewal.expiry_date is null or renewal.expiry_date >= p_effective_date)
      )
  ) then
    return 'a mandatory worker qualification has expired';
  end if;
  -- 21.2: Excluded means zero availability across the worker's entire live
  -- capacity union in the demand window, not zero on this candidate line alone.
  -- A line-specific hard overlap is still rejected when nominating below.
  if not exists (
    select 1
      from generate_series(v_demand.start_date::timestamp, v_demand.end_date::timestamp, interval '1 day') day
     where exists (
       select 1 from capacity_line_worker clw
       join capacity_line cl on cl.id = clw.capacity_line_id
        where clw.worker_id = p_worker_id
          and cl.status in ('Open', 'Partially Committed', 'Fully Committed')
          and daterange(cl.available_from, cl.available_until, '[]') @> day::date
     )
       and not exists (
         select 1 from engagement_worker ew
          where ew.worker_id = p_worker_id
            and ew.status in ('Awaiting Commercial', 'Confirmed', 'Active')
            and ew.committed_window @> day::date
       )
  ) then
    return 'the worker has no uncommitted day across its live capacity in the demand window';
  end if;
  if exists (
    select 1 from engagement_worker ew
     where ew.worker_id = p_worker_id
       and ew.status in ('Awaiting Commercial', 'Confirmed', 'Active')
       and ew.committed_window && v_window
  ) then
    if not p_qualification_override then
      return 'the partially committed candidate requires an audited shortlist override';
    end if;
  end if;
  if not p_qualification_override and exists (
    select 1 from match_worker mw join match m on m.id = mw.match_id
     where mw.worker_id = p_worker_id and not mw.knocked_out
       and m.status in ('Awaiting Supplier', 'Awaiting Buyer')
       and daterange(m.engagement_start, m.engagement_end, '[]') && v_window
  ) then
    return 'the soft-held candidate requires an audited shortlist override';
  end if;

  return null;
end;
$$;

revoke all on function proposal_candidate_failure(
  uuid, uuid, uuid, boolean, boolean, date
) from public, anon, authenticated;

create or replace function match_nomination_failure(
  p_match_id uuid,
  p_worker_id uuid,
  p_effective_date date
)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_match match%rowtype;
  v_line capacity_line%rowtype;
  v_worker worker%rowtype;
begin
  select * into v_match from match where id = p_match_id;
  if not found then return 'the match no longer exists'; end if;
  select * into v_line from capacity_line where id = v_match.capacity_line_id;
  if not found then return 'the capacity line no longer exists'; end if;
  select * into v_worker from worker where id = p_worker_id;
  if not found then return 'the worker no longer exists'; end if;

  if not company_is_match_compliant(v_match.supplier_company_id, p_effective_date)
     or not company_is_match_compliant(v_match.buyer_company_id, p_effective_date) then
    return 'one of the companies is not Active and compliant';
  end if;
  if v_line.company_id is distinct from v_match.supplier_company_id then
    return 'the capacity source no longer belongs to the supplying business';
  end if;
  if v_line.status not in ('Open', 'Partially Committed', 'Fully Committed')
     or v_line.available_until < p_effective_date
     or v_line.available_from > v_match.engagement_start
     or v_line.available_until < v_match.engagement_end then
    return 'the capacity line is no longer live';
  end if;
  if not exists (
    select 1 from demand_line dl
     where dl.id = v_match.demand_line_id
       and dl.company_id = v_match.buyer_company_id
       and dl.status in ('Open', 'Partially Filled')
       and dl.end_date >= p_effective_date
       and dl.start_date <= v_match.engagement_start and dl.end_date >= v_match.engagement_end
  ) then
    return 'the demand line is no longer open';
  end if;
  if v_worker.status <> 'Active' then return 'the worker is not Active'; end if;
  if not exists (
    select 1 from capacity_line_worker clw
     where clw.capacity_line_id = v_match.capacity_line_id
       and clw.worker_id = p_worker_id
  ) then
    return 'the worker is not attached to this capacity line';
  end if;
  if not exists (
    select 1 from worker_employment we
     where we.worker_id = p_worker_id
       and we.company_id = v_match.supplier_company_id
       and we.end_date is null
  ) then
    return 'the worker is not currently employed by the supplying business';
  end if;
  if v_worker.primary_trade_id <> v_line.trade_role_id
     or v_worker.primary_proficiency_id <> v_line.proficiency_id then
    return 'the worker classification no longer matches the proposal';
  end if;
  if exists (
    select 1
      from demand_line_qualification dlq
     where dlq.demand_line_id = v_match.demand_line_id
       and not exists (
         select 1 from worker_qualification wq
          where wq.worker_id = p_worker_id
            and wq.qualification_id = dlq.qualification_id
            and wq.status <> 'Expired'
            and (wq.expiry_date is null or wq.expiry_date >= greatest(v_match.engagement_start, p_effective_date))
            and (
              wq.expiry_date is null
              or wq.expiry_date >= v_match.engagement_end
              or v_match.qualification_override_by is not null
            )
       )
  ) then
    return 'a required qualification is missing, expired or lacks the required override';
  end if;
  if exists (
    select 1 from trade_role_qualification trq
    join worker_qualification wq
      on wq.qualification_id = trq.qualification_id and wq.worker_id = p_worker_id
    where trq.trade_role_id = v_worker.primary_trade_id
      and trq.level = 'worker' and trq.is_mandatory
      and (wq.status = 'Expired' or wq.expiry_date < p_effective_date)
      and not exists (
        select 1 from worker_qualification renewal
         where renewal.worker_id = wq.worker_id and renewal.qualification_id = wq.qualification_id
           and renewal.status <> 'Expired'
           and (renewal.expiry_date is null or renewal.expiry_date >= p_effective_date)
      )
  ) then
    return 'a mandatory worker qualification has expired';
  end if;
  if exists (
    select 1 from engagement_worker ew
     where ew.worker_id = p_worker_id
       and ew.status in ('Awaiting Commercial', 'Confirmed', 'Active')
       and ew.committed_window && daterange(
         v_match.engagement_start,
         v_match.engagement_end,
         '[]'
       )
  ) then
    return 'the worker already has a committing engagement in this window';
  end if;

  return null;
end;
$$;

revoke all on function match_nomination_failure(uuid, uuid, date)
  from public, anon, authenticated;

-- Same authoritative rules power the supplier's pool display and the write RPCs.
create or replace function check_match_nominations(p_match_id uuid,p_worker_ids uuid[],p_effective_date date)
returns jsonb language sql stable security definer set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object('worker_id',worker_id,'reason',reason)), '[]'::jsonb)
  from (
    select worker_id,match_nomination_failure(p_match_id,worker_id,p_effective_date) as reason
    from (select distinct unnest(p_worker_ids) as worker_id) workers
  ) failures
  where reason is not null;
$$;
revoke all on function check_match_nominations(uuid,uuid[],date) from public, anon, authenticated, service_role;
grant execute on function check_match_nominations(uuid,uuid[],date) to service_role;
grant execute on function company_is_match_compliant(uuid,date) to service_role;

-- Outer marketplace entrypoints lock their complete company set first. Callers
-- which close/knock out matches in a larger transaction must do this before any
-- worker, demand or capacity lock and retry if a new counterparty appears.
create or replace function lock_match_companies(p_company_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expected_count integer;
  v_locked_count integer;
begin
  if p_company_ids is null or array_position(p_company_ids, null) is not null then
    raise exception 'company lock identifiers must not be null' using errcode = '22004';
  end if;
  select count(distinct id) into v_expected_count from unnest(p_company_ids) id;
  perform c.id from company c where c.id = any(p_company_ids)
    order by c.id for share;
  get diagnostics v_locked_count = row_count;
  if v_locked_count <> v_expected_count then
    raise exception 'a company no longer exists' using errcode = '23503';
  end if;
end;
$$;
revoke all on function lock_match_companies(uuid[]) from public, anon, authenticated;
grant execute on function lock_match_companies(uuid[]) to service_role;

create or replace function lock_match_workers(p_worker_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_worker_id uuid;
begin
  for v_worker_id in
    select distinct worker_id
      from unnest(coalesce(p_worker_ids, '{}'::uuid[])) worker_id
     order by worker_id
  loop
    -- Advisory ordering serialises two buyer acceptances before either owns a match
    -- row. The worker row lock also coordinates with status/transfer transactions.
    perform pg_advisory_xact_lock(hashtext(v_worker_id::text));
    perform 1 from worker where id = v_worker_id for update;
  end loop;
end;
$$;

revoke all on function lock_match_workers(uuid[]) from public, anon, authenticated;

-- ---------------------------------------------------------------- 11.3 proposal

create or replace function propose_matches_atomic(
  p_demand_line_id uuid,
  p_candidates jsonb,
  p_include_higher_proficiency boolean,
  p_qualification_override boolean,
  p_override_evidence_note text,
  p_actor_user_id text,
  p_effective_date date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_demand record;
  v_candidate record;
  v_group record;
  v_line capacity_line%rowtype;
  v_failure text;
  v_fee_bp integer;
  v_minimum_crew_size integer;
  v_minimum_hours_per_line integer;
  v_selected_count integer;
  v_filled integer;
  v_pending integer;
  v_match_id uuid;
  v_buyer_rate bigint;
  v_matches jsonb := '[]'::jsonb;
  v_worker_ids uuid[];
  v_company_ids uuid[];
  v_initial_buyer uuid;
  v_supplier_sources jsonb;
begin
  if nullif(trim(p_actor_user_id), '') is null then
    raise exception 'a Maintain actor is required' using errcode = '42501';
  end if;
  if p_effective_date is null then
    raise exception 'an effective Brisbane date is required' using errcode = '22004';
  end if;
  if p_candidates is null or jsonb_typeof(p_candidates) <> 'array' or jsonb_array_length(p_candidates) = 0 then
    raise exception 'at least one candidate is required' using errcode = '23514';
  end if;

  select company_id into v_initial_buyer from demand_line where id = p_demand_line_id;
  if not found then raise exception 'demand line does not exist' using errcode = '23503'; end if;
  select coalesce(jsonb_object_agg(cl.id::text, cl.company_id::text), '{}'::jsonb)
    into v_supplier_sources from capacity_line cl
   where cl.id in (select c.capacity_line_id from jsonb_to_recordset(p_candidates) as c(capacity_line_id uuid));
  select array_agg(distinct company_id order by company_id) into v_company_ids from (
    select v_initial_buyer as company_id
    union select value::uuid from jsonb_each_text(v_supplier_sources)
  ) companies;
  perform lock_match_companies(v_company_ids);

  select array_agg(candidate.worker_id order by candidate.worker_id)
    into v_worker_ids
    from jsonb_to_recordset(p_candidates) as candidate(capacity_line_id uuid, worker_id uuid);
  perform lock_match_workers(v_worker_ids);
  if p_qualification_override
     and length(trim(coalesce(p_override_evidence_note, ''))) < 10 then
    raise exception 'qualification override evidence is required' using errcode = '23514';
  end if;

  select dl.*, dr.work_region_id
    into v_demand
    from demand_line dl
    join demand_request dr on dr.id = dl.request_id
   where dl.id = p_demand_line_id
   for update of dl;
  if not found then
    raise exception 'demand line does not exist' using errcode = '23503';
  end if;
  if v_demand.company_id is distinct from v_initial_buyer then
    raise exception 'demand ownership changed during lock acquisition' using errcode = '40001';
  end if;
  if v_demand.status not in ('Open', 'Partially Filled')
     or v_demand.end_date < p_effective_date then
    raise exception 'demand line is no longer open for proposals' using errcode = '40001';
  end if;
  if not company_is_match_compliant(v_demand.company_id, p_effective_date) then
    raise exception 'the hiring business is not Active and compliant' using errcode = '23514';
  end if;

  select value_int::integer into v_fee_bp
    from platform_config where key = 'fee_bp' for share;
  select value_int::integer into v_minimum_crew_size
    from platform_config where key = 'minimum_crew_size' for share;
  select value_int::integer into v_minimum_hours_per_line
    from platform_config where key = 'minimum_hours_per_line' for share;
  if v_fee_bp is null or v_fee_bp < 0 or v_fee_bp > 10000 then
    raise exception 'current platform fee is invalid' using errcode = '23514';
  end if;
  if coalesce(v_minimum_crew_size, 0) <= 0
     or coalesce(v_minimum_hours_per_line, 0) <= 0 then
    raise exception 'booking minimums are not configured' using errcode = '23514';
  end if;
  if v_demand.quantity < v_minimum_crew_size
     or v_demand.hours_per_week
        * ((v_demand.end_date - v_demand.start_date + 1)::numeric / 7)
        < v_minimum_hours_per_line then
    raise exception 'demand line no longer satisfies booking minimums' using errcode = '23514';
  end if;

  select count(*), count(distinct (candidate.capacity_line_id, candidate.worker_id))
    into v_selected_count, v_pending
    from jsonb_to_recordset(p_candidates)
      as candidate(capacity_line_id uuid, worker_id uuid);
  if v_selected_count <> v_pending then
    raise exception 'candidate selections must be unique' using errcode = '23514';
  end if;

  -- Keep eligibility and the later rate/window snapshots on the same capacity
  -- revision. Intake edits take an exclusive line lock and then recheck whether
  -- a proposal exists, so neither transaction can validate stale line fields.
  perform cl.id
    from capacity_line cl
   where cl.id in (
     select candidate.capacity_line_id
       from jsonb_to_recordset(p_candidates)
         as candidate(capacity_line_id uuid, worker_id uuid)
   )
   order by cl.id
   for share of cl;
  if exists (
    select 1 from capacity_line cl
     where cl.id in (select c.capacity_line_id from jsonb_to_recordset(p_candidates) as c(capacity_line_id uuid))
       and (v_supplier_sources ->> cl.id::text) is distinct from cl.company_id::text
  ) then
    raise exception 'capacity ownership changed during lock acquisition' using errcode = '40001';
  end if;

  for v_candidate in
    select candidate.capacity_line_id, candidate.worker_id
      from jsonb_to_recordset(p_candidates)
        as candidate(capacity_line_id uuid, worker_id uuid)
     order by candidate.capacity_line_id, candidate.worker_id
  loop
    if v_candidate.capacity_line_id is null or v_candidate.worker_id is null then
      raise exception 'candidate identifiers are required' using errcode = '23514';
    end if;
    v_failure := proposal_candidate_failure(
      p_demand_line_id,
      v_candidate.capacity_line_id,
      v_candidate.worker_id,
      p_include_higher_proficiency,
      p_qualification_override,
      p_effective_date
    );
    if v_failure is not null then
      raise exception 'selected candidate is no longer eligible: %', v_failure
        using errcode = '23514';
    end if;
  end loop;

  select count(distinct ew.worker_id)::integer
    into v_filled
    from engagement e
    join engagement_worker ew on ew.engagement_id = e.id
   where e.demand_line_id = p_demand_line_id
     and e.status in ('Awaiting Commercial', 'Confirmed', 'Active')
     and ew.status in ('Awaiting Commercial', 'Confirmed', 'Active');

  select coalesce(sum(
    case
      when m.status = 'Awaiting Supplier' then m.requested_quantity
      else (
        select count(*) from match_worker mw
         where mw.match_id = m.id and mw.knocked_out = false
      )
    end
  ), 0)::integer
    into v_pending
    from match m
   where m.demand_line_id = p_demand_line_id
     and m.status in ('Awaiting Supplier', 'Awaiting Buyer');

  if v_filled + v_pending + v_selected_count > v_demand.quantity then
    raise exception 'proposal exceeds the locked filled and pending demand budget'
      using errcode = '40001';
  end if;

  for v_group in
    select
      candidate.capacity_line_id,
      count(*)::integer as requested_quantity,
      jsonb_agg(candidate.worker_id order by candidate.worker_id) as worker_ids
    from jsonb_to_recordset(p_candidates)
      as candidate(capacity_line_id uuid, worker_id uuid)
    group by candidate.capacity_line_id
    order by candidate.capacity_line_id
  loop
    if v_group.requested_quantity < v_minimum_crew_size then
      raise exception 'each proposed match must meet the minimum crew size'
        using errcode = '23514';
    end if;

    select * into v_line
      from capacity_line
     where id = v_group.capacity_line_id
     for share;
    if not found then
      raise exception 'capacity line disappeared during proposal' using errcode = '40001';
    end if;
    if nullif(trim(v_line.rate_entered_by), '') is null then
      raise exception 'the supplier rate must be confirmed before a proposal' using errcode = '23514';
    end if;
    if v_demand.hours_per_week * (
      (least(v_demand.end_date, v_line.available_until) - greatest(v_demand.start_date, v_line.available_from) + 1)::numeric / 7
    ) < v_minimum_hours_per_line then
      raise exception 'the intersected match window does not satisfy booking minimums' using errcode = '23514';
    end if;

    v_buyer_rate := floor(
      (v_line.supplier_rate_cents::numeric * (10000 + v_fee_bp) + 5000) / 10000
    )::bigint;

    insert into match (
      demand_line_id,
      supplier_company_id,
      buyer_company_id,
      capacity_line_id,
      requested_quantity,
      trade_role_id,
      proficiency_id,
      work_region_id,
      engagement_start,
      engagement_end,
      hours_per_week,
      supplier_rate_cents,
      fee_bp,
      buyer_rate_cents,
      status,
      qualification_override_by,
      qualification_override_at,
      evidence_note
    ) values (
      p_demand_line_id,
      v_line.company_id,
      v_demand.company_id,
      v_line.id,
      v_group.requested_quantity,
      v_demand.trade_role_id,
      v_demand.proficiency_id,
      v_demand.work_region_id,
      greatest(v_demand.start_date, v_line.available_from),
      least(v_demand.end_date, v_line.available_until),
      v_demand.hours_per_week,
      v_line.supplier_rate_cents,
      v_fee_bp,
      v_buyer_rate,
      'Awaiting Supplier',
      case when p_qualification_override then p_actor_user_id end,
      case when p_qualification_override then now() end,
      case
        when p_qualification_override
          then 'Ticket-expiry override recorded: ' || trim(p_override_evidence_note)
      end
    ) returning id into v_match_id;

    insert into match_shortlist_worker (match_id, worker_id)
    select v_match_id, worker_id
      from jsonb_array_elements_text(v_group.worker_ids) worker(worker_id_text)
      cross join lateral (select worker.worker_id_text::uuid as worker_id) parsed;

    insert into audit_event (
      actor_user_id, actor_is_system, action, entity_type, entity_id, after_data
    ) values (
      p_actor_user_id,
      false,
      'match.created',
      'match',
      v_match_id,
      jsonb_build_object(
        'demand_line_id', p_demand_line_id,
        'capacity_line_id', v_line.id,
        'supplier_company_id', v_line.company_id,
        'buyer_company_id', v_demand.company_id,
        'requested_quantity', v_group.requested_quantity,
        'shortlisted_worker_ids', v_group.worker_ids,
        'engagement_start', greatest(v_demand.start_date, v_line.available_from),
        'engagement_end', least(v_demand.end_date, v_line.available_until),
        'supplier_rate_cents', v_line.supplier_rate_cents,
        'fee_bp', v_fee_bp,
        'buyer_rate_cents', v_buyer_rate,
        'qualification_override', p_qualification_override,
        'override_evidence_note', nullif(trim(p_override_evidence_note), '')
      )
    );

    v_matches := v_matches || jsonb_build_array(jsonb_build_object(
      'match_id', v_match_id,
      'supplier_company_id', v_line.company_id,
      'buyer_company_id', v_demand.company_id
    ));
  end loop;

  return jsonb_build_object('matches', v_matches);
end;
$$;

revoke all on function propose_matches_atomic(
  uuid, jsonb, boolean, boolean, text, text, date
) from public, anon, authenticated, service_role;
grant execute on function propose_matches_atomic(
  uuid, jsonb, boolean, boolean, text, text, date
) to service_role;

-- ---------------------------------------------------------------- 12.2 supplier response

create or replace function accept_match_as_supplier(
  p_match_id uuid,
  p_expected_status match_status,
  p_worker_ids uuid[],
  p_supplier_company_id uuid,
  p_actor_user_id text,
  p_admin_entered boolean,
  p_evidence_note text,
  p_effective_date date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match match%rowtype;
  v_initial_match match%rowtype;
  v_demand_id uuid;
  v_failure text;
  v_worker_id uuid;
  v_worker_count integer;
  v_minimum_crew_size integer;
begin
  if nullif(trim(p_actor_user_id), '') is null then
    raise exception 'a human actor is required' using errcode = '42501';
  end if;
  if p_admin_entered and length(trim(coalesce(p_evidence_note, ''))) < 10 then
    raise exception 'concierge evidence is required' using errcode = '23514';
  end if;
  if p_expected_status <> 'Awaiting Supplier' then
    raise exception 'supplier acceptance requires the Awaiting Supplier CAS'
      using errcode = '23514';
  end if;
  if p_effective_date is null then
    raise exception 'an effective Brisbane date is required' using errcode = '22004';
  end if;

  select count(*), count(distinct worker_id)
    into v_worker_count, v_minimum_crew_size
    from unnest(coalesce(p_worker_ids, '{}'::uuid[])) worker_id;
  if v_worker_count = 0 or v_worker_count <> v_minimum_crew_size then
    raise exception 'nominations must be a non-empty unique worker set'
      using errcode = '23514';
  end if;

  select * into v_initial_match from match where id = p_match_id;
  if not found then raise exception 'match does not exist' using errcode = '23503'; end if;
  perform lock_match_companies(array[v_initial_match.supplier_company_id, v_initial_match.buyer_company_id]);
  perform lock_match_workers(p_worker_ids);
  v_demand_id := v_initial_match.demand_line_id;
  perform 1 from demand_line where id = v_demand_id for update;

  select * into v_match
    from match
   where id = p_match_id
     and status = p_expected_status
   for update;
  if not found then
    raise exception 'match status changed; refresh before retrying' using errcode = '40001';
  end if;
  if (v_match.supplier_company_id, v_match.buyer_company_id, v_match.demand_line_id, v_match.capacity_line_id)
     is distinct from (v_initial_match.supplier_company_id, v_initial_match.buyer_company_id,
       v_initial_match.demand_line_id, v_initial_match.capacity_line_id) then
    raise exception 'match source changed during lock acquisition' using errcode = '40001';
  end if;
  if p_admin_entered is null then raise exception 'decision source is required' using errcode = '23514'; end if;
  if not p_admin_entered and v_match.supplier_company_id is distinct from p_supplier_company_id then
    raise exception 'the supplying business does not own this match' using errcode = '42501';
  end if;
  if p_admin_entered and p_supplier_company_id is not null
     and v_match.supplier_company_id <> p_supplier_company_id then
    raise exception 'concierge supplier does not match the proposal' using errcode = '42501';
  end if;

  select value_int::integer into v_minimum_crew_size
    from platform_config where key = 'minimum_crew_size' for share;
  if coalesce(v_minimum_crew_size, 0) <= 0 then
    raise exception 'minimum crew size is not configured' using errcode = '23514';
  end if;
  if v_worker_count < v_minimum_crew_size
     or v_worker_count > v_match.requested_quantity then
    raise exception 'nominated crew must meet the minimum and requested quantity'
      using errcode = '23514';
  end if;

  foreach v_worker_id in array p_worker_ids loop
    v_failure := match_nomination_failure(p_match_id, v_worker_id, p_effective_date);
    if v_failure is not null then
      raise exception 'nomination is no longer eligible: %', v_failure using errcode = '23514';
    end if;
  end loop;

  delete from match_worker where match_id = p_match_id;
  insert into match_worker (match_id, worker_id)
  select p_match_id, worker_id
    from unnest(p_worker_ids) worker_id
   order by worker_id;

  update match
     set status = 'Awaiting Buyer',
         supplier_decided_at = now(),
         nomination_version = nomination_version + 1,
         admin_entered = admin_entered or p_admin_entered,
         evidence_note = case
           when p_admin_entered then concat_ws(
             E'\n',
             nullif(evidence_note, ''),
             'Supplier acceptance recorded: ' || trim(p_evidence_note)
           )
           else evidence_note
         end
   where id = p_match_id;

  update capacity_line
     set rate_ratified_at = coalesce(rate_ratified_at, now())
   where id = v_match.capacity_line_id;

  insert into audit_event (
    actor_user_id, actor_is_system, action, entity_type, entity_id,
    before_data, after_data
  ) values (
    p_actor_user_id,
    false,
    case
      when p_admin_entered then 'match.supplier_accepted.admin_entered'
      else 'match.supplier_accepted'
    end,
    'match',
    p_match_id,
    jsonb_build_object('status', v_match.status, 'nomination_version', v_match.nomination_version),
    jsonb_build_object(
      'status', 'Awaiting Buyer',
      'nominated_worker_ids', to_jsonb(p_worker_ids),
      'nomination_version', v_match.nomination_version + 1,
      'rate_ratified', true,
      'admin_entered', p_admin_entered,
      'evidence_note', nullif(trim(p_evidence_note), '')
    )
  );

  return jsonb_build_object(
    'match_id', p_match_id,
    'supplier_company_id', v_match.supplier_company_id,
    'buyer_company_id', v_match.buyer_company_id,
    'nominated_count', v_worker_count,
    'nomination_version', v_match.nomination_version + 1
  );
end;
$$;

revoke all on function accept_match_as_supplier(
  uuid, match_status, uuid[], uuid, text, boolean, text, date
) from public, anon, authenticated, service_role;
grant execute on function accept_match_as_supplier(
  uuid, match_status, uuid[], uuid, text, boolean, text, date
) to service_role;

create or replace function substitute_match_nominations(
  p_match_id uuid,
  p_expected_status match_status,
  p_expected_nomination_version integer,
  p_worker_ids uuid[],
  p_supplier_company_id uuid,
  p_actor_user_id text,
  p_effective_date date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match match%rowtype;
  v_initial_match match%rowtype;
  v_demand demand_line%rowtype;
  v_current_worker_ids uuid[];
  v_lock_worker_ids uuid[];
  v_failure text;
  v_worker_id uuid;
  v_worker_count integer;
  v_unique_count integer;
  v_minimum_crew_size integer;
  v_filled integer;
  v_other_pending integer;
begin
  if nullif(trim(p_actor_user_id), '') is null then
    raise exception 'a supplier actor is required' using errcode = '42501';
  end if;
  if p_expected_status <> 'Awaiting Buyer' then
    raise exception 'substitution requires the Awaiting Buyer CAS' using errcode = '23514';
  end if;
  if p_effective_date is null then
    raise exception 'an effective Brisbane date is required' using errcode = '22004';
  end if;

  select count(*), count(distinct worker_id)
    into v_worker_count, v_unique_count
    from unnest(coalesce(p_worker_ids, '{}'::uuid[])) worker_id;
  if v_worker_count = 0 or v_worker_count <> v_unique_count then
    raise exception 'nominations must be a non-empty unique worker set'
      using errcode = '23514';
  end if;

  select * into v_initial_match from match where id = p_match_id;
  if not found then raise exception 'match does not exist' using errcode = '23503'; end if;
  perform lock_match_companies(array[v_initial_match.supplier_company_id, v_initial_match.buyer_company_id]);
  select array_agg(worker_id order by worker_id)
    into v_current_worker_ids
    from match_worker
   where match_id = p_match_id and knocked_out = false;
  select array_agg(distinct worker_id order by worker_id)
    into v_lock_worker_ids
    from unnest(
      coalesce(v_current_worker_ids, '{}'::uuid[])
      || coalesce(p_worker_ids, '{}'::uuid[])
    ) worker_id;
  perform lock_match_workers(v_lock_worker_ids);

  select * into v_demand from demand_line where id = v_initial_match.demand_line_id for update;

  select * into v_match
    from match
   where id = p_match_id
     and status = p_expected_status
     and nomination_version = p_expected_nomination_version
   for update;
  if not found then
    raise exception 'the proposal changed; refresh before substituting'
      using errcode = '40001';
  end if;
  if (v_match.supplier_company_id, v_match.buyer_company_id, v_match.demand_line_id, v_match.capacity_line_id)
     is distinct from (v_initial_match.supplier_company_id, v_initial_match.buyer_company_id,
       v_initial_match.demand_line_id, v_initial_match.capacity_line_id) then
    raise exception 'match source changed during lock acquisition' using errcode = '40001';
  end if;
  if v_match.supplier_company_id is distinct from p_supplier_company_id then
    raise exception 'the supplying business does not own this match' using errcode = '42501';
  end if;

  select value_int::integer into v_minimum_crew_size
    from platform_config where key = 'minimum_crew_size' for share;
  if v_worker_count < coalesce(v_minimum_crew_size, 1)
     or v_worker_count > v_match.requested_quantity then
    raise exception 'replacement crew must meet the minimum and requested quantity'
      using errcode = '23514';
  end if;

  foreach v_worker_id in array p_worker_ids loop
    v_failure := match_nomination_failure(p_match_id, v_worker_id, p_effective_date);
    if v_failure is not null then
      raise exception 'replacement nomination is no longer eligible: %', v_failure
        using errcode = '23514';
    end if;
  end loop;

  select count(distinct ew.worker_id)::integer
    into v_filled
    from engagement e
    join engagement_worker ew on ew.engagement_id = e.id
   where e.demand_line_id = v_match.demand_line_id
     and e.status in ('Awaiting Commercial', 'Confirmed', 'Active')
     and ew.status in ('Awaiting Commercial', 'Confirmed', 'Active');
  select coalesce(sum(
    case
      when m.status = 'Awaiting Supplier' then m.requested_quantity
      else (select count(*) from match_worker mw where mw.match_id = m.id and not mw.knocked_out)
    end
  ), 0)::integer
    into v_other_pending
    from match m
   where m.demand_line_id = v_match.demand_line_id
     and m.id <> p_match_id
     and m.status in ('Awaiting Supplier', 'Awaiting Buyer');
  if v_filled + v_other_pending + v_worker_count > v_demand.quantity then
    raise exception 'replacement crew exceeds the locked demand budget'
      using errcode = '40001';
  end if;

  delete from match_worker where match_id = p_match_id;
  insert into match_worker (match_id, worker_id)
  select p_match_id, worker_id from unnest(p_worker_ids) worker_id order by worker_id;

  update match
     set nomination_version = nomination_version + 1
   where id = p_match_id;

  insert into audit_event (
    actor_user_id, actor_is_system, action, entity_type, entity_id,
    before_data, after_data
  ) values (
    p_actor_user_id,
    false,
    'match.nominations_substituted',
    'match',
    p_match_id,
    jsonb_build_object(
      'worker_ids', to_jsonb(coalesce(v_current_worker_ids, '{}'::uuid[])),
      'nomination_version', v_match.nomination_version
    ),
    jsonb_build_object(
      'worker_ids', to_jsonb(p_worker_ids),
      'nomination_version', v_match.nomination_version + 1
    )
  );

  return jsonb_build_object(
    'match_id', p_match_id,
    'supplier_company_id', v_match.supplier_company_id,
    'buyer_company_id', v_match.buyer_company_id,
    'nominated_count', v_worker_count,
    'nomination_version', v_match.nomination_version + 1
  );
end;
$$;

revoke all on function substitute_match_nominations(
  uuid, match_status, integer, uuid[], uuid, text, date
) from public, anon, authenticated, service_role;
grant execute on function substitute_match_nominations(
  uuid, match_status, integer, uuid[], uuid, text, date
) to service_role;

-- ---------------------------------------------------------------- 12.5 buyer acceptance

create or replace function accept_match_as_buyer(
  p_match_id uuid,
  p_expected_status match_status,
  p_presented_quantity integer,
  p_presented_nomination_version integer,
  p_buyer_company_id uuid,
  p_actor_user_id text,
  p_admin_entered boolean,
  p_evidence_note text,
  p_effective_date date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match match%rowtype;
  v_initial_match match%rowtype;
  v_company_ids uuid[];
  v_demand demand_line%rowtype;
  v_demand_id uuid;
  v_worker_ids uuid[];
  v_worker_id uuid;
  v_failure text;
  v_failures jsonb := '[]'::jsonb;
  v_worker_count integer;
  v_minimum_crew_size integer;
  v_remaining integer;
  v_filled_after integer;
  v_other_pending integer;
  v_expected_hours bigint;
  v_fee_cents_per_hour bigint;
  v_engagement_id uuid;
  v_inserted_worker_count integer;
  v_other record;
  v_knocked_count integer;
  v_other_after match_status;
  v_competing jsonb := '[]'::jsonb;
begin
  if nullif(trim(p_actor_user_id), '') is null then
    raise exception 'a human actor is required' using errcode = '42501';
  end if;
  if p_admin_entered and length(trim(coalesce(p_evidence_note, ''))) < 10 then
    raise exception 'concierge evidence is required' using errcode = '23514';
  end if;
  if p_expected_status <> 'Awaiting Buyer' then
    raise exception 'buyer acceptance requires the Awaiting Buyer CAS'
      using errcode = '23514';
  end if;
  if p_effective_date is null then
    raise exception 'an effective Brisbane date is required' using errcode = '22004';
  end if;

  select * into v_initial_match from match where id = p_match_id;
  if not found then raise exception 'match does not exist' using errcode = '23503'; end if;
  -- Read only to establish the global company/worker lock order. The version/count are
  -- re-read after all locks; a concurrent substitution therefore causes a stale-CAS
  -- response instead of accepting an unpresented shape.
  select array_agg(worker_id order by worker_id)
    into v_worker_ids
    from match_worker
   where match_id = p_match_id and knocked_out = false;
  -- Competing knockouts change those matches too: acquire every affected party
  -- before any worker lock, then reject a newly introduced counterparty below.
  select array_agg(distinct parties.id order by parties.id) into v_company_ids
    from match m cross join lateral unnest(array[m.supplier_company_id, m.buyer_company_id]) parties(id)
   where m.id = p_match_id or (
     m.status in ('Awaiting Supplier', 'Awaiting Buyer')
     and daterange(m.engagement_start, m.engagement_end, '[]')
       && daterange(v_initial_match.engagement_start, v_initial_match.engagement_end, '[]')
     and exists (select 1 from match_worker mw where mw.match_id=m.id
       and mw.worker_id=any(v_worker_ids) and not mw.knocked_out)
   );
  perform lock_match_companies(v_company_ids);
  perform lock_match_workers(v_worker_ids);

  v_demand_id := v_initial_match.demand_line_id;
  select * into v_demand from demand_line where id = v_demand_id for update;
  if not found then raise exception 'demand line does not exist' using errcode = '23503'; end if;

  select * into v_match
    from match
   where id = p_match_id
     and status = p_expected_status
   for update;
  if not found then
    raise exception 'match status changed; refresh before retrying' using errcode = '40001';
  end if;
  if (v_match.supplier_company_id, v_match.buyer_company_id, v_match.demand_line_id, v_match.capacity_line_id)
     is distinct from (v_initial_match.supplier_company_id, v_initial_match.buyer_company_id,
       v_initial_match.demand_line_id, v_initial_match.capacity_line_id) then
    raise exception 'match source changed during lock acquisition' using errcode = '40001';
  end if;
  if p_admin_entered is null then raise exception 'decision source is required' using errcode = '23514'; end if;
  if not p_admin_entered and v_match.buyer_company_id is distinct from p_buyer_company_id then
    raise exception 'the hiring business does not own this match' using errcode = '42501';
  end if;
  if p_admin_entered and p_buyer_company_id is not null
     and v_match.buyer_company_id <> p_buyer_company_id then
    raise exception 'concierge buyer does not match the proposal' using errcode = '42501';
  end if;

  select array_agg(worker_id order by worker_id), count(*)::integer
    into v_worker_ids, v_worker_count
    from match_worker
   where match_id = p_match_id and knocked_out = false;
  if v_worker_count is distinct from p_presented_quantity
     or v_match.nomination_version is distinct from p_presented_nomination_version then
    raise exception 'the displayed crew changed; review the updated proposal'
      using errcode = '40001';
  end if;
  if exists (
    select 1 from match m where m.id<>p_match_id and m.status in ('Awaiting Supplier', 'Awaiting Buyer')
      and daterange(m.engagement_start, m.engagement_end, '[]')
        && daterange(v_match.engagement_start, v_match.engagement_end, '[]')
      and exists(select 1 from match_worker mw where mw.match_id=m.id
        and mw.worker_id=any(v_worker_ids) and not mw.knocked_out)
      and not (m.supplier_company_id=any(v_company_ids) and m.buyer_company_id=any(v_company_ids))
  ) then
    raise exception 'competing match parties changed during lock acquisition' using errcode='40001';
  end if;

  select value_int::integer into v_minimum_crew_size
    from platform_config where key = 'minimum_crew_size' for share;
  if v_worker_count < coalesce(v_minimum_crew_size, 1) then
    raise exception 'the proposal is below the minimum crew size' using errcode = '23514';
  end if;

  foreach v_worker_id in array coalesce(v_worker_ids, '{}'::uuid[]) loop
    v_failure := match_nomination_failure(p_match_id, v_worker_id, p_effective_date);
    if v_failure is not null then
      update match_worker
         set knocked_out = true,
             knocked_out_reason = v_failure,
             knocked_out_at = now()
       where match_id = p_match_id
         and worker_id = v_worker_id
         and knocked_out = false;

      insert into audit_event (
        actor_user_id, actor_is_system, action, entity_type, entity_id, after_data
      ) values (
        p_actor_user_id,
        false,
        'match.nomination_knocked_out',
        'match',
        p_match_id,
        jsonb_build_object('worker_id', v_worker_id, 'reason', v_failure)
      );
      v_failures := v_failures || jsonb_build_array(jsonb_build_object(
        'worker_id', v_worker_id,
        'reason', v_failure
      ));
    end if;
  end loop;

  if jsonb_array_length(v_failures) > 0 then
    select count(*)::integer into v_remaining
      from match_worker
     where match_id = p_match_id and knocked_out = false;

    update match
       set nomination_version = nomination_version + 1
     where id = p_match_id;

    if v_remaining < coalesce(v_minimum_crew_size, 1) then
      update match
         set status = 'Declined',
             decline_reason = 'auto-declined: nominations fell below the minimum crew size'
       where id = p_match_id;
      update match_worker
         set knocked_out = true,
             knocked_out_reason = 'match auto-declined below the minimum crew size',
             knocked_out_at = coalesce(knocked_out_at, now())
       where match_id = p_match_id and knocked_out = false;
      insert into audit_event (
        actor_user_id, actor_is_system, action, entity_type, entity_id,
        before_data, after_data
      ) values (
        p_actor_user_id,
        false,
        'match.auto_declined',
        'match',
        p_match_id,
        jsonb_build_object('status', v_match.status),
        jsonb_build_object('status', 'Declined', 'reason', 'below minimum crew size')
      );
    end if;

    return jsonb_build_object(
      'accepted', false,
      'match_id', p_match_id,
      'supplier_company_id', v_match.supplier_company_id,
      'buyer_company_id', v_match.buyer_company_id,
      'knocked_out', v_failures,
      'remaining_count', v_remaining,
      'declined', v_remaining < coalesce(v_minimum_crew_size, 1),
      'nomination_version', v_match.nomination_version + 1
    );
  end if;

  -- Recompute the post-accept demand budget while the demand row is locked. Sequential
  -- engagements by the same worker count once, exactly as 10.3 specifies.
  select count(distinct worker_id)::integer
    into v_filled_after
    from (
      select ew.worker_id
        from engagement e
        join engagement_worker ew on ew.engagement_id = e.id
       where e.demand_line_id = v_match.demand_line_id
         and e.status in ('Awaiting Commercial', 'Confirmed', 'Active')
         and ew.status in ('Awaiting Commercial', 'Confirmed', 'Active')
      union
      select unnest(v_worker_ids)
    ) filled_workers;

  select coalesce(sum(
    case
      when m.status = 'Awaiting Supplier' then m.requested_quantity
      else (select count(*) from match_worker mw where mw.match_id = m.id and not mw.knocked_out)
    end
  ), 0)::integer
    into v_other_pending
    from match m
   where m.demand_line_id = v_match.demand_line_id
     and m.id <> p_match_id
     and m.status in ('Awaiting Supplier', 'Awaiting Buyer');
  if v_filled_after + v_other_pending > v_demand.quantity then
    raise exception 'buyer acceptance exceeds the locked demand budget'
      using errcode = '40001';
  end if;

  v_expected_hours := floor(
    v_match.hours_per_week
      * ((v_match.engagement_end - v_match.engagement_start + 1)::numeric / 7)
      + 0.5
  )::bigint;
  v_fee_cents_per_hour := v_match.buyer_rate_cents - v_match.supplier_rate_cents;

  insert into engagement (
    match_id,
    demand_line_id,
    capacity_line_id,
    buyer_company_id,
    supplier_company_id,
    trade_role_id,
    proficiency_id,
    work_region_id,
    start_date,
    end_date,
    hours_per_week,
    supplier_rate_cents,
    fee_bp,
    fee_cents_per_hour,
    buyer_rate_cents,
    expected_hours,
    estimated_supplier_value_cents,
    estimated_maintain_revenue_cents,
    estimated_buyer_value_cents,
    status,
    payment_status,
    external_payment_ref,
    commercial_confirmed_at,
    actual_hours,
    actual_value_cents,
    completed_at,
    dispute_notes,
    cancelled_by,
    cancel_reason,
    within_notice_window
  ) values (
    v_match.id,
    v_match.demand_line_id,
    v_match.capacity_line_id,
    v_match.buyer_company_id,
    v_match.supplier_company_id,
    v_match.trade_role_id,
    v_match.proficiency_id,
    v_match.work_region_id,
    v_match.engagement_start,
    v_match.engagement_end,
    v_match.hours_per_week,
    v_match.supplier_rate_cents,
    v_match.fee_bp,
    v_fee_cents_per_hour,
    v_match.buyer_rate_cents,
    v_expected_hours,
    v_expected_hours * v_match.supplier_rate_cents * v_worker_count,
    v_expected_hours * v_fee_cents_per_hour * v_worker_count,
    v_expected_hours * v_match.buyer_rate_cents * v_worker_count,
    'Awaiting Commercial',
    'none',
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null
  ) returning id into v_engagement_id;

  insert into engagement_worker (engagement_id, worker_id, status, committed_window)
  select
    v_engagement_id,
    mw.worker_id,
    'Awaiting Commercial',
    daterange(v_match.engagement_start, v_match.engagement_end, '[]')
  from match_worker mw
  where mw.match_id = p_match_id and mw.knocked_out = false
  order by mw.worker_id;
  get diagnostics v_inserted_worker_count = row_count;
  if v_inserted_worker_count <> v_worker_count then
    raise exception 'engagement worker copy was incomplete' using errcode = '40001';
  end if;

  update match
     set status = 'Accepted',
         buyer_decided_at = now(),
         admin_entered = admin_entered or p_admin_entered,
         evidence_note = case
           when p_admin_entered then concat_ws(
             E'\n',
             nullif(evidence_note, ''),
             'Buyer acceptance recorded: ' || trim(p_evidence_note)
           )
           else evidence_note
         end
   where id = p_match_id
     and status = 'Awaiting Buyer';
  if not found then
    raise exception 'match status changed during buyer acceptance' using errcode = '40001';
  end if;

  insert into audit_event (
    actor_user_id, actor_is_system, action, entity_type, entity_id,
    before_data, after_data
  ) values
  (
    p_actor_user_id,
    false,
    case
      when p_admin_entered then 'match.buyer_accepted.admin_entered'
      else 'match.buyer_accepted'
    end,
    'match',
    p_match_id,
    jsonb_build_object('status', v_match.status, 'nomination_version', v_match.nomination_version),
    jsonb_build_object(
      'status', 'Accepted',
      'accepted_quantity', v_worker_count,
      'admin_entered', p_admin_entered,
      'evidence_note', nullif(trim(p_evidence_note), '')
    )
  ),
  (
    p_actor_user_id,
    false,
    'engagement.created',
    'engagement',
    v_engagement_id,
    null,
    jsonb_build_object(
      'match_id', p_match_id,
      'status', 'Awaiting Commercial',
      'worker_ids', to_jsonb(v_worker_ids),
      'expected_hours', v_expected_hours,
      'estimated_supplier_value_cents', v_expected_hours * v_match.supplier_rate_cents * v_worker_count,
      'estimated_maintain_revenue_cents', v_expected_hours * v_fee_cents_per_hour * v_worker_count,
      'estimated_buyer_value_cents', v_expected_hours * v_match.buyer_rate_cents * v_worker_count
    )
  );

  -- A committing engagement knocks the same people out of every competing open
  -- nomination in this window. Worker locks above make this race deterministic.
  for v_other in
    select
      m.id,
      m.status,
      m.supplier_company_id,
      m.buyer_company_id,
      m.nomination_version
    from match m
    where m.id <> p_match_id
      and m.status in ('Awaiting Supplier', 'Awaiting Buyer')
      and exists (
        select 1 from match_worker mw where mw.match_id = m.id
          and mw.worker_id = any(v_worker_ids) and not mw.knocked_out
      )
      and daterange(m.engagement_start, m.engagement_end, '[]')
          && daterange(v_match.engagement_start, v_match.engagement_end, '[]')
    order by m.id
    for update of m
  loop
    update match_worker
       set knocked_out = true,
           knocked_out_reason = 'committed to another engagement for overlapping dates',
           knocked_out_at = now()
     where match_id = v_other.id
       and worker_id = any(v_worker_ids)
       and knocked_out = false;
    get diagnostics v_knocked_count = row_count;
    if v_knocked_count = 0 then continue; end if;

    update match
       set nomination_version = nomination_version + 1
     where id = v_other.id;

    insert into audit_event (
      actor_user_id, actor_is_system, action, entity_type, entity_id, after_data
    )
    select
      p_actor_user_id,
      false,
      'match.nomination_knocked_out',
      'match',
      v_other.id,
      jsonb_build_object(
        'worker_id', mw.worker_id,
        'reason', 'committed to another engagement for overlapping dates',
        'caused_by_match_id', p_match_id,
        'caused_by_engagement_id', v_engagement_id
      )
    from match_worker mw
    where mw.match_id = v_other.id
      and mw.worker_id = any(v_worker_ids)
      and mw.knocked_out = true
      and mw.knocked_out_reason = 'committed to another engagement for overlapping dates'
      and mw.knocked_out_at >= transaction_timestamp();

    select count(*)::integer into v_remaining
      from match_worker
     where match_id = v_other.id and knocked_out = false;
    v_other_after := v_other.status;

    if v_remaining < coalesce(v_minimum_crew_size, 1) then
      update match
         set status = 'Declined',
             decline_reason = 'auto-declined: nominations fell below the minimum crew size'
       where id = v_other.id;
      update match_worker
         set knocked_out = true,
             knocked_out_reason = 'match auto-declined below the minimum crew size',
             knocked_out_at = coalesce(knocked_out_at, now())
       where match_id = v_other.id and knocked_out = false;
      insert into audit_event (
        actor_user_id, actor_is_system, action, entity_type, entity_id,
        before_data, after_data
      ) values (
        p_actor_user_id,
        false,
        'match.auto_declined',
        'match',
        v_other.id,
        jsonb_build_object('status', v_other.status),
        jsonb_build_object('status', 'Declined', 'reason', 'below minimum crew size')
      );
      v_other_after := 'Declined';
    end if;

    v_competing := v_competing || jsonb_build_array(jsonb_build_object(
      'match_id', v_other.id,
      'supplier_company_id', v_other.supplier_company_id,
      'buyer_company_id', v_other.buyer_company_id,
      'status_before', v_other.status,
      'status_after', v_other_after,
      'remaining_count', v_remaining,
      'nomination_version', v_other.nomination_version + 1
    ));
  end loop;

  return jsonb_build_object(
    'accepted', true,
    'match_id', p_match_id,
    'engagement_id', v_engagement_id,
    'supplier_company_id', v_match.supplier_company_id,
    'buyer_company_id', v_match.buyer_company_id,
    'competing_matches', v_competing
  );
end;
$$;

revoke all on function accept_match_as_buyer(
  uuid, match_status, integer, integer, uuid, text, boolean, text, date
) from public, anon, authenticated, service_role;
grant execute on function accept_match_as_buyer(
  uuid, match_status, integer, integer, uuid, text, boolean, text, date
) to service_role;

-- ---------------------------------------------------------------- terminal transitions

-- Private primitive: party ownership, exact expected status, released holds and the
-- audit record are checked together while the demand budget and match are locked.
create or replace function close_match_atomic(
  p_match_id uuid, p_expected_status match_status, p_next_status match_status,
  p_reason text, p_actor_user_id text, p_actor_is_system boolean,
  p_party text, p_company_id uuid, p_admin_entered boolean, p_evidence_note text
)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_match match%rowtype;
  v_demand_id uuid;
  v_action text;
begin
  if p_actor_is_system is null or (p_actor_is_system and p_actor_user_id is not null)
     or (not p_actor_is_system and nullif(trim(p_actor_user_id), '') is null) then
    raise exception 'exactly one human or system actor is required' using errcode = '42501';
  end if;
  if p_expected_status is null or p_expected_status not in ('Awaiting Supplier', 'Awaiting Buyer')
     or p_next_status is null or p_next_status not in ('Declined', 'Withdrawn', 'Expired') then
    raise exception 'invalid terminal match transition' using errcode = '23514';
  end if;
  if p_admin_entered is null then raise exception 'decision source is required' using errcode = '23514'; end if;
  if p_admin_entered and length(trim(coalesce(p_evidence_note, ''))) < 10 then
    raise exception 'concierge evidence is required' using errcode = '23514';
  end if;
  select demand_line_id into v_demand_id from match where id = p_match_id;
  if not found then raise exception 'match does not exist' using errcode = '23503'; end if;
  perform 1 from demand_line where id = v_demand_id for update;
  select * into v_match from match
   where id = p_match_id and status = p_expected_status for update;
  if not found then
    raise exception 'match status changed; refresh before retrying' using errcode = '40001';
  end if;

  if p_party in ('supplier', 'buyer') then
    if p_party = 'buyer' and v_match.status <> 'Awaiting Buyer' then
      raise exception 'the supplier has not accepted this proposal' using errcode = '23514';
    end if;
    if not p_admin_entered and (
      case when p_party = 'supplier' then v_match.supplier_company_id else v_match.buyer_company_id end
    ) is distinct from p_company_id then
      raise exception 'the company does not own this match decision' using errcode = '42501';
    end if;
    if not p_admin_entered and not exists (
      select 1 from company where id = p_company_id and status = 'Active'
    ) then
      raise exception 'an Active company is required' using errcode = '42501';
    end if;
  end if;

  v_action := case
    when p_party = 'auto' then 'match.auto_declined'
    when p_next_status = 'Withdrawn' then 'match.withdrawn'
    when p_next_status = 'Expired' then 'match.expired'
    when p_party = 'supplier' then 'match.declined_by_supplier'
    when p_party = 'buyer' then 'match.declined_by_buyer'
  end;
  if v_action is null then raise exception 'match transition has no audit action' using errcode = '23514'; end if;
  if p_admin_entered then v_action := v_action || '.admin_entered'; end if;

  update match
     set status = p_next_status,
         decline_reason = nullif(trim(p_reason), ''),
         declined_by = case when p_party in ('supplier','buyer') then p_actor_user_id else declined_by end,
         supplier_decided_at = case when p_party = 'supplier' then now() else supplier_decided_at end,
         buyer_decided_at = case when p_party = 'buyer' then now() else buyer_decided_at end,
         nomination_version = nomination_version + 1,
         admin_entered = admin_entered or p_admin_entered,
         evidence_note = case when p_admin_entered then concat_ws(
           E'\n', nullif(evidence_note, ''), p_party || ' decline recorded: ' || trim(p_evidence_note)
         ) else evidence_note end
   where id = p_match_id and status = p_expected_status;
  if not found then raise exception 'match status changed' using errcode = '40001'; end if;

  update match_worker
     set knocked_out = true, knocked_out_at = now(),
         knocked_out_reason = 'match ' || lower(p_next_status::text)
   where match_id = p_match_id and not knocked_out;
  insert into audit_event(actor_user_id,actor_is_system,action,entity_type,entity_id,before_data,after_data)
  values(p_actor_user_id,p_actor_is_system,v_action,'match',p_match_id,
    jsonb_build_object('status',v_match.status,'nomination_version',v_match.nomination_version),
    jsonb_build_object('status',p_next_status,'reason',nullif(trim(p_reason),''),'declined_by',p_party,
      'nomination_version',v_match.nomination_version+1,'admin_entered',p_admin_entered,
      'evidence_note',nullif(trim(p_evidence_note),'')));
  return jsonb_build_object('changed',true,'match_id',p_match_id,
    'supplier_company_id',v_match.supplier_company_id,'buyer_company_id',v_match.buyer_company_id,
    'status_before',v_match.status,'status_after',p_next_status,'remaining_count',0,
    'nomination_version',v_match.nomination_version+1);
end;
$$;
revoke all on function close_match_atomic(uuid,match_status,match_status,text,text,boolean,text,uuid,boolean,text)
  from public, anon, authenticated, service_role;

create or replace function decline_match_atomic(
  p_match_id uuid, p_expected_status match_status, p_party text, p_company_id uuid,
  p_actor_user_id text, p_admin_entered boolean, p_evidence_note text, p_reason text
)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_initial_match match%rowtype;
  v_match match%rowtype;
begin
  if p_party is null or p_party not in ('supplier','buyer') then
    raise exception 'a supplier or buyer decision is required' using errcode = '23514';
  end if;
  select * into v_initial_match from match where id=p_match_id;
  if not found then raise exception 'match does not exist' using errcode='23503'; end if;
  perform lock_match_companies(array[v_initial_match.supplier_company_id, v_initial_match.buyer_company_id]);
  perform 1 from demand_line where id=v_initial_match.demand_line_id for update;
  select * into v_match from match where id=p_match_id for update;
  if not found or (v_match.supplier_company_id, v_match.buyer_company_id, v_match.demand_line_id, v_match.capacity_line_id)
     is distinct from (v_initial_match.supplier_company_id, v_initial_match.buyer_company_id,
       v_initial_match.demand_line_id, v_initial_match.capacity_line_id) then
    raise exception 'match source changed during lock acquisition' using errcode='40001';
  end if;
  return close_match_atomic(p_match_id,p_expected_status,'Declined',p_reason,p_actor_user_id,
    false,p_party,p_company_id,p_admin_entered,p_evidence_note);
end;
$$;
revoke all on function decline_match_atomic(uuid,match_status,text,uuid,text,boolean,text,text)
  from public, anon, authenticated, service_role;
grant execute on function decline_match_atomic(uuid,match_status,text,uuid,text,boolean,text,text) to service_role;

create or replace function withdraw_match_atomic(
  p_match_id uuid, p_expected_status match_status, p_actor_user_id text, p_reason text
)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_initial_match match%rowtype;
  v_match match%rowtype;
begin
  select * into v_initial_match from match where id=p_match_id;
  if not found then raise exception 'match does not exist' using errcode='23503'; end if;
  perform lock_match_companies(array[v_initial_match.supplier_company_id, v_initial_match.buyer_company_id]);
  perform 1 from demand_line where id=v_initial_match.demand_line_id for update;
  select * into v_match from match where id=p_match_id for update;
  if not found or (v_match.supplier_company_id, v_match.buyer_company_id, v_match.demand_line_id, v_match.capacity_line_id)
     is distinct from (v_initial_match.supplier_company_id, v_initial_match.buyer_company_id,
       v_initial_match.demand_line_id, v_initial_match.capacity_line_id) then
    raise exception 'match source changed during lock acquisition' using errcode='40001';
  end if;
  return close_match_atomic(p_match_id,p_expected_status,'Withdrawn',p_reason,p_actor_user_id,
    false,null,null,false,null);
end;
$$;
revoke all on function withdraw_match_atomic(uuid,match_status,text,text) from public, anon, authenticated, service_role;
grant execute on function withdraw_match_atomic(uuid,match_status,text,text) to service_role;

create or replace function expire_match_atomic(p_match_id uuid, p_effective_date date)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_match match%rowtype;
  v_initial_match match%rowtype;
  v_demand_id uuid;
  v_demand_end date;
  v_capacity_end date;
begin
  if p_effective_date is null then raise exception 'an effective Brisbane date is required' using errcode = '22004'; end if;
  select * into v_initial_match from match where id=p_match_id;
  if not found then return jsonb_build_object('changed',false,'match_id',p_match_id); end if;
  perform lock_match_companies(array[v_initial_match.supplier_company_id, v_initial_match.buyer_company_id]);
  v_demand_id := v_initial_match.demand_line_id;
  select end_date into v_demand_end from demand_line where id = v_demand_id for update;
  select * into v_match from match where id = p_match_id for update;
  if not found or v_match.status not in ('Awaiting Supplier','Awaiting Buyer') then
    return jsonb_build_object('changed',false,'match_id',p_match_id);
  end if;
  if (v_match.supplier_company_id, v_match.buyer_company_id, v_match.demand_line_id, v_match.capacity_line_id)
     is distinct from (v_initial_match.supplier_company_id, v_initial_match.buyer_company_id,
       v_initial_match.demand_line_id, v_initial_match.capacity_line_id) then
    raise exception 'match source changed during lock acquisition' using errcode='40001';
  end if;
  select available_until into v_capacity_end from capacity_line where id = v_match.capacity_line_id;
  if (v_match.proposed_at at time zone 'Australia/Brisbane')::date > p_effective_date - 7
     and v_demand_end >= p_effective_date and v_capacity_end >= p_effective_date then
    return jsonb_build_object('changed',false,'match_id',p_match_id);
  end if;
  return close_match_atomic(p_match_id,v_match.status,'Expired','proposal age or line window elapsed',
    null,true,null,null,false,null);
end;
$$;
revoke all on function expire_match_atomic(uuid,date) from public, anon, authenticated, service_role;
grant execute on function expire_match_atomic(uuid,date) to service_role;

-- ---------------------------------------------------------------- 12.7 shared knockout

-- Called inside buyer-acceptance/transfer/expiry transactions as well as by explicit
-- Maintain corrections. Retries of a released nomination do not create audit noise.
create or replace function knock_out_match_nomination_atomic(
  p_match_id uuid, p_worker_id uuid, p_reason text, p_actor_user_id text,
  p_actor_is_system boolean default false,
  p_expected_status match_status default null,
  p_expected_nomination_version integer default null
)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_match match%rowtype;
  v_initial_match match%rowtype;
  v_demand_id uuid;
  v_remaining integer;
  v_minimum integer;
  v_result jsonb;
begin
  if p_actor_is_system is null or (p_actor_is_system and p_actor_user_id is not null)
     or (not p_actor_is_system and nullif(trim(p_actor_user_id),'') is null) then
    raise exception 'exactly one human or system actor is required' using errcode = '42501';
  end if;
  if nullif(trim(p_reason),'') is null then raise exception 'a knockout reason is required' using errcode = '23514'; end if;
  select * into v_initial_match from match where id=p_match_id;
  if not found then return jsonb_build_object('changed',false,'match_id',p_match_id); end if;
  -- Larger 010/012 transactions prelock all parties before acquiring workers;
  -- this is reentrant there and the outermost lock boundary for direct corrections.
  perform lock_match_companies(array[v_initial_match.supplier_company_id, v_initial_match.buyer_company_id]);
  perform lock_match_workers(ARRAY[p_worker_id]);
  v_demand_id := v_initial_match.demand_line_id;
  perform 1 from demand_line where id = v_demand_id for update;
  select * into v_match from match where id = p_match_id for update;
  if not found then return jsonb_build_object('changed',false,'match_id',p_match_id); end if;
  if (v_match.supplier_company_id, v_match.buyer_company_id, v_match.demand_line_id, v_match.capacity_line_id)
     is distinct from (v_initial_match.supplier_company_id, v_initial_match.buyer_company_id,
       v_initial_match.demand_line_id, v_initial_match.capacity_line_id) then
    raise exception 'match source changed during lock acquisition' using errcode='40001';
  end if;
  if (p_expected_status is not null and v_match.status <> p_expected_status)
     or (p_expected_nomination_version is not null and v_match.nomination_version <> p_expected_nomination_version) then
    raise exception 'the proposal changed; refresh before retrying' using errcode = '40001';
  end if;
  if v_match.status not in ('Awaiting Supplier','Awaiting Buyer') then
    return jsonb_build_object('changed',false,'match_id',p_match_id);
  end if;
  update match_worker set knocked_out=true,knocked_out_at=now(),knocked_out_reason=trim(p_reason)
   where match_id=p_match_id and worker_id=p_worker_id and not knocked_out;
  if not found then return jsonb_build_object('changed',false,'match_id',p_match_id); end if;
  insert into audit_event(actor_user_id,actor_is_system,action,entity_type,entity_id,after_data)
  values(p_actor_user_id,p_actor_is_system,'match.nomination_knocked_out','match',p_match_id,
    jsonb_build_object('worker_id',p_worker_id,'reason',trim(p_reason)));
  select count(*)::integer into v_remaining from match_worker where match_id=p_match_id and not knocked_out;
  select value_int::integer into v_minimum from platform_config where key='minimum_crew_size' for share;
  if coalesce(v_minimum,0)<=0 then raise exception 'minimum crew size is not configured' using errcode='23514'; end if;
  if v_remaining<v_minimum then
    v_result:=close_match_atomic(p_match_id,v_match.status,'Declined',
      'auto-declined: nominations fell below the minimum crew size',p_actor_user_id,
      p_actor_is_system,'auto',null,false,null);
  else
    update match set nomination_version=nomination_version+1 where id=p_match_id;
    v_result:=jsonb_build_object('changed',true,'match_id',p_match_id,
      'supplier_company_id',v_match.supplier_company_id,'buyer_company_id',v_match.buyer_company_id,
      'status_before',v_match.status,'status_after',v_match.status,'remaining_count',v_remaining,
      'nomination_version',v_match.nomination_version+1);
  end if;
  return v_result;
end;
$$;
revoke all on function knock_out_match_nomination_atomic(uuid,uuid,text,text,boolean,match_status,integer)
  from public, anon, authenticated, service_role;
grant execute on function knock_out_match_nomination_atomic(uuid,uuid,text,text,boolean,match_status,integer) to service_role;

create or replace function record_match_qualification_override(
  p_match_id uuid, p_expected_status match_status, p_actor_user_id text, p_evidence_note text
)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_match match%rowtype;
  v_initial_match match%rowtype;
  v_demand_id uuid;
begin
  if nullif(trim(p_actor_user_id),'') is null then raise exception 'a Maintain actor is required' using errcode='42501'; end if;
  if length(trim(coalesce(p_evidence_note,'')))<10 then raise exception 'qualification override evidence is required' using errcode='23514'; end if;
  if p_expected_status is null or p_expected_status not in ('Awaiting Supplier','Awaiting Buyer') then
    raise exception 'only an open match can receive an override' using errcode='23514';
  end if;
  select * into v_initial_match from match where id=p_match_id;
  if not found then raise exception 'match does not exist' using errcode='23503'; end if;
  perform lock_match_companies(array[v_initial_match.supplier_company_id, v_initial_match.buyer_company_id]);
  v_demand_id := v_initial_match.demand_line_id;
  perform 1 from demand_line where id=v_demand_id for update;
  select * into v_match from match where id=p_match_id and status=p_expected_status for update;
  if not found then raise exception 'match status changed; refresh before retrying' using errcode='40001'; end if;
  if (v_match.supplier_company_id, v_match.buyer_company_id, v_match.demand_line_id, v_match.capacity_line_id)
     is distinct from (v_initial_match.supplier_company_id, v_initial_match.buyer_company_id,
       v_initial_match.demand_line_id, v_initial_match.capacity_line_id) then
    raise exception 'match source changed during lock acquisition' using errcode='40001';
  end if;
  if not company_is_match_compliant(v_match.supplier_company_id, (now() at time zone 'Australia/Brisbane')::date)
     or not company_is_match_compliant(v_match.buyer_company_id, (now() at time zone 'Australia/Brisbane')::date) then
    raise exception 'both companies must remain Active and compliant' using errcode='23514';
  end if;
  update match set qualification_override_by=p_actor_user_id,qualification_override_at=now(),
    nomination_version=nomination_version+1,
    evidence_note=concat_ws(E'\n',nullif(evidence_note,''),'Ticket-expiry override recorded: '||trim(p_evidence_note))
    where id=p_match_id;
  insert into audit_event(actor_user_id,actor_is_system,action,entity_type,entity_id,before_data,after_data)
  values(p_actor_user_id,false,'match.qualification_override_recorded','match',p_match_id,
    jsonb_build_object('qualification_override_by',v_match.qualification_override_by),
    jsonb_build_object('evidence_note',trim(p_evidence_note),'qualification_override_by',p_actor_user_id,
      'nomination_version',v_match.nomination_version+1));
  return jsonb_build_object('changed',true,'match_id',p_match_id,
    'supplier_company_id',v_match.supplier_company_id,'buyer_company_id',v_match.buyer_company_id,
    'nomination_version',v_match.nomination_version+1);
end;
$$;
revoke all on function record_match_qualification_override(uuid,match_status,text,text)
  from public, anon, authenticated, service_role;
grant execute on function record_match_qualification_override(uuid,match_status,text,text) to service_role;
