-- Tenant write hardening — specs 1.3, 1.5, 3.2, 9, 10 and 17.1.
--
-- This migration deliberately leaves the accepted-membership implementation of
-- current_company_id() untouched. Every status gate below starts with that helper,
-- so a persisted but unaccepted invitation is never tenant authority.

-- ---------------------------------------------------------------- status helpers

create or replace function current_company_has_status(p_statuses company_status[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from company c
     where c.id = current_company_id()
       and c.status = any (p_statuses)
  );
$$;

revoke all on function current_company_has_status(company_status[]) from public, anon;
grant execute on function current_company_has_status(company_status[])
  to authenticated, service_role;

-- TRUNCATE does not run row-level-security policy checks. Tenant and anonymous
-- roles never need it, so remove that table privilege across the public schema.
revoke truncate on all tables in schema public from anon, authenticated;
alter default privileges in schema public
  revoke truncate on tables from anon, authenticated;

-- ---------------------------------------------------------------- company profile

-- RLS selects the row; column privileges decide which properties a company can
-- change. In particular, status is never part of the authenticated update grant.
revoke update on table company from authenticated;
grant update (
  legal_name,
  trading_name,
  abn,
  industry_id,
  contact_name,
  contact_email,
  contact_phone,
  primary_region_id
) on table company to authenticated;

drop policy if exists company_own_update on company;
create policy company_own_update on company
  for update to authenticated
  using (
    id = current_company_id()
    and current_company_has_status(
      array['Pending'::company_status, 'Active'::company_status]
    )
  )
  with check (
    id = current_company_id()
    and current_company_has_status(
      array['Pending'::company_status, 'Active'::company_status]
    )
  );

-- Operating regions are part of the editable profile. Suspended and Closed
-- companies remain able to read their regions through company_region_read, but
-- cannot mutate them.
drop policy if exists company_region_write on company_operating_region;
create policy company_region_write on company_operating_region
  for all to authenticated
  using (
    company_id = current_company_id()
    and current_company_has_status(
      array['Pending'::company_status, 'Active'::company_status]
    )
  )
  with check (
    company_id = current_company_id()
    and current_company_has_status(
      array['Pending'::company_status, 'Active'::company_status]
    )
  );

-- Company-document verification is a Maintain decision. Company uploads enter
-- through the authenticated server action after its company gate; that action uses
-- the service role for the metadata row and audit event. Authenticated users retain
-- the existing tenant-scoped SELECT policy but have no direct row-mutation surface.
drop policy if exists company_document_write on company_document;
revoke insert, update, delete on table company_document from authenticated;

-- ---------------------------------------------------------------- worker scope

-- Suspended and Closed companies are read-only. Pending companies may prepare
-- crew records for verification, while Maintain-suspended worker rows remain
-- Maintain-only and cannot be reactivated through direct PostgREST writes.
drop policy if exists worker_read on worker;
drop policy if exists worker_write on worker;
drop policy if exists worker_travel_read on worker_travel_region;
drop policy if exists worker_skill_rw on worker_skill;
drop policy if exists worker_qual_rw on worker_qualification;

-- Company users can edit ordinary contact/profile facts only. Status transitions and
-- every classification/provenance/consent field go through privileged, audited paths.
revoke update, delete on table worker from anon, authenticated;
grant update (first_name, last_name, mobile, email, base_region_id)
  on table worker to authenticated;
revoke delete on table worker_travel_region, worker_skill, worker_qualification
  from anon, authenticated;

create policy worker_select on worker
  for select to authenticated
  using (current_company_employs(id));

create policy worker_insert_writable on worker
  for insert to authenticated
  with check (
    current_company_employs(id)
    and current_company_has_status(
      array['Pending'::company_status, 'Active'::company_status]
    )
    and status in ('Active'::worker_status, 'Inactive'::worker_status)
  );

create policy worker_update_writable on worker
  for update to authenticated
  using (
    current_company_employs(id)
    and current_company_has_status(
      array['Pending'::company_status, 'Active'::company_status]
    )
    and status in ('Active'::worker_status, 'Inactive'::worker_status)
  )
  with check (
    current_company_employs(id)
    and current_company_has_status(
      array['Pending'::company_status, 'Active'::company_status]
    )
    and status in ('Active'::worker_status, 'Inactive'::worker_status)
  );

create policy worker_travel_region_select on worker_travel_region
  for select to authenticated
  using (current_company_employs(worker_id));

create policy worker_travel_region_insert_writable on worker_travel_region
  for insert to authenticated
  with check (
    current_company_employs(worker_id)
    and current_company_has_status(
      array['Pending'::company_status, 'Active'::company_status]
    )
    and exists (
      select 1
        from worker w
       where w.id = worker_travel_region.worker_id
         and w.status in ('Active'::worker_status, 'Inactive'::worker_status)
    )
  );

create policy worker_travel_region_update_writable on worker_travel_region
  for update to authenticated
  using (
    current_company_employs(worker_id)
    and current_company_has_status(
      array['Pending'::company_status, 'Active'::company_status]
    )
    and exists (
      select 1
        from worker w
       where w.id = worker_travel_region.worker_id
         and w.status in ('Active'::worker_status, 'Inactive'::worker_status)
    )
  )
  with check (
    current_company_employs(worker_id)
    and current_company_has_status(
      array['Pending'::company_status, 'Active'::company_status]
    )
    and exists (
      select 1
        from worker w
       where w.id = worker_travel_region.worker_id
         and w.status in ('Active'::worker_status, 'Inactive'::worker_status)
    )
  );

create policy worker_skill_select on worker_skill
  for select to authenticated
  using (current_company_employs(worker_id));

create policy worker_skill_insert_writable on worker_skill
  for insert to authenticated
  with check (
    current_company_employs(worker_id)
    and current_company_has_status(
      array['Pending'::company_status, 'Active'::company_status]
    )
    and exists (
      select 1
        from worker w
       where w.id = worker_skill.worker_id
         and w.status in ('Active'::worker_status, 'Inactive'::worker_status)
    )
  );

create policy worker_skill_update_writable on worker_skill
  for update to authenticated
  using (
    current_company_employs(worker_id)
    and current_company_has_status(
      array['Pending'::company_status, 'Active'::company_status]
    )
    and exists (
      select 1
        from worker w
       where w.id = worker_skill.worker_id
         and w.status in ('Active'::worker_status, 'Inactive'::worker_status)
    )
  )
  with check (
    current_company_employs(worker_id)
    and current_company_has_status(
      array['Pending'::company_status, 'Active'::company_status]
    )
    and exists (
      select 1
        from worker w
       where w.id = worker_skill.worker_id
         and w.status in ('Active'::worker_status, 'Inactive'::worker_status)
    )
  );

create policy worker_qualification_select on worker_qualification
  for select to authenticated
  using (current_company_employs(worker_id));

create policy worker_qualification_insert_writable on worker_qualification
  for insert to authenticated
  with check (
    current_company_employs(worker_id)
    and current_company_has_status(
      array['Pending'::company_status, 'Active'::company_status]
    )
    and exists (
      select 1
        from worker w
       where w.id = worker_qualification.worker_id
         and w.status in ('Active'::worker_status, 'Inactive'::worker_status)
    )
  );

create policy worker_qualification_update_writable on worker_qualification
  for update to authenticated
  using (
    current_company_employs(worker_id)
    and current_company_has_status(
      array['Pending'::company_status, 'Active'::company_status]
    )
    and exists (
      select 1
        from worker w
       where w.id = worker_qualification.worker_id
         and w.status in ('Active'::worker_status, 'Inactive'::worker_status)
    )
  )
  with check (
    current_company_employs(worker_id)
    and current_company_has_status(
      array['Pending'::company_status, 'Active'::company_status]
    )
    and exists (
      select 1
        from worker w
       where w.id = worker_qualification.worker_id
         and w.status in ('Active'::worker_status, 'Inactive'::worker_status)
    )
  );

-- ---------------------------------------------------------------- parent ownership

-- A line repeats company_id for efficient RLS. These composite foreign keys make
-- that denormalisation trustworthy even for service-role writes.
alter table capacity_listing
  add constraint capacity_listing_id_company_id_key unique (id, company_id);

alter table capacity_line
  add constraint capacity_line_listing_company_fk
  foreign key (listing_id, company_id)
  references capacity_listing (id, company_id)
  on delete cascade;

alter table demand_request
  add constraint demand_request_id_company_id_key unique (id, company_id);

alter table demand_line
  add constraint demand_line_request_company_fk
  foreign key (request_id, company_id)
  references demand_request (id, company_id)
  on delete cascade;

-- Marketplace rows are append-only to company clients after creation. Narrow
-- transition/edit RPCs below own every later change and write the audit atomically.
revoke insert on table
  capacity_listing,
  capacity_line,
  capacity_line_travel_region,
  capacity_line_worker,
  demand_request,
  demand_line,
  demand_line_skill,
  demand_line_qualification
from anon, authenticated;

revoke update, delete on table
  capacity_listing,
  capacity_line,
  capacity_line_travel_region,
  capacity_line_worker,
  demand_request,
  demand_line,
  demand_line_skill,
  demand_line_qualification
from anon, authenticated;

grant insert (company_id, created_by)
  on table capacity_listing to authenticated;
grant insert (
  listing_id,
  company_id,
  trade_role_id,
  proficiency_id,
  available_from,
  available_until,
  available_days,
  hours_per_week,
  location_region_id,
  supplier_rate_cents,
  rate_entered_by
) on table capacity_line to authenticated;
grant insert (capacity_line_id, region_id)
  on table capacity_line_travel_region to authenticated;
grant insert (capacity_line_id, worker_id)
  on table capacity_line_worker to authenticated;

grant insert (company_id, name, industry_id, work_region_id, description, created_by)
  on table demand_request to authenticated;
grant insert (
  request_id,
  company_id,
  trade_role_id,
  proficiency_id,
  quantity,
  start_date,
  end_date,
  hours_per_week,
  notes
) on table demand_line to authenticated;
grant insert (demand_line_id, skill_id)
  on table demand_line_skill to authenticated;
grant insert (demand_line_id, qualification_id)
  on table demand_line_qualification to authenticated;

-- ---------------------------------------------------------------- supply scope

drop policy if exists capacity_listing_rw on capacity_listing;
drop policy if exists capacity_line_rw on capacity_line;
drop policy if exists capacity_line_travel_rw on capacity_line_travel_region;
drop policy if exists capacity_line_worker_rw on capacity_line_worker;

create policy capacity_listing_select on capacity_listing
  for select to authenticated
  using (company_id = current_company_id());

create policy capacity_listing_insert_active on capacity_listing
  for insert to authenticated
  with check (
    company_id = current_company_id()
    and current_company_has_status(array['Active'::company_status])
  );

create policy capacity_line_select on capacity_line
  for select to authenticated
  using (company_id = current_company_id());

create policy capacity_line_insert_active on capacity_line
  for insert to authenticated
  with check (
    company_id = current_company_id()
    and current_company_has_status(array['Active'::company_status])
    and exists (
      select 1
        from capacity_listing listing
       where listing.id = capacity_line.listing_id
         and listing.company_id = capacity_line.company_id
    )
  );

create policy capacity_line_travel_region_select on capacity_line_travel_region
  for select to authenticated
  using (
    exists (
      select 1
        from capacity_line line
       where line.id = capacity_line_travel_region.capacity_line_id
         and line.company_id = current_company_id()
    )
  );

create policy capacity_line_travel_region_insert_active on capacity_line_travel_region
  for insert to authenticated
  with check (
    current_company_has_status(array['Active'::company_status])
    and exists (
      select 1
        from capacity_line line
       where line.id = capacity_line_travel_region.capacity_line_id
         and line.company_id = current_company_id()
    )
  );

-- A line-worker association is tenant-owned only when both the line and the
-- worker's current, open employment belong to the same company.
create policy capacity_line_worker_select on capacity_line_worker
  for select to authenticated
  using (
    exists (
      select 1
        from capacity_line l
        join worker_employment we
          on we.worker_id = capacity_line_worker.worker_id
         and we.company_id = l.company_id
         and we.end_date is null
       where l.id = capacity_line_worker.capacity_line_id
         and l.company_id = current_company_id()
    )
  );

create policy capacity_line_worker_insert_active on capacity_line_worker
  for insert to authenticated
  with check (
    current_company_has_status(array['Active'::company_status])
    and exists (
      select 1
        from capacity_line l
        join worker_employment we
          on we.worker_id = capacity_line_worker.worker_id
         and we.company_id = l.company_id
         and we.end_date is null
       where l.id = capacity_line_worker.capacity_line_id
         and l.company_id = current_company_id()
    )
  );

-- ---------------------------------------------------------------- demand scope

drop policy if exists demand_request_rw on demand_request;
drop policy if exists demand_line_rw on demand_line;
drop policy if exists demand_line_skill_rw on demand_line_skill;
drop policy if exists demand_line_qual_rw on demand_line_qualification;

create policy demand_request_select on demand_request
  for select to authenticated
  using (company_id = current_company_id());

create policy demand_request_insert_active on demand_request
  for insert to authenticated
  with check (
    company_id = current_company_id()
    and current_company_has_status(array['Active'::company_status])
  );

create policy demand_line_select on demand_line
  for select to authenticated
  using (company_id = current_company_id());

create policy demand_line_insert_active on demand_line
  for insert to authenticated
  with check (
    company_id = current_company_id()
    and current_company_has_status(array['Active'::company_status])
    and exists (
      select 1
        from demand_request request
       where request.id = demand_line.request_id
         and request.company_id = demand_line.company_id
    )
  );

create policy demand_line_skill_select on demand_line_skill
  for select to authenticated
  using (
    exists (
      select 1
        from demand_line line
       where line.id = demand_line_skill.demand_line_id
         and line.company_id = current_company_id()
    )
  );

create policy demand_line_skill_insert_active on demand_line_skill
  for insert to authenticated
  with check (
    current_company_has_status(array['Active'::company_status])
    and exists (
      select 1
        from demand_line line
       where line.id = demand_line_skill.demand_line_id
         and line.company_id = current_company_id()
    )
  );

create policy demand_line_qualification_select on demand_line_qualification
  for select to authenticated
  using (
    exists (
      select 1
        from demand_line line
       where line.id = demand_line_qualification.demand_line_id
         and line.company_id = current_company_id()
    )
  );

create policy demand_line_qualification_insert_active on demand_line_qualification
  for insert to authenticated
  with check (
    current_company_has_status(array['Active'::company_status])
    and exists (
      select 1
        from demand_line line
       where line.id = demand_line_qualification.demand_line_id
         and line.company_id = current_company_id()
    )
  );

-- ---------------------------------------------------------------- storage writes

-- Keep the existing tenant/path ownership rules while making Suspended and Closed
-- accounts read-only. Pending accounts may still upload the documents and worker
-- qualifications needed to complete verification.
-- Reads have no authenticated policy: server actions authorize the caller and mint
-- short-lived signed URLs with the service role, so raw bucket paths are never enough.
drop policy if exists company_documents_read on storage.objects;
drop policy if exists worker_qualifications_read on storage.objects;

drop policy if exists company_documents_write on storage.objects;
create policy company_documents_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'company-documents'
    and (storage.foldername(name))[1] = current_company_id()::text
    and current_company_has_status(
      array['Pending'::company_status, 'Active'::company_status]
    )
  );

