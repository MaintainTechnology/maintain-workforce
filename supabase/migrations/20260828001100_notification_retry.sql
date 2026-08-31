-- Notification retry payloads (MVP 15.1).
--
-- A failed delivery can only be re-sent faithfully when the immutable recipient,
-- subject, body and deep link that were approved for the original event remain on
-- the row. Existing rows pre-date this payload and therefore remain visible but are
-- deliberately not retryable; inventing copy later could disclose information that
-- was not visible when the event occurred.

alter table notification
  add column subject text,
  add column body text,
  add column action_url text,
  add column attempt_count integer not null default 0,
  add column last_attempt_at timestamptz,
  add column retry_claimed_at timestamptz,
  add column retry_claimed_by text,
  add column delivery_claim_token uuid,
  add column delivery_outcome_unknown boolean not null default false,
  add column dedupe_key text unique,
  add constraint notification_attempt_count_nonnegative
    check (attempt_count >= 0);

create index notification_failed_queue_idx
  on notification (failed_at desc, created_at desc)
  where sent_at is null;

-- A lease fences initial delivery as well as retries. Recovering a stale lease
-- reuses the attempt number/provider key. A late worker cannot overwrite the result
-- of the new lease because completion compares the opaque claim token.
create or replace function claim_notification_delivery_internal(
  p_notification_id uuid,
  p_actor_user_id text,
  p_allow_failed boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row notification%rowtype;
  v_token uuid := gen_random_uuid();
begin
  select *
    into v_row
    from notification
   where id = p_notification_id
   for update;

  if not found then
    raise exception 'Notification was not found' using errcode = 'P0002';
  end if;
  if v_row.sent_at is not null then
    if not p_allow_failed then return null; end if;
    raise exception 'Notification has already been sent' using errcode = 'P0001';
  end if;
  if v_row.subject is null or v_row.body is null then
    raise exception 'Legacy notification has no stored delivery payload'
      using errcode = '22023';
  end if;
  -- The daily dispatcher recovers queued/abandoned deliveries, but known failures
  -- are re-sent only by an explicit Maintain action.
  if not p_allow_failed and v_row.failed_at is not null then return null; end if;
  if v_row.retry_claimed_at is not null
     and v_row.retry_claimed_at > now() - interval '15 minutes' then
    if not p_allow_failed then return null; end if;
    raise exception 'Notification retry is already in progress' using errcode = '55P03';
  end if;

  -- An abandoned lease may have reached the provider even if its acknowledgement
  -- never reached this database. Persist that uncertainty before replacing the
  -- lease, so later configuration/rejection failures cannot advance its key.
  v_row.delivery_outcome_unknown := v_row.delivery_outcome_unknown
    or v_row.retry_claimed_at is not null
    or v_row.delivery_claim_token is not null;

  update notification
     set retry_claimed_at = now(),
         retry_claimed_by = p_actor_user_id,
         delivery_claim_token = v_token,
         delivery_outcome_unknown = v_row.delivery_outcome_unknown
   where id = p_notification_id;

  return jsonb_build_object(
    'id', v_row.id,
    'recipient_email', v_row.recipient_email,
    'subject', v_row.subject,
    'body', v_row.body,
    'action_url', v_row.action_url,
    'attempt', v_row.attempt_count + 1,
    'outcome_unknown', v_row.delivery_outcome_unknown,
    'claim_token', v_token
  );
end;
$$;

revoke all on function claim_notification_delivery_internal(uuid, text, boolean)
  from public, anon, authenticated, service_role;

create or replace function claim_notification_retry(p_notification_id uuid, p_actor_user_id text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
begin
  if nullif(btrim(p_actor_user_id), '') is null then
    raise exception 'A retry actor is required' using errcode = '22023';
  end if;
  return claim_notification_delivery_internal(p_notification_id, p_actor_user_id, true);
end;
$$;

revoke all on function claim_notification_retry(uuid, text) from public, anon, authenticated;
grant execute on function claim_notification_retry(uuid, text) to service_role;

create or replace function claim_queued_notification(p_notification_id uuid)
returns jsonb
language sql security definer set search_path = public
as $$
  select claim_notification_delivery_internal(p_notification_id, null, false);
$$;

revoke all on function claim_queued_notification(uuid) from public, anon, authenticated;
grant execute on function claim_queued_notification(uuid) to service_role;

create or replace function finish_notification_delivery(
  p_notification_id uuid,
  p_claim_token uuid,
  p_attempt integer,
  p_provider_message_id text,
  p_failure_reason text
)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare v_count integer;
begin
  if p_claim_token is null or p_attempt is null or p_attempt < 1
     or (p_provider_message_id is null) = (p_failure_reason is null) then
    raise exception 'A delivery lease and exactly one result are required' using errcode = '22023';
  end if;
  update notification
     set sent_at = case when p_provider_message_id is not null then now() end,
         failed_at = case when p_failure_reason is not null then now() end,
         failure_reason = case when p_failure_reason is not null and delivery_outcome_unknown
           then 'Prior email delivery outcome is unknown; current retry failed: ' || p_failure_reason || '. Check the provider receipt before retrying.'
           else p_failure_reason end,
         provider_message_id = p_provider_message_id,
         -- A later rejection (for example a revoked API key or rate limit) does
         -- not disprove an earlier uncertain send. Only acknowledgement resolves it.
         attempt_count = case when p_failure_reason is not null and delivery_outcome_unknown
           then attempt_count else p_attempt end,
         delivery_outcome_unknown = case when p_provider_message_id is not null then false
           else delivery_outcome_unknown end,
         last_attempt_at = now(),
         retry_claimed_at = null,
         retry_claimed_by = null,
         delivery_claim_token = null
   where id = p_notification_id
     and delivery_claim_token = p_claim_token
     and attempt_count + 1 = p_attempt
     and sent_at is null;
  get diagnostics v_count = row_count;
  return v_count = 1;
end;
$$;

revoke all on function finish_notification_delivery(uuid, uuid, integer, text, text)
  from public, anon, authenticated;
grant execute on function finish_notification_delivery(uuid, uuid, integer, text, text) to service_role;

-- A timeout/connection loss is not proof of rejection. Expose the uncertainty to
-- Maintain and fence the old lease, but keep the logical attempt number unchanged
-- so an explicit retry sends the same immutable payload with the same provider key.
create or replace function record_notification_delivery_uncertain(
  p_notification_id uuid,
  p_claim_token uuid,
  p_attempt integer,
  p_failure_reason text
)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare v_count integer;
begin
  if p_claim_token is null or p_attempt is null or p_attempt < 1
     or nullif(btrim(p_failure_reason), '') is null then
    raise exception 'A delivery lease and uncertainty reason are required' using errcode = '22023';
  end if;
  update notification
     set failed_at = now(),
         failure_reason = p_failure_reason,
         delivery_outcome_unknown = true,
         last_attempt_at = now(),
         retry_claimed_at = null,
         retry_claimed_by = null,
         delivery_claim_token = null
   where id = p_notification_id
     and delivery_claim_token = p_claim_token
     and attempt_count + 1 = p_attempt
     and sent_at is null;
  get diagnostics v_count = row_count;
  return v_count = 1;
end;
$$;

revoke all on function record_notification_delivery_uncertain(uuid,uuid,integer,text)
  from public, anon, authenticated;
grant execute on function record_notification_delivery_uncertain(uuid,uuid,integer,text) to service_role;
