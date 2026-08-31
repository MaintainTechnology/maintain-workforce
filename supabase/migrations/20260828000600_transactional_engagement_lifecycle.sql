-- Transactional engagement lifecycle — modules 12.5, 13, 18 and 19.
--
-- Engagement status is denormalised onto engagement_worker for the 13.6 exclusion
-- constraint, while the commercial marker controls identity reveal. These values,
-- their transition fields and their audit evidence therefore move in one database
-- transaction or not at all.

-- 13.1: fail loudly if earlier application-level races created duplicate parents.
-- Do not silently choose which commercial record survives.
do $$
begin
  if exists (
    select match_id
      from engagement
     group by match_id
    having count(*) > 1
  ) then
    raise exception 'duplicate engagements exist for one or more matches; repair before adding uniqueness'
      using errcode = '23505';
  end if;
  if exists (
    select 1
      from engagement e
      left join engagement_worker ew on ew.engagement_id = e.id
     group by e.id
    having count(ew.id) = 0
  ) then
    raise exception 'engagements without workers exist; repair partial buyer acceptance before lifecycle migration'
      using errcode = '23514';
  end if;
end;
$$;

alter table engagement
  add constraint engagement_one_per_match unique (match_id);

-- Only the authoritative functions below may change lifecycle/payment/outcome state.
-- The transaction-local flag cannot leak into a later PostgREST request.
create or replace function enforce_authoritative_engagement_lifecycle_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_setting('app.engagement_lifecycle_authorized', true) is distinct from 'on' then
    raise exception 'engagement lifecycle writes require an authoritative RPC'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function enforce_authoritative_engagement_lifecycle_write()
  from public, anon, authenticated;

create trigger engagement_authoritative_lifecycle_write
before update of
  status,
  payment_status,
  external_payment_ref,
  commercial_confirmed_at,
  end_date,
  actual_hours,
  actual_value_cents,
  completed_at,
  dispute_notes,
  cancelled_by,
  cancel_reason,
  within_notice_window
on engagement
for each row execute function enforce_authoritative_engagement_lifecycle_write();

-- Preserve the marker-derived projection repair from 003, and make the coupling
-- bidirectional: reveal starts only with a paid Confirmed/Active transition, while a
-- post-trigger Completed/Disputed row can never lose its historical marker.
create or replace function enforce_engagement_commercial_marker()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'Awaiting Commercial'
       or new.payment_status <> 'none'
       or new.commercial_confirmed_at is not null
       or new.completed_at is not null
       or new.actual_hours is not null
       or new.actual_value_cents is not null
       or new.cancelled_by is not null
       or new.cancel_reason is not null
       or new.within_notice_window is not null
       or new.dispute_notes is not null then
      raise exception 'new engagements must begin in Awaiting Commercial with no payment, marker or outcome'
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
     and (
       new.payment_status <> 'pre-authorised'
       or new.status not in ('Confirmed', 'Active')
     ) then
    raise exception 'commercial marker requires a confirmed lifecycle status and payment pre-authorisation'
      using errcode = '23514';
  end if;

  if new.status in ('Confirmed', 'Active', 'Completed', 'Disputed')
     and new.commercial_confirmed_at is null then
    raise exception 'confirmed lifecycle status requires the commercial marker'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