drop policy if exists worker_qualifications_write on storage.objects;
create policy worker_qualifications_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'worker-qualifications'
    and current_company_employs(((storage.foldername(name))[1])::uuid)
    and current_company_has_status(
      array['Pending'::company_status, 'Active'::company_status]
    )
  );

-- ---------------------------------------------------------------- worker/link invariants

-- Upgrade preflight: historical links may remain after a transfer, but every live
-- capacity link must already satisfy current employment and line classification.
do $$
begin
  if exists (
    select 1
      from capacity_line_worker link
      join capacity_line line on line.id = link.capacity_line_id
      join worker w on w.id = link.worker_id
      left join worker_employment employment
        on employment.worker_id = link.worker_id
       and employment.company_id = line.company_id
       and employment.end_date is null
     where line.status in ('Open', 'Partially Committed', 'Fully Committed')
       and (
         employment.id is null
         or w.primary_trade_id <> line.trade_role_id
         or w.primary_proficiency_id <> line.proficiency_id
       )
  ) then
    raise exception 'live capacity worker links fail employment or classification validation'
      using errcode = '23514';
  end if;
end;
$$;

create or replace function enforce_capacity_line_worker_eligibility()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_trade_role_id uuid;
  v_proficiency_id uuid;
begin
  select line.company_id, line.trade_role_id, line.proficiency_id
    into v_company_id, v_trade_role_id, v_proficiency_id
    from capacity_line line
   where line.id = new.capacity_line_id;

  if not found then
    raise exception 'capacity line does not exist' using errcode = '23503';
  end if;

  if not exists (
    select 1
      from worker w
      join worker_employment employment
        on employment.worker_id = w.id
       and employment.company_id = v_company_id
       and employment.end_date is null
     where w.id = new.worker_id
       and w.primary_trade_id = v_trade_role_id
       and w.primary_proficiency_id = v_proficiency_id
  ) then
    raise exception 'worker must be actively employed by the line company with matching trade and proficiency'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function enforce_capacity_line_worker_eligibility() from public, anon, authenticated;

