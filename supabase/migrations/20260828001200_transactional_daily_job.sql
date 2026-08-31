-- Clock-driven transitions and their durable notification outbox (MVP 19).
-- No provider calls occur in this transaction. Failed delivery cannot undo work;
-- interruption after commit leaves the immutable payload available for dispatch.

create or replace function queue_daily_notification(
  p_day date, p_trigger text, p_to text, p_company_id uuid,
  p_entity_type text, p_entity_id uuid, p_subject text, p_body text, p_url text,
  p_event_scope text default null
)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if nullif(trim(p_to), '') is null then return; end if;
  insert into notification (
    trigger, recipient_email, recipient_company_id, entity_type, entity_id,
    subject, body, action_url, dedupe_key
  ) values (
    p_trigger, p_to, p_company_id, p_entity_type, p_entity_id,
    p_subject, p_body, p_url,
    concat_ws(':', coalesce(p_event_scope, 'daily:' || p_day::text), p_entity_type, p_entity_id, p_trigger,
      coalesce(p_company_id::text, 'maintain'), lower(p_to))
  ) on conflict (dedupe_key) do nothing;
end;
$$;
revoke all on function queue_daily_notification(date,text,text,uuid,text,uuid,text,text,text,text)
  from public, anon, authenticated, service_role;

create or replace function queue_daily_knockout_notifications(
  p_result jsonb, p_day date, p_maintain_email text, p_base_url text
)
returns void language plpgsql security definer set search_path = public
as $$
declare
  v_match_id uuid := (p_result ->> 'match_id')::uuid;
  v_supplier_id uuid := (p_result ->> 'supplier_company_id')::uuid;
  v_buyer_id uuid := (p_result ->> 'buyer_company_id')::uuid;
  v_company_id uuid;
  v_email text;
begin
  if not coalesce((p_result ->> 'changed')::boolean, false) then return; end if;
  select contact_email into v_email from company where id = v_supplier_id;
  perform queue_daily_notification(p_day, 'nomination knocked out with substitution prompt',
    v_email, v_supplier_id, 'match', v_match_id, 'The available crew changed on a match',
    case when p_result ->> 'status_after' = 'Declined'
      then 'A nomination is no longer eligible and the match fell below the minimum crew size. Maintain will review the next proposal.'
      else 'A nomination is no longer eligible. Open the match to substitute from the same capacity line.' end,
    p_base_url || '/app/matches/' || v_match_id);

  if p_result ->> 'status_before' = 'Awaiting Buyer' and p_result ->> 'status_after' <> 'Declined' then
    select contact_email into v_email from company where id = v_buyer_id;
    perform queue_daily_notification(p_day, 'nomination knocked out with substitution prompt',
      v_email, v_buyer_id, 'match', v_match_id, 'The available crew changed on a match',
      'Open the match to review the updated, name-free crew summary before deciding.',
      p_base_url || '/app/matches/' || v_match_id);
  end if;
  if p_result ->> 'status_after' = 'Declined' then
    foreach v_company_id in array array[v_supplier_id,
      case when p_result ->> 'status_before' = 'Awaiting Buyer' then v_buyer_id end]
    loop
      select contact_email into v_email from company where id = v_company_id;
      perform queue_daily_notification(p_day, 'match auto-Declined by knockout below minimum crew size',
        v_email, v_company_id, 'match', v_match_id, 'A match was declined automatically',
        'A match fell below the minimum crew size. Maintain will review the next proposal.',
        p_base_url || '/app/matches/' || v_match_id);
    end loop;
    perform queue_daily_notification(p_day, 'match auto-Declined by knockout below minimum crew size',
      p_maintain_email, null, 'match', v_match_id, 'Match auto-declined below minimum crew size',
      'Credential expiry reduced a match below the minimum crew size. Review it in the matching workspace.',
      p_base_url || '/admin/matching');
  end if;
end;
$$;
revoke all on function queue_daily_knockout_notifications(jsonb,date,text,text)
  from public, anon, authenticated, service_role;

create or replace function run_daily_state_transitions(
  p_today date, p_maintain_email text, p_base_url text
)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_row record;
  v_nomination record;
  v_status document_status;
  v_trigger text;
  v_subject text;
  v_body text;
  v_result jsonb;
  v_transfer jsonb;
  v_company_id uuid;
  v_email text;
  v_base text := rtrim(p_base_url, '/');
  v_documents integer := 0;
  v_qualifications integer := 0;
  v_capacity integer := 0;
  v_demand integer := 0;
  v_matches integer := 0;
  v_activated integer := 0;
  v_completed integer := 0;
  v_overdue integer := 0;
  v_transfers integer := 0;
  v_knockouts integer := 0;
  v_locked_company_ids uuid[];
  v_locked_worker_ids uuid[];
