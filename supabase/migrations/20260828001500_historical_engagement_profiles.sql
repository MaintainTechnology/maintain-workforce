-- 12.5 / 17.1 / 17.2: historical engagements are not authority to read a worker's
-- live profile after an employment transfer. Capture a minimal site-access record
-- when buyer acceptance inserts the crew, inside that same audited transaction.
-- No existing row is backfilled: today's profile cannot prove yesterday's facts.

alter table engagement_worker
  add column profile_snapshot jsonb,
  add column profile_snapshot_captured_at timestamptz,
  add constraint engagement_worker_profile_snapshot_pair check (
    (profile_snapshot is null) = (profile_snapshot_captured_at is null)
  );

create function capture_engagement_worker_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_tickets jsonb;
  v_capture_date date;
begin
  if tg_op = 'UPDATE' then
    if (new.id, new.engagement_id, new.worker_id, new.profile_snapshot, new.profile_snapshot_captured_at)
       is distinct from
       (old.id, old.engagement_id, old.worker_id, old.profile_snapshot, old.profile_snapshot_captured_at) then
      raise exception 'engagement worker identity and historical profile snapshots are immutable'
        using errcode = '23514';
    end if;
    return new;
  end if;

  if new.profile_snapshot is not null or new.profile_snapshot_captured_at is not null then
    raise exception 'historical profile snapshots must be captured by the database'
      using errcode = '23514';
  end if;

  -- Buyer acceptance already holds the supplier/company and worker locks. This
  -- derived-data trigger adds no new locks and is not a second decision pathway.
  -- A newly inserted crew member must still belong to this supplying business.
  select trim(concat_ws(' ', w.first_name, w.last_name)) into v_name
    from engagement e
    join worker w on w.id = new.worker_id
    join worker_employment we on we.worker_id = w.id
      and we.company_id = e.supplier_company_id and we.end_date is null
   where e.id = new.engagement_id
     and e.status = 'Awaiting Commercial' and e.commercial_confirmed_at is null
     and new.status = e.status;
  if not found or nullif(v_name, '') is null then
    raise exception 'new engagement crew requires current supplier employment before commercial confirmation'
      using errcode = '23514';
  end if;

  new.profile_snapshot_captured_at := statement_timestamp();
  v_capture_date := (new.profile_snapshot_captured_at at time zone 'Australia/Brisbane')::date;

  -- Historical uploads are retained on the worker. Capture one effective record
  -- for each qualification: prefer a valid renewal, then the longest expiry.
  -- Enumerate every allowed field; never copy contact data or storage paths.
  select coalesce(jsonb_agg(jsonb_build_object(
      'name', q.name,
      'number', credential.number,
      'issueDate', credential.issue_date,
      'expiryDate', credential.expiry_date,
      'status', case
        when credential.status = 'Expired' or credential.expiry_date < v_capture_date then 'Expired'
        when credential.expiry_date <= v_capture_date + 30 then 'Expiring Soon'
        else 'Current'
      end
    ) order by q.id), '[]'::jsonb) into v_tickets
    from (
      select distinct on (wq.qualification_id)
        wq.qualification_id, wq.number, wq.issue_date, wq.expiry_date, wq.status
      from worker_qualification wq
      where wq.worker_id = new.worker_id
      order by wq.qualification_id,
        (wq.status <> 'Expired' and (wq.expiry_date is null or wq.expiry_date >= v_capture_date)) desc,
        wq.expiry_date desc nulls first, wq.created_at desc, wq.id desc
    ) credential
    join qualification q on q.id = credential.qualification_id;

  new.profile_snapshot := jsonb_build_object('name', v_name, 'tickets', v_tickets);
  return new;
end;
$$;

-- This helper can only run as a table trigger. It is not an exposed RPC or a
-- service-role backfill function. Status/window updates retain existing snapshots.
revoke all on function capture_engagement_worker_profile()
  from public, anon, authenticated, service_role;
create trigger engagement_worker_profile_capture
before insert or update on engagement_worker
for each row execute function capture_engagement_worker_profile();

-- Keep the engagement-worker base table and all live worker tables private under
-- their existing ACL/RLS. This read-only database projection grants past parties
-- only the persisted historical record. Supplier crew is visible before the
-- commercial step; buyer disclosure follows the immutable marker, even after
-- cancellation/completion. Current-company membership must still be accepted.
create view engagement_worker_profile_view
with (security_barrier = true)
as
select ew.id, ew.engagement_id, ew.profile_snapshot, ew.profile_snapshot_captured_at
from engagement_worker ew
join engagement e on e.id = ew.engagement_id
where e.supplier_company_id = current_company_id()
   or (e.buyer_company_id = current_company_id() and e.commercial_confirmed_at is not null);

revoke all on engagement_worker_profile_view from public, anon, authenticated, service_role;
grant select on engagement_worker_profile_view to authenticated, service_role;

comment on column engagement_worker.profile_snapshot is
  'Immutable name and site-access ticket facts captured at crew creation; null means no trustworthy historical snapshot.';
comment on column engagement_worker.profile_snapshot_captured_at is
  'Capture time for the historical record, not a live compliance-verification timestamp.';