create trigger capacity_line_worker_eligibility
before insert or update of capacity_line_id, worker_id on capacity_line_worker
for each row execute function enforce_capacity_line_worker_eligibility();

-- ---------------------------------------------------------------- company mutation RPCs

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
  v_before worker%rowtype;
  v_match record;
  v_minimum_crew_size integer;
  v_remaining integer;
  v_knocked_out_match_ids uuid[] := '{}'::uuid[];
  v_declined_match_ids uuid[] := '{}'::uuid[];
  v_buyer_declined_match_ids uuid[] := '{}'::uuid[];
  v_buyer_renotification_match_ids uuid[] := '{}'::uuid[];
begin
  if v_is_service_role then
    v_actor := nullif(trim(coalesce(p_actor_user_id, '')), '');
    if v_actor is null then
      raise exception 'an explicit Maintain actor is required' using errcode = '42501';
    end if;
    if p_expected_status not in (
         'Active'::worker_status, 'Inactive'::worker_status, 'Suspended'::worker_status
       )
       or p_status not in (
         'Active'::worker_status, 'Inactive'::worker_status, 'Suspended'::worker_status
       ) then
      raise exception 'invalid worker status transition' using errcode = '23514';
    end if;

    select w.*
      into v_before
      from worker w
     where w.id = p_worker_id
       and w.status = p_expected_status
     for update of w;
  else
    v_actor := v_claim_actor;
    if p_actor_user_id is not null
       or v_actor is null
       or v_company_id is null
       or not current_company_has_status(
         array['Pending'::company_status, 'Active'::company_status]
       ) then
      raise exception 'company write access required' using errcode = '42501';
    end if;

    if p_expected_status not in ('Active'::worker_status, 'Inactive'::worker_status)
       or p_status not in ('Active'::worker_status, 'Inactive'::worker_status) then
      raise exception 'company users cannot set that worker status' using errcode = '42501';
    end if;

    select w.*
      into v_before
      from worker w
      join worker_employment employment
        on employment.worker_id = w.id
       and employment.company_id = v_company_id
       and employment.end_date is null
     where w.id = p_worker_id
       and w.status = p_expected_status
       and w.status in ('Active', 'Inactive')
     for update of w;
  end if;

  if not found then
    raise exception 'worker is not company-manageable' using errcode = '42501';
  end if;

  update worker set status = p_status where id = p_worker_id;

  insert into audit_event (
    actor_user_id, actor_is_system, action, entity_type, entity_id,
    before_data, after_data
  ) values (
    v_actor, false, 'worker.status_changed', 'worker', p_worker_id::text,
    jsonb_build_object('status', v_before.status),
    jsonb_build_object('status', p_status)
  );

  if p_status <> 'Active'::worker_status then
    select coalesce(
      (select value_int from platform_config where key = 'minimum_crew_size'),
      1
    ) into v_minimum_crew_size;

    -- Lock each affected open match before changing its nomination or checking the
    -- crew floor. This prevents a concurrent acceptance/substitution from observing
    -- a half-applied worker-status cascade.
    for v_match in
      select m.id, m.status, m.supplier_company_id, m.buyer_company_id
        from match m
        join match_worker mw on mw.match_id = m.id
       where mw.worker_id = p_worker_id
         and mw.knocked_out = false
         and m.status in ('Awaiting Supplier', 'Awaiting Buyer')
       order by m.id
       for update of m
    loop
      update match_worker
         set knocked_out = true,
             knocked_out_reason = 'worker is no longer active',
             knocked_out_at = now()
       where match_id = v_match.id
         and worker_id = p_worker_id
         and knocked_out = false;

      if not found then
        continue;
      end if;

      v_knocked_out_match_ids := array_append(v_knocked_out_match_ids, v_match.id);
      insert into audit_event (
        actor_user_id, actor_is_system, action, entity_type, entity_id, after_data
      ) values (
        v_actor, false, 'match.nomination_knocked_out', 'match', v_match.id::text,
        jsonb_build_object(
          'worker_id', p_worker_id,
          'reason', 'worker is no longer active'
        )
      );

      select count(*) into v_remaining
        from match_worker
       where match_id = v_match.id
         and knocked_out = false;

      if v_remaining < v_minimum_crew_size then
        update match
           set status = 'Declined',
               decline_reason = 'auto-declined: nominations fell below the minimum crew size'
         where id = v_match.id;

        update match_worker
           set knocked_out = true,
               knocked_out_reason = 'match auto-declined below the minimum crew size',
               knocked_out_at = now()
         where match_id = v_match.id
           and knocked_out = false;

        v_declined_match_ids := array_append(v_declined_match_ids, v_match.id);
        if v_match.status = 'Awaiting Buyer'::match_status then
          v_buyer_declined_match_ids := array_append(v_buyer_declined_match_ids, v_match.id);
        end if;

        insert into audit_event (
          actor_user_id, actor_is_system, action, entity_type, entity_id,
          before_data, after_data
        ) values (
          v_actor, false, 'match.auto_declined', 'match', v_match.id::text,
          jsonb_build_object('status', v_match.status),
          jsonb_build_object('status', 'Declined', 'reason', 'below minimum crew size')
        );
      elsif v_match.status = 'Awaiting Buyer'::match_status then
        -- The buyer already saw a name-free nomination summary. Its composition has
        -- changed, so notify it to re-open the same projection even though the crew
        -- remains above the configured floor.
        v_buyer_renotification_match_ids := array_append(
          v_buyer_renotification_match_ids,
          v_match.id
        );
      end if;
    end loop;
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
  v_after jsonb;