-- 13.4: payment changes and the commercial trigger share one locked transaction.
create or replace function record_engagement_payment(
  p_engagement_id uuid,
  p_expected_status engagement_status,
  p_payment_status payment_status,
  p_external_payment_ref text,
  p_actor_user_id text,
  p_effective_date date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before engagement%rowtype;
  v_next_status engagement_status;
  v_now timestamptz := now();
  v_triggered boolean := false;
  v_activated boolean := false;
  v_worker_count integer := 0;
begin
  if nullif(trim(p_actor_user_id), '') is null then
    raise exception 'a human actor is required for payment changes' using errcode = '42501';
  end if;
  if p_effective_date is null then
    raise exception 'an effective Brisbane date is required' using errcode = '22004';
  end if;

  select * into v_before
    from engagement
   where id = p_engagement_id
     and status = p_expected_status
   for update;

  if not found then
    raise exception 'engagement status changed; refresh before retrying'
      using errcode = '40001';
  end if;

  v_next_status := v_before.status;
  if p_payment_status = 'pre-authorised' then
    if v_before.status <> 'Awaiting Commercial' then
      raise exception 'payment pre-authorisation is only valid from Awaiting Commercial'
        using errcode = '23514';
    end if;
    v_triggered := true;
    v_activated := v_before.start_date <= p_effective_date;
    v_next_status := case when v_activated then 'Active' else 'Confirmed' end;
  elsif p_payment_status in ('released', 'disputed')
        and v_before.commercial_confirmed_at is null then
    raise exception 'released or disputed payment requires an existing commercial trigger'
      using errcode = '23514';
  end if;

  perform set_config('app.engagement_lifecycle_authorized', 'on', true);

  if v_triggered then
    update engagement
       set payment_status = p_payment_status,
           external_payment_ref = nullif(trim(p_external_payment_ref), ''),
           commercial_confirmed_at = v_now,
           status = v_next_status
     where id = p_engagement_id;

    update engagement_worker
       set status = v_next_status,
           committed_window = daterange(v_before.start_date, v_before.end_date, '[]')
     where engagement_id = p_engagement_id;
    get diagnostics v_worker_count = row_count;
    if v_worker_count = 0 then
      raise exception 'engagement has no workers; commercial trigger rolled back'
        using errcode = '23514';
    end if;
  else
    update engagement
       set payment_status = p_payment_status,
           external_payment_ref = nullif(trim(p_external_payment_ref), '')
     where id = p_engagement_id;
  end if;

  insert into audit_event (
    actor_user_id, actor_is_system, action, entity_type, entity_id,
    before_data, after_data
  ) values (
    p_actor_user_id, false, 'engagement.payment_status_recorded', 'engagement', p_engagement_id,
    jsonb_build_object(
      'status', v_before.status,
      'payment_status', v_before.payment_status,
      'external_payment_ref', v_before.external_payment_ref
    ),
    jsonb_build_object(
      'status', v_next_status,
      'payment_status', p_payment_status,
      'external_payment_ref', nullif(trim(p_external_payment_ref), '')
    )
  );

  if v_triggered then
    insert into audit_event (
      actor_user_id, actor_is_system, action, entity_type, entity_id,
      before_data, after_data
    ) values (
      p_actor_user_id, false, 'engagement.confirmed', 'engagement', p_engagement_id,
      jsonb_build_object('status', 'Awaiting Commercial'),
      jsonb_build_object('status', 'Confirmed', 'trigger', 'payment pre-authorised')
    );

    if v_activated then
      insert into audit_event (
        actor_user_id, actor_is_system, action, entity_type, entity_id,
        before_data, after_data
      ) values (
        p_actor_user_id, false, 'engagement.activated', 'engagement', p_engagement_id,
        jsonb_build_object('status', 'Confirmed'),
        jsonb_build_object(
          'status', 'Active',
          'reason', 'commercial trigger recorded on or after start date'
        )
      );
    end if;
  end if;

  return jsonb_build_object(
    'engagement_id', p_engagement_id,
    'previous_status', v_before.status,
    'status', v_next_status,
    'payment_status', p_payment_status,
    'triggered', v_triggered,
    'activated', v_activated,
    'buyer_company_id', v_before.buyer_company_id,
    'supplier_company_id', v_before.supplier_company_id
  );
end;
$$;

revoke all on function record_engagement_payment(
  uuid, engagement_status, payment_status, text, text, date
) from public, anon, authenticated;
grant execute on function record_engagement_payment(
  uuid, engagement_status, payment_status, text, text, date
) to service_role;

-- 13.2/13.3/13.5: the canonical non-commercial lifecycle transition function.
create or replace function transition_engagement_lifecycle(
  p_engagement_id uuid,
  p_expected_status engagement_status,
  p_target_status engagement_status,
  p_actor_user_id text,
  p_actor_is_system boolean,
  p_effective_date date,
  p_end_date date default null,
  p_actual_hours numeric default null,
  p_actual_value_cents bigint default null,
  p_cancel_reason text default null,
  p_within_notice_window boolean default null,
  p_dispute_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before engagement%rowtype;
  v_after engagement%rowtype;
  v_effective_end date;
  v_action text;
  v_now timestamptz := now();
  v_worker_count integer := 0;
begin
  if p_actor_is_system is null then
    raise exception 'actor type is required' using errcode = '22004';
  end if;
  if p_actor_is_system then
    if p_actor_user_id is not null then
      raise exception 'system transitions cannot carry a human actor' using errcode = '42501';
    end if;
  elsif nullif(trim(p_actor_user_id), '') is null then
    raise exception 'a human actor is required' using errcode = '42501';
  end if;
  if p_effective_date is null then
    raise exception 'an effective Brisbane date is required' using errcode = '22004';
  end if;

  select * into v_before
    from engagement
   where id = p_engagement_id
     and status = p_expected_status
   for update;

  if not found then
    raise exception 'engagement status changed; refresh before retrying'
      using errcode = '40001';
  end if;

  v_effective_end := v_before.end_date;

  if v_before.status = 'Confirmed' and p_target_status = 'Active' then
    if not p_actor_is_system then
      raise exception 'activation is owned by the daily system actor' using errcode = '42501';
    end if;
    if v_before.start_date > p_effective_date then
      raise exception 'engagement cannot activate before its start date' using errcode = '23514';
    end if;
    v_action := 'engagement.activated';

  elsif v_before.status = 'Active' and p_target_status = 'Completed'
     or v_before.status = 'Disputed' and p_target_status = 'Completed' then
    if v_before.status = 'Disputed' and p_actor_is_system then
      raise exception 'dispute resolution requires a Maintain actor' using errcode = '42501';
    end if;
    if p_actor_is_system
       and (p_end_date is not null or v_before.end_date >= p_effective_date) then
      raise exception 'automatic completion is valid only after the stored end date'
        using errcode = '23514';
    end if;
    if p_end_date is not null then
      if p_end_date < v_before.start_date
         or p_end_date > v_before.end_date
         or p_end_date > p_effective_date then
        raise exception 'early completion end date must be inside the engagement window and not in the future'
          using errcode = '23514';
      end if;
      v_effective_end := p_end_date;
    elsif v_before.completed_at is null and v_before.end_date >= p_effective_date then
      raise exception 'an explicit end date is required for early completion'
        using errcode = '23514';
    end if;
    if p_actual_hours is not null and p_actual_hours < 0 then
      raise exception 'actual hours cannot be negative' using errcode = '23514';
    end if;
    if p_actual_value_cents is not null and p_actual_value_cents < 0 then
      raise exception 'actual value cannot be negative' using errcode = '23514';
    end if;
    v_action := 'engagement.completed';

  elsif v_before.status in ('Awaiting Commercial', 'Confirmed', 'Active', 'Disputed')
     and p_target_status = 'Cancelled' then
    if p_actor_is_system then
      raise exception 'cancellation requires a Maintain actor' using errcode = '42501';
    end if;
    if nullif(trim(p_cancel_reason), '') is null or p_within_notice_window is null then
      raise exception 'cancellation reason and notice-window decision are required'
        using errcode = '23514';
    end if;
    v_action := 'engagement.cancelled';

  elsif v_before.status in ('Active', 'Completed') and p_target_status = 'Disputed' then
    if p_actor_is_system then
      raise exception 'dispute requires a Maintain actor' using errcode = '42501';
    end if;
    if nullif(trim(p_dispute_notes), '') is null then
      raise exception 'dispute notes are required' using errcode = '23514';
    end if;
    v_action := 'engagement.disputed';

  else
    raise exception 'illegal engagement transition: % -> %', v_before.status, p_target_status
      using errcode = '23514';
  end if;

  perform set_config('app.engagement_lifecycle_authorized', 'on', true);

  update engagement
     set status = p_target_status,
         end_date = v_effective_end,
         actual_hours = case
           when p_target_status = 'Completed' then coalesce(p_actual_hours, actual_hours)
           else actual_hours
         end,
         actual_value_cents = case
           when p_target_status = 'Completed' then coalesce(p_actual_value_cents, actual_value_cents)
           else actual_value_cents
         end,
         completed_at = case
           when p_target_status = 'Completed' then coalesce(completed_at, v_now)
           else completed_at
         end,
         cancelled_by = case
           when p_target_status = 'Cancelled' then p_actor_user_id
           else cancelled_by
         end,
         cancel_reason = case
           when p_target_status = 'Cancelled' then trim(p_cancel_reason)
           else cancel_reason
         end,
         within_notice_window = case
           when p_target_status = 'Cancelled' then p_within_notice_window
           else within_notice_window
         end,
         dispute_notes = case
           when p_target_status = 'Disputed' then trim(p_dispute_notes)
           else dispute_notes
         end
   where id = p_engagement_id
   returning * into v_after;

  update engagement_worker
     set status = p_target_status,
         committed_window = daterange(v_before.start_date, v_effective_end, '[]')
   where engagement_id = p_engagement_id;
  get diagnostics v_worker_count = row_count;
  if v_worker_count = 0 then
    raise exception 'engagement has no workers; lifecycle transition rolled back'
      using errcode = '23514';
  end if;

  insert into audit_event (
    actor_user_id, actor_is_system, action, entity_type, entity_id,
    before_data, after_data
  ) values (
    p_actor_user_id,
    p_actor_is_system,
    v_action,
    'engagement',
    p_engagement_id,
    jsonb_build_object(
      'status', v_before.status,
      'end_date', v_before.end_date,
      'actual_hours', v_before.actual_hours,
      'actual_value_cents', v_before.actual_value_cents
    ),
    jsonb_build_object(
      'status', v_after.status,
      'end_date', v_after.end_date,
      'actual_hours', v_after.actual_hours,
      'actual_value_cents', v_after.actual_value_cents,
      'completed_at', v_after.completed_at,
      'cancelled_by', v_after.cancelled_by,
      'cancel_reason', v_after.cancel_reason,
      'within_notice_window', v_after.within_notice_window,
      'dispute_notes', v_after.dispute_notes
    )
  );

  return jsonb_build_object(
    'engagement_id', p_engagement_id,
    'previous_status', v_before.status,
    'status', v_after.status,
    'end_date', v_after.end_date,
    'buyer_company_id', v_before.buyer_company_id,
    'supplier_company_id', v_before.supplier_company_id
  );
end;
$$;

revoke all on function transition_engagement_lifecycle(
  uuid, engagement_status, engagement_status, text, boolean, date,
  date, numeric, bigint, text, boolean, text
) from public, anon, authenticated;
grant execute on function transition_engagement_lifecycle(
  uuid, engagement_status, engagement_status, text, boolean, date,
  date, numeric, bigint, text, boolean, text
) to service_role;

-- 13.3: the daily job may complete an engagement before Maintain has the actual
-- outcome. Recording those figures afterward is a same-status edit, not a fictional
-- lifecycle transition, but it is still locked, guarded and audited.
create or replace function record_engagement_outcome(
  p_engagement_id uuid,
  p_actual_hours numeric,
  p_actual_value_cents bigint,
  p_actor_user_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before engagement%rowtype;
  v_after engagement%rowtype;
begin
  if nullif(trim(p_actor_user_id), '') is null then
    raise exception 'a human actor is required for outcome changes' using errcode = '42501';
  end if;
  if p_actual_hours is null and p_actual_value_cents is null then
    raise exception 'at least one actual outcome value is required' using errcode = '22004';
  end if;
  if p_actual_hours is not null and p_actual_hours < 0 then
    raise exception 'actual hours cannot be negative' using errcode = '23514';
  end if;
  if p_actual_value_cents is not null and p_actual_value_cents < 0 then
    raise exception 'actual value cannot be negative' using errcode = '23514';
  end if;

  select * into v_before
    from engagement
   where id = p_engagement_id
     and status = 'Completed'
   for update;

  if not found then
    raise exception 'actual outcomes can be recorded only on a Completed engagement'
      using errcode = '40001';
  end if;

  perform set_config('app.engagement_lifecycle_authorized', 'on', true);

  update engagement
     set actual_hours = coalesce(p_actual_hours, actual_hours),
         actual_value_cents = coalesce(p_actual_value_cents, actual_value_cents)
   where id = p_engagement_id
   returning * into v_after;

  insert into audit_event (
    actor_user_id, actor_is_system, action, entity_type, entity_id,
    before_data, after_data
  ) values (
    p_actor_user_id, false, 'engagement.outcome_recorded', 'engagement', p_engagement_id,
    jsonb_build_object(
      'actual_hours', v_before.actual_hours,
      'actual_value_cents', v_before.actual_value_cents
    ),
    jsonb_build_object(
      'actual_hours', v_after.actual_hours,
      'actual_value_cents', v_after.actual_value_cents
    )
  );

  return jsonb_build_object(
    'engagement_id', p_engagement_id,
    'previous_status', v_before.status,
    'status', v_after.status,
    'buyer_company_id', v_before.buyer_company_id,
    'supplier_company_id', v_before.supplier_company_id,
    'actual_hours', v_after.actual_hours,
    'actual_value_cents', v_after.actual_value_cents
  );
end;
$$;

revoke all on function record_engagement_outcome(uuid, numeric, bigint, text)
  from public, anon, authenticated;
grant execute on function record_engagement_outcome(uuid, numeric, bigint, text)
  to service_role;

-- Retire the unchecked compatibility path granted in 003. It remains defined for
-- migration history, but application/service-role callers cannot bypass CAS or audit.
revoke all on function set_engagement_status(uuid, engagement_status, date)
  from public, anon, authenticated, service_role;