begin
  if p_today is null or v_base is null or v_base !~ '^https?://' then
    raise exception 'A Brisbane date and application URL are required' using errcode = '22023';
  end if;
  -- Serialise duplicate invocations, including the audit-only Overdue event. This
  -- lock is transaction-scoped: a failed run releases it without a stuck job flag.
  perform pg_advisory_xact_lock(hashtextextended('maintain.daily-state-transitions', 0));
  -- The job touches compliance across the whole marketplace. Capture and lock
  -- that universe in the same company -> worker -> demand -> capacity order as
  -- interactive workflows, before any document updates or nomination cascades.
  select coalesce(array_agg(id order by id), array[]::uuid[])
    into v_locked_company_ids from company;
  perform lock_match_companies(v_locked_company_ids);
  select coalesce(array_agg(id order by id), array[]::uuid[])
    into v_locked_worker_ids from worker;
  perform lock_match_workers(v_locked_worker_ids);
  if exists(select 1 from match m where m.status in ('Awaiting Supplier', 'Awaiting Buyer')
      and (not (m.buyer_company_id = any(v_locked_company_ids))
        or not (m.supplier_company_id = any(v_locked_company_ids))))
    or exists(select 1 from match_worker mw join match m on m.id = mw.match_id
      where not mw.knocked_out and m.status in ('Awaiting Supplier', 'Awaiting Buyer')
        and not (mw.worker_id = any(v_locked_worker_ids))) then
    raise exception 'Marketplace participants changed; retry the daily job' using errcode = '40001';
  end if;
  -- Proposal/intake transactions acquire demand before capacity. Stabilise every
  -- marketable/referenced demand before expiring capacity to keep that same order.
  perform 1 from demand_line d
    where d.status in ('Open', 'Partially Filled', 'Filled')
      or exists(select 1 from match m where m.demand_line_id = d.id
        and m.status in ('Awaiting Supplier', 'Awaiting Buyer'))
    order by d.id for update;

  for v_row in select * from company_document order by id for update loop
    v_status := case when v_row.expiry_date < p_today then 'Expired'::document_status
      when v_row.expiry_date <= p_today + 30 then 'Expiring Soon'::document_status
      else 'Current'::document_status end;
    if v_status <> v_row.status then
      update company_document set status = v_status where id = v_row.id;
      insert into audit_event(actor_is_system, action, entity_type, entity_id, before_data, after_data)
      values(true, 'company_document.status_recomputed', 'company_document', v_row.id,
        jsonb_build_object('status', v_row.status), jsonb_build_object('status', v_status, 'as_at', p_today));
      v_documents := v_documents + 1;
    end if;

    if v_status = 'Expired' and not company_is_match_compliant(v_row.company_id, p_today) then
      for v_nomination in
        select mw.match_id, mw.worker_id from match_worker mw join match m on m.id = mw.match_id
        where not mw.knocked_out and m.status in ('Awaiting Supplier', 'Awaiting Buyer')
          and m.supplier_company_id = v_row.company_id order by mw.match_id, mw.worker_id
      loop
        v_result := knock_out_match_nomination_atomic(v_nomination.match_id, v_nomination.worker_id,
          'mandatory company compliance document expired', null, true);
        if coalesce((v_result ->> 'changed')::boolean, false) then
          v_knockouts := v_knockouts + 1;
          perform queue_daily_knockout_notifications(v_result, p_today, p_maintain_email, v_base);
        end if;
      end loop;
    end if;
    if v_status = 'Current' then continue; end if;
    v_trigger := case when v_status = 'Expired' then 'document or qualification expired'
      else 'document/qualification expiring in 30 days' end;
    v_subject := case when v_status = 'Expired' then 'Compliance document expired' else 'Compliance document expiring' end;
    v_body := case when v_status = 'Expired'
      then 'A company document has expired. Update the record; any affected current engagements require Maintain review, not automatic cancellation.'
      else 'A company document expires within 30 days. Open the record to review it.' end;
    select contact_email into v_email from company where id = v_row.company_id;
    -- Uploads can start with an already-derived status. Emit the first warning
    -- regardless of a status transition, once for this credential/expiry event.
    perform queue_daily_notification(p_today, v_trigger, v_email, v_row.company_id,
      'company_document', v_row.id, v_subject, v_body, v_base || '/app/settings', 'credential:' || v_row.expiry_date::text);
    perform queue_daily_notification(p_today, v_trigger, p_maintain_email, null,
      'company_document', v_row.id, v_subject, v_body, v_base || '/admin/companies', 'credential:' || v_row.expiry_date::text);
  end loop;

  for v_row in select * from worker_qualification order by id for update loop
    v_status := case when v_row.expiry_date < p_today then 'Expired'::document_status
      when v_row.expiry_date <= p_today + 30 then 'Expiring Soon'::document_status
      else 'Current'::document_status end;
    if v_status <> v_row.status then
      update worker_qualification set status = v_status where id = v_row.id;
      insert into audit_event(actor_is_system, action, entity_type, entity_id, before_data, after_data)
      values(true, 'worker_qualification.status_recomputed', 'worker_qualification', v_row.id,
        jsonb_build_object('status', v_row.status), jsonb_build_object('status', v_status, 'as_at', p_today));
      v_qualifications := v_qualifications + 1;
    end if;

    if v_status = 'Expired' then
      for v_nomination in
        select mw.match_id, mw.worker_id from match_worker mw
        join match m on m.id = mw.match_id join worker w on w.id = mw.worker_id
        where mw.worker_id = v_row.worker_id and not mw.knocked_out
          and m.status in ('Awaiting Supplier', 'Awaiting Buyer')
          and (
            exists(select 1 from demand_line_qualification dq where dq.demand_line_id = m.demand_line_id
              and dq.qualification_id = v_row.qualification_id)
            or exists(select 1 from trade_role_qualification tq where tq.trade_role_id = w.primary_trade_id
              and tq.level = 'worker' and tq.is_mandatory and tq.qualification_id = v_row.qualification_id)
          )
          and not exists(select 1 from worker_qualification replacement
            where replacement.worker_id = v_row.worker_id
              and replacement.qualification_id = v_row.qualification_id
              and (replacement.expiry_date is null or replacement.expiry_date >= p_today))
        order by mw.match_id
      loop
        v_result := knock_out_match_nomination_atomic(v_nomination.match_id, v_nomination.worker_id,
          'required worker qualification expired', null, true);
        if coalesce((v_result ->> 'changed')::boolean, false) then
          v_knockouts := v_knockouts + 1;
          perform queue_daily_knockout_notifications(v_result, p_today, p_maintain_email, v_base);
        end if;
      end loop;
    end if;
    if v_status = 'Current' then continue; end if;
    v_trigger := case when v_status = 'Expired' then 'document or qualification expired'
      else 'document/qualification expiring in 30 days' end;
    v_subject := case when v_status = 'Expired' then 'Crew qualification expired' else 'Crew qualification expiring' end;
    v_body := case when v_status = 'Expired'
      then 'A crew qualification has expired. Update the record; any affected current engagements require Maintain review, not automatic cancellation.'
      else 'A crew qualification expires within 30 days. Open the record to review it.' end;
    select we.company_id, c.contact_email into v_company_id, v_email
      from worker_employment we join company c on c.id = we.company_id
      where we.worker_id = v_row.worker_id and we.end_date is null;
    perform queue_daily_notification(p_today, v_trigger, v_email, v_company_id,
      'worker_qualification', v_row.id, v_subject, v_body, v_base || '/app/workers', 'credential:' || v_row.expiry_date::text);
    perform queue_daily_notification(p_today, v_trigger, p_maintain_email, null,
      'worker_qualification', v_row.id, v_subject, v_body, v_base || '/admin/workers', 'credential:' || v_row.expiry_date::text);
  end loop;

  -- Filled/fully committed are display states, not terminal history. Their date
  -- windows expire too. Withdrawn and already-expired history remains untouched.
  for v_row in select id, status from capacity_line
    where status in ('Open', 'Partially Committed', 'Fully Committed') and available_until < p_today
    order by id for update
  loop
    update capacity_line set status = 'Expired' where id = v_row.id;
    insert into audit_event(actor_is_system, action, entity_type, entity_id, before_data, after_data)
    values(true, 'capacity_line.expired', 'capacity_line', v_row.id,
      jsonb_build_object('status', v_row.status), jsonb_build_object('status', 'Expired', 'as_at', p_today));
    v_capacity := v_capacity + 1;
  end loop;
  for v_row in select id, status from demand_line
    where status in ('Open', 'Partially Filled', 'Filled') and end_date < p_today order by id for update
  loop
    update demand_line set status = 'Expired' where id = v_row.id;
    insert into audit_event(actor_is_system, action, entity_type, entity_id, before_data, after_data)
    values(true, 'demand_line.expired', 'demand_line', v_row.id,
      jsonb_build_object('status', v_row.status), jsonb_build_object('status', 'Expired', 'as_at', p_today));
    v_demand := v_demand + 1;
  end loop;
  for v_row in select id from match where status in ('Awaiting Supplier', 'Awaiting Buyer') order by demand_line_id, id loop
    v_result := expire_match_atomic(v_row.id, p_today);
    if coalesce((v_result ->> 'changed')::boolean, false) then
      v_matches := v_matches + 1;
      perform queue_daily_notification(p_today, 'match expired', p_maintain_email, null, 'match', v_row.id,
        'Match expired', 'A proposed match expired. Its soft holds have been released.', v_base || '/admin/matching');
    end if;
  end loop;

  for v_row in select id, status, start_date, end_date from engagement
    where status in ('Awaiting Commercial', 'Confirmed', 'Active') order by id for update
  loop
    if v_row.status = 'Confirmed' and v_row.start_date <= p_today then
      perform transition_engagement_lifecycle(v_row.id, 'Confirmed', 'Active', null, true, p_today);
      v_row.status := 'Active';
      v_activated := v_activated + 1;
    end if;
    if v_row.status = 'Active' and v_row.end_date < p_today then
      perform transition_engagement_lifecycle(v_row.id, 'Active', 'Completed', null, true, p_today);
      v_completed := v_completed + 1;
    elsif v_row.status = 'Awaiting Commercial' and v_row.start_date <= p_today and not exists(
      select 1 from audit_event where action = 'engagement.flagged_overdue'
        and entity_id = v_row.id::text and after_data ->> 'as_at' = p_today::text
    ) then
      insert into audit_event(actor_is_system, action, entity_type, entity_id, after_data)
      values(true, 'engagement.flagged_overdue', 'engagement', v_row.id,
        jsonb_build_object('overdue', true, 'as_at', p_today));
      v_overdue := v_overdue + 1;
    end if;
  end loop;

  for v_transfer in select value from jsonb_array_elements(escalate_worker_transfers_prelocked(
    p_today, null, v_locked_company_ids, v_locked_worker_ids)) loop
    v_transfers := v_transfers + 1;
    foreach v_company_id in array array[(v_transfer ->> 'from_company_id')::uuid, (v_transfer ->> 'to_company_id')::uuid] loop
      select contact_email into v_email from company where id = v_company_id;
      perform queue_daily_notification(p_today, 'transfer escalated', v_email, v_company_id,
        'worker_transfer', (v_transfer ->> 'transfer_id')::uuid, 'Transfer request escalated to Maintain',
        'A transfer request went five business days without a response and is now with Maintain for review.',
        v_base || '/app/transfers');
    end loop;
    perform queue_daily_notification(p_today, 'transfer escalated', p_maintain_email, null,
      'worker_transfer', (v_transfer ->> 'transfer_id')::uuid, 'Transfer request escalated to Maintain',
      'A transfer request went five business days without a response and needs review.', v_base || '/admin/transfers');
  end loop;

  return jsonb_build_object(
    'company_documents_recomputed', v_documents, 'worker_qualifications_recomputed', v_qualifications,
    'capacity_lines_expired', v_capacity, 'demand_lines_expired', v_demand, 'matches_expired', v_matches,
    'engagements_activated', v_activated, 'engagements_completed', v_completed,
    'engagements_flagged_overdue', v_overdue, 'transfers_escalated', v_transfers,
    'nominations_knocked_out', v_knockouts
  );