begin
  if v_actor is null
     or v_company_id is null
     or not current_company_has_status(array['Active'::company_status]) then
    raise exception 'active company access required' using errcode = '42501';
  end if;

  select * into v_before
    from capacity_line
   where id = p_line_id and company_id = v_company_id
   for update;

  if not found then
    raise exception 'capacity line is not owned by this company' using errcode = '42501';
  end if;
  if v_before.status <> 'Open' then
    raise exception 'committed or historical capacity cannot be edited' using errcode = '23514';
  end if;
  if p_available_until < p_available_from
     or p_hours_per_week <= 0
     or p_supplier_rate_cents <= 0
     or coalesce(cardinality(p_worker_ids), 0) = 0 then
    raise exception 'capacity line edit is invalid' using errcode = '23514';
  end if;
  if (select count(*) <> count(distinct worker_id) from unnest(p_worker_ids) worker_id) then
    raise exception 'capacity worker ids must be unique' using errcode = '23514';
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
      from capacity_line other_line
      join capacity_line_worker other_link
        on other_link.capacity_line_id = other_line.id
     where other_line.id <> p_line_id
       and other_line.status in ('Open', 'Partially Committed')
       and other_link.worker_id = any (p_worker_ids)
       and daterange(other_line.available_from, other_line.available_until, '[]')
           && daterange(p_available_from, p_available_until, '[]')
  ) then
    raise exception 'a worker already has overlapping open capacity' using errcode = '23514';
  end if;

  update capacity_line
     set available_from = p_available_from,
         available_until = p_available_until,
         available_days = nullif(trim(p_available_days), ''),
         hours_per_week = p_hours_per_week,
         supplier_rate_cents = p_supplier_rate_cents,
         rate_entered_by = v_actor,
         rate_entered_by_admin = false
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
    to_jsonb(v_before), v_after
  );

  return p_line_id;
