-- Transactional engagement transitions — spec 13.6.
--
-- The exclusion constraint lives on engagement_worker's denormalised status and
-- window, so the engagement row and its worker rows must change together or the
-- backstop has a gap between two PostgREST round-trips. A single function makes the
-- pair one statement, one transaction: there is no ordering to get wrong and no
-- window in which a competing booking could slip past the constraint.

create or replace function set_engagement_status(
  p_engagement_id uuid,
  p_status engagement_status,
  p_end_date date default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_start date;
  v_end date;
begin
  update engagement
     set status = p_status,
         end_date = coalesce(p_end_date, end_date)
   where id = p_engagement_id
   returning start_date, end_date into v_start, v_end;

  if not found then
    raise exception 'engagement % not found', p_engagement_id;
  end if;

  -- Same transaction, so the 13.6 constraint sees a consistent pair. An end-date
  -- edit (13.2 early completion) re-derives the committed window here too.
  update engagement_worker
     set status = p_status,
         committed_window = daterange(v_start, v_end, '[]')
   where engagement_id = p_engagement_id;
end;
$$;

-- Only the service role may call it: transitions are Maintain actions or the daily
-- job (17.3, module 19), never a company client.
revoke all on function set_engagement_status(uuid, engagement_status, date) from public;
revoke all on function set_engagement_status(uuid, engagement_status, date) from anon;
revoke all on function set_engagement_status(uuid, engagement_status, date) from authenticated;