end;
$$;
revoke all on function run_daily_state_transitions(date,text,text) from public, anon, authenticated;
grant execute on function run_daily_state_transitions(date,text,text) to service_role;

-- Existing commitments are flagged, never automatically cancelled. This read-time
-- projection clears immediately after a compliant replacement is recorded, without
-- waiting for tomorrow's job or storing a second mutable engagement status.
create or replace view engagement_compliance_review as
select e.id as engagement_id, 'company'::text as source_type, c.id as source_id,
  'A party is inactive or has an expired mandatory company document.'::text as reason
from engagement e join company c on c.id in (e.supplier_company_id, e.buyer_company_id)
where e.status in ('Awaiting Commercial', 'Confirmed', 'Active')
  and not company_is_match_compliant(c.id, (now() at time zone 'Australia/Brisbane')::date)
union all
select e.id, 'worker'::text, w.id,
  'A nominated worker is inactive or has an expired required qualification.'::text
from engagement e join engagement_worker ew on ew.engagement_id = e.id join worker w on w.id = ew.worker_id
where e.status in ('Awaiting Commercial', 'Confirmed', 'Active') and (
  w.status <> 'Active' or exists(
    select 1 from (
      select dq.qualification_id from demand_line_qualification dq where dq.demand_line_id = e.demand_line_id
      union
      select tq.qualification_id from trade_role_qualification tq where tq.trade_role_id = w.primary_trade_id
        and tq.level = 'worker' and tq.is_mandatory
    ) required
    where not exists(select 1 from worker_qualification q where q.worker_id = w.id
      and q.qualification_id = required.qualification_id
      and (q.expiry_date is null or q.expiry_date >= (now() at time zone 'Australia/Brisbane')::date))
  )
);
revoke all on engagement_compliance_review from public, anon, authenticated;
grant select on engagement_compliance_review to service_role;