end;
$$;

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
  if v_actor is null
     or v_company_id is null
     or not current_company_has_status(array['Active'::company_status]) then
    raise exception 'active company access required' using errcode = '42501';
  end if;

  select * into v_before
    from capacity_line
   where id = p_line_id and company_id = v_company_id
   for update;

  if not found then
    raise exception 'capacity line is not owned by this company' using errcode = '42501';
  end if;
  if v_before.status = 'Withdrawn' then
    return p_line_id;
  end if;
  if v_before.status not in ('Open', 'Partially Committed') then
    raise exception 'capacity line cannot transition to Withdrawn' using errcode = '23514';
  end if;
  if exists (
    select 1 from match m
     where m.capacity_line_id = p_line_id
       and m.status in ('Awaiting Supplier', 'Awaiting Buyer')
  ) then
    raise exception 'an open match blocks capacity withdrawal' using errcode = '23514';
  end if;

  update capacity_line set status = 'Withdrawn' where id = p_line_id;
  insert into audit_event (
    actor_user_id, actor_is_system, action, entity_type, entity_id,
    before_data, after_data
  ) values (
    v_actor, false, 'capacity.withdrawn', 'capacity_line', p_line_id::text,
    jsonb_build_object('status', v_before.status),
    jsonb_build_object('status', 'Withdrawn')
  );

  return p_line_id;
end;
$$;

create or replace function update_company_demand_line(
  p_line_id uuid,
  p_quantity integer,
  p_start_date date,
  p_end_date date,
  p_hours_per_week numeric,
  p_notes text
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
  v_filled integer;
  v_after jsonb;
begin
  if v_actor is null
     or v_company_id is null
     or not current_company_has_status(array['Active'::company_status]) then
    raise exception 'active company access required' using errcode = '42501';
  end if;

  select * into v_before
    from demand_line
   where id = p_line_id and company_id = v_company_id
   for update;

  if not found then
    raise exception 'demand line is not owned by this company' using errcode = '42501';
  end if;
  if v_before.status not in ('Open', 'Partially Filled') then
    raise exception 'filled or historical demand cannot be edited' using errcode = '23514';
  end if;
  if p_quantity <= 0 or p_end_date < p_start_date or p_hours_per_week <= 0 then
    raise exception 'demand line edit is invalid' using errcode = '23514';
  end if;
  if exists (
    select 1 from match m
     where m.demand_line_id = p_line_id
       and m.status in ('Awaiting Supplier', 'Awaiting Buyer')
  ) then
    raise exception 'an open match blocks demand edits' using errcode = '23514';
  end if;
  select count(distinct ew.worker_id)::integer
    into v_filled
    from engagement e
    join engagement_worker ew on ew.engagement_id = e.id
   where e.demand_line_id = p_line_id
     and e.status in ('Awaiting Commercial', 'Confirmed', 'Active');
  if p_quantity < coalesce(v_filled, 0) then
    raise exception 'quantity cannot fall below filled quantity' using errcode = '23514';
  end if;

  update demand_line
     set quantity = p_quantity,
         start_date = p_start_date,
         end_date = p_end_date,
         hours_per_week = p_hours_per_week,
         notes = nullif(trim(p_notes), '')
   where id = p_line_id;

  select to_jsonb(line) into v_after from demand_line line where line.id = p_line_id;
  insert into audit_event (
    actor_user_id, actor_is_system, action, entity_type, entity_id,
    before_data, after_data
  ) values (
    v_actor, false, 'demand.line_edited', 'demand_line', p_line_id::text,
    to_jsonb(v_before), v_after
  );

  return p_line_id;
end;
$$;

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
  if v_actor is null
     or v_company_id is null
     or not current_company_has_status(array['Active'::company_status]) then
    raise exception 'active company access required' using errcode = '42501';
  end if;

  select * into v_before
    from demand_line
   where id = p_line_id and company_id = v_company_id
   for update;

  if not found then
    raise exception 'demand line is not owned by this company' using errcode = '42501';
  end if;
  if v_before.status = 'Withdrawn' then
    return p_line_id;
  end if;
  if v_before.status not in ('Open', 'Partially Filled') then
    raise exception 'demand line cannot transition to Withdrawn' using errcode = '23514';
  end if;
  if exists (
    select 1 from match m
     where m.demand_line_id = p_line_id
       and m.status in ('Awaiting Supplier', 'Awaiting Buyer')
  ) then
    raise exception 'an open match blocks demand withdrawal' using errcode = '23514';
  end if;

  update demand_line set status = 'Withdrawn' where id = p_line_id;
  insert into audit_event (
    actor_user_id, actor_is_system, action, entity_type, entity_id,
    before_data, after_data
  ) values (
    v_actor, false, 'demand.withdrawn', 'demand_line', p_line_id::text,
    jsonb_build_object('status', v_before.status),
    jsonb_build_object('status', 'Withdrawn')
  );

  return p_line_id;
end;
$$;

revoke all on function set_company_worker_status(uuid, worker_status, worker_status, text)
  from public, anon, authenticated, service_role;
grant execute on function set_company_worker_status(uuid, worker_status, worker_status, text)
  to authenticated, service_role;

revoke all on function update_company_capacity_line(
  uuid, date, date, text, numeric, bigint, uuid[], uuid[]
) from public, anon, authenticated;
grant execute on function update_company_capacity_line(
  uuid, date, date, text, numeric, bigint, uuid[], uuid[]
) to authenticated;

revoke all on function withdraw_company_capacity_line(uuid)
  from public, anon, authenticated;
grant execute on function withdraw_company_capacity_line(uuid)
  to authenticated;

revoke all on function update_company_demand_line(
  uuid, integer, date, date, numeric, text
) from public, anon, authenticated;
grant execute on function update_company_demand_line(
  uuid, integer, date, date, numeric, text
) to authenticated;

revoke all on function withdraw_company_demand_line(uuid)
  from public, anon, authenticated;
grant execute on function withdraw_company_demand_line(uuid)
  to authenticated;

-- The original engagement transition predates this hardening slice and omitted
-- the service-role grant after revoking authenticated callers. Keep the existing
-- Maintain action viable until the dedicated atomic engagement RPC supersedes it.
grant execute on function set_engagement_status(uuid, engagement_status, date)
  to service_role;

-- ---------------------------------------------------------------- commercial identity marker

alter table engagement
  add column commercial_confirmed_at timestamptz;

-- Existing rows that demonstrably crossed the commercial trigger retain their
-- historical reveal state. A pre-commercial cancellation remains NULL.
update engagement
   set commercial_confirmed_at = coalesce(completed_at, created_at)
 where status in ('Confirmed', 'Active', 'Completed', 'Disputed')
    or (
      status = 'Cancelled'
      and payment_status <> 'none'
    );

create or replace function enforce_engagement_commercial_marker()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.commercial_confirmed_at is not null
       and new.payment_status <> 'pre-authorised' then
      raise exception 'commercial marker requires payment pre-authorisation'
        using errcode = '23514';
    end if;
    return new;
  end if;

  if old.commercial_confirmed_at is not null
     and new.commercial_confirmed_at is distinct from old.commercial_confirmed_at then
    raise exception 'commercial confirmation timestamp is immutable'
      using errcode = '23514';
  end if;
  if old.commercial_confirmed_at is null
     and new.commercial_confirmed_at is not null
     and new.payment_status <> 'pre-authorised' then
    raise exception 'commercial marker requires payment pre-authorisation'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function enforce_engagement_commercial_marker()
  from public, anon, authenticated;

create trigger engagement_commercial_marker_immutable
before insert or update on engagement
for each row execute function enforce_engagement_commercial_marker();

create or replace view buyer_engagement_view
as
select
  e.id,
  e.demand_line_id,
  e.status,
  e.start_date,
  e.end_date,
  e.hours_per_week,
  e.buyer_rate_cents,
  e.expected_hours,
  e.estimated_buyer_value_cents,
  e.payment_status,
  case when e.commercial_confirmed_at is not null then e.supplier_company_id end
    as supplier_company_id,
  e.actual_hours,
  e.completed_at,
  e.commercial_confirmed_at
from engagement e
where e.buyer_company_id = current_company_id();

create or replace view supplier_engagement_view
as
select
  e.id,
  e.capacity_line_id,
  e.status,
  e.start_date,
  e.end_date,
  e.hours_per_week,
  e.supplier_rate_cents,
  e.expected_hours,
  e.estimated_supplier_value_cents,
  e.payment_status,
  case when e.commercial_confirmed_at is not null then e.buyer_company_id end
    as buyer_company_id,
  e.actual_hours,
  e.completed_at,
  e.commercial_confirmed_at
from engagement e
where e.supplier_company_id = current_company_id();

-- Views inherit broad default table privileges in this project and are updatable.
-- Make the final ACL explicit after replacing the two engagement projections.
revoke all on
  buyer_match_view,
  supplier_match_view,
  buyer_engagement_view,
  supplier_engagement_view,
  company_transfer_view
from public, anon, authenticated;

grant select on
  buyer_match_view,
  supplier_match_view,
  buyer_engagement_view,
  supplier_engagement_view,
  company_transfer_view
to authenticated;
