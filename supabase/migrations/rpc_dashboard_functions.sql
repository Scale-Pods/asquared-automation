-- =============================================================================
-- Server-side RPC functions for Asquared dashboard (Voice + WhatsApp + Master).
-- All aggregation/filtering/pagination that used to happen in Node (fetch entire
-- table -> JS filter/reduce) now happens in Postgres. No schema changes — these
-- functions read the existing columns as-is (including TEXT date columns, which
-- are parsed defensively with safe-cast helpers where no real timestamp exists).
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 0. Helper: safely cast a free-text date-ish string to timestamptz.
--    Used only for the columns that have no real timestamp equivalent
--    (W.P_N TS / W.P_Replied N_TS / W.P_FollowUp N_TS style columns).
--    Returns NULL instead of raising on unparseable text.
-- -----------------------------------------------------------------------------
create or replace function public.safe_to_timestamptz(txt text)
returns timestamptz
language plpgsql
immutable
as $$
begin
  if txt is null or btrim(txt) = '' then
    return null;
  end if;
  return txt::timestamptz;
exception when others then
  return null;
end;
$$;


-- =============================================================================
-- 1. VOICE PANEL — vapi_call_logs + vapi_call_logs_nf
--    Both tables have real `started_at`/`created_at` timestamptz columns and a
--    clean `vapi_account` categorical column, so these are true SQL aggregations.
-- =============================================================================

-- 1a. Paginated, filtered, sorted call log list (backs /dashboard/voice/logs).
drop function if exists public.get_voice_call_logs(timestamptz, timestamptz, text, text, text, text, text, text, int, int);
create or replace function public.get_voice_call_logs(
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_account text default 'all',        -- all | secondary | unknown | owners | normal
  p_status text default 'all',         -- all | answered | no-answer | busy | failed
  p_voice_status text default 'all',   -- all | <voice_call_status value> | 'did not answer'
  p_type text default 'all',           -- all | inbound | outbound
  p_search text default null,          -- matches customer_phone / customer_name
  p_sort text default 'newest',        -- newest | oldest | longest | shortest
  p_page int default 1,
  p_page_size int default 10
)
returns table (
  id text,
  started_at timestamptz,
  duration_seconds double precision,
  cost_usd double precision,
  customer_phone text,
  customer_name text,
  status text,
  type text,
  is_inbound boolean,
  source text,
  vapi_account text,
  voice_call_status text,
  note text,
  total_count bigint
)
language sql
stable
as $$
  with unioned as (
    select
      id, started_at, duration_seconds, cost_usd, customer_phone, customer_name,
      lower(coalesce(status, '')) as status, type,
      (type = 'inboundPhoneCall') as is_inbound,
      'vapi'::text as source,
      lower(coalesce(vapi_account, 'normal')) as vapi_account_raw,
      voice_call_status, note
    from public.vapi_call_logs
    union all
    select
      id, started_at, duration_seconds, cost_usd, customer_phone, customer_name,
      lower(coalesce(status, '')) as status, type,
      (type = 'inboundPhoneCall') as is_inbound,
      'vapi'::text as source,
      lower(coalesce(vapi_account, 'normal')) as vapi_account_raw,
      voice_call_status, note
    from public.vapi_call_logs_nf
  ),
  normalized as (
    select
      *,
      case
        when vapi_account_raw = 'secondary' then 'secondary'
        when vapi_account_raw = 'unknown' then 'unknown'
        when vapi_account_raw in ('owner', 'owners') then 'owners'
        else 'normal'
      end as vapi_account
    from unioned
  ),
  filtered as (
    select *
    from normalized
    where (p_from is null or started_at >= p_from)
      and (p_to is null or started_at <= p_to)
      and (p_account = 'all' or p_account = 'vapi' or vapi_account = p_account)
      and (p_status = 'all' or status = p_status)
      and (
        p_voice_status = 'all'
        or (p_voice_status = 'did not answer' and lower(coalesce(voice_call_status, '')) in ('no answer', 'did_not_answer', 'no_answer'))
        or lower(coalesce(voice_call_status, '')) = lower(p_voice_status)
      )
      and (p_type = 'all' or lower(type) = p_type or (p_type = 'inbound' and is_inbound) or (p_type = 'outbound' and not is_inbound))
      and (
        p_search is null or p_search = ''
        or customer_phone ilike '%' || p_search || '%'
        or customer_name ilike '%' || p_search || '%'
      )
  ),
  counted as (
    select *, count(*) over () as total_count
    from filtered
  )
  select
    id, started_at, duration_seconds, cost_usd, customer_phone, customer_name,
    status, type, is_inbound, source, vapi_account, voice_call_status, note, total_count
  from counted
  order by
    case when p_sort = 'oldest' then started_at end asc,
    case when p_sort = 'longest' then duration_seconds end desc,
    case when p_sort = 'shortest' then duration_seconds end asc,
    case when p_sort = 'newest' or p_sort is null then started_at end desc
  limit p_page_size
  offset greatest(0, (p_page - 1) * p_page_size);
$$;


-- 1b. Full stats/analytics bundle (backs /api/voice/overview and /api/calls/stats).
--     Returns one row of pre-aggregated JSON — replaces ~150 lines of Node reduce().
create or replace function public.get_voice_call_stats(
  p_from timestamptz default null,
  p_to timestamptz default null
)
returns jsonb
language sql
stable
as $$
  with unioned as (
    select started_at, duration_seconds, cost_usd, status, type, voice_call_status,
           lower(coalesce(vapi_account, 'normal')) as vapi_account_raw
    from public.vapi_call_logs
    union all
    select started_at, duration_seconds, cost_usd, status, type, voice_call_status,
           lower(coalesce(vapi_account, 'normal')) as vapi_account_raw
    from public.vapi_call_logs_nf
  ),
  normalized as (
    select
      started_at, coalesce(duration_seconds, 0) as duration_seconds, coalesce(cost_usd, 0) as cost_usd,
      lower(coalesce(status, '')) as status,
      (type = 'inboundPhoneCall') as is_inbound,
      (lower(btrim(coalesce(voice_call_status, ''))) like 'awaiting availability%') as is_awaiting,
      case
        when vapi_account_raw = 'secondary' then 'secondary'
        when vapi_account_raw = 'unknown' then 'unknown'
        when vapi_account_raw in ('owner', 'owners') then 'owners'
        else 'normal'
      end as vapi_account
    from unioned
    where (p_from is null or started_at >= p_from)
      and (p_to is null or started_at <= p_to)
  ),
  scored as (
    select *,
      (duration_seconds > 18) as picked_up,
      (status in ('customer-ended-call', 'assistant-ended-call')) as completed,
      case
        when duration_seconds < 30 then '0-30s'
        when duration_seconds < 60 then '30s-1m'
        when duration_seconds < 120 then '1m-2m'
        when duration_seconds < 300 then '2m-5m'
        else '5m+'
      end as duration_bucket
    from normalized
  ),
  totals as (
    select
      count(*) as total_calls,
      coalesce(sum(duration_seconds), 0) as total_duration,
      coalesce(sum(cost_usd), 0) as total_cost,
      coalesce(avg(duration_seconds), 0) as avg_duration,
      coalesce(sum(duration_seconds) filter (where is_inbound), 0) as inbound_duration,
      coalesce(sum(duration_seconds) filter (where not is_inbound), 0) as outbound_duration,
      count(*) filter (where is_awaiting and vapi_account = 'owners') as owner_waiting_count
    from scored
  ),
  by_account as (
    select
      vapi_account,
      count(*) as calls,
      count(*) filter (where picked_up) as picked_up,
      count(*) filter (where completed) as completed,
      coalesce(sum(duration_seconds), 0) as duration_seconds
    from scored
    group by vapi_account
  ),
  duration_buckets as (
    select duration_bucket as name, count(*) as value
    from scored
    group by duration_bucket
  ),
  types_data as (
    select (case when is_inbound then 'Inbound' else 'Outbound' end) as name, count(*) as value
    from scored
    group by is_inbound
  ),
  daily as (
    select
      to_char(started_at, 'YYYY-MM-DD') as day_key,
      to_char(started_at, 'Mon DD') as display,
      count(*) as calls,
      coalesce(sum(cost_usd), 0) as credits
    from scored
    where started_at is not null
    group by 1, 2
    order by 1
  ),
  hourly as (
    select extract(hour from started_at)::int as hour, count(*) as count
    from scored
    where started_at is not null
    group by 1
  ),
  hour_series as (
    select h as hour, coalesce(hourly.count, 0) as count
    from generate_series(0, 23) as h
    left join hourly on hourly.hour = h
    order by h
  )
  select jsonb_build_object(
    'totalCalls', totals.total_calls,
    'totalDuration', totals.total_duration,
    'totalCost', totals.total_cost,
    'avgDuration', totals.avg_duration,
    'secondaryCalls', coalesce((select calls from by_account where vapi_account = 'secondary'), 0),
    'unknownCalls', coalesce((select calls from by_account where vapi_account = 'unknown'), 0),
    'ownersCalls', coalesce((select calls from by_account where vapi_account = 'owners'), 0),
    'normalCalls', coalesce((select calls from by_account where vapi_account = 'normal'), 0),
    'pickupRate', case when coalesce((select calls from by_account where vapi_account = 'secondary'), 0) > 0
      then (select picked_up from by_account where vapi_account = 'secondary')::numeric / (select calls from by_account where vapi_account = 'secondary') * 100 else 0 end,
    'completionRate', case when coalesce((select calls from by_account where vapi_account = 'secondary'), 0) > 0
      then (select completed from by_account where vapi_account = 'secondary')::numeric / (select calls from by_account where vapi_account = 'secondary') * 100 else 0 end,
    'unknownPickupRate', case when coalesce((select calls from by_account where vapi_account = 'unknown'), 0) > 0
      then (select picked_up from by_account where vapi_account = 'unknown')::numeric / (select calls from by_account where vapi_account = 'unknown') * 100 else 0 end,
    'unknownCompletionRate', case when coalesce((select calls from by_account where vapi_account = 'unknown'), 0) > 0
      then (select completed from by_account where vapi_account = 'unknown')::numeric / (select calls from by_account where vapi_account = 'unknown') * 100 else 0 end,
    'ownerPickupRate', case when coalesce((select calls from by_account where vapi_account = 'owners'), 0) > 0
      then (select picked_up from by_account where vapi_account = 'owners')::numeric / (select calls from by_account where vapi_account = 'owners') * 100 else 0 end,
    'ownerCompletionRate', case when coalesce((select calls from by_account where vapi_account = 'owners'), 0) > 0
      then (select completed from by_account where vapi_account = 'owners')::numeric / (select calls from by_account where vapi_account = 'owners') * 100 else 0 end,
    'inboundDuration', totals.inbound_duration,
    'outboundDuration', totals.outbound_duration,
    'ownerWaitingAvailabilityCount', totals.owner_waiting_count,
    'secondaryVoiceSeconds', coalesce((select duration_seconds from by_account where vapi_account = 'secondary'), 0),
    'unknownVoiceSeconds', coalesce((select duration_seconds from by_account where vapi_account = 'unknown'), 0),
    'ownerVoiceSeconds', coalesce((select duration_seconds from by_account where vapi_account = 'owners'), 0),
    'normalVoiceSeconds', coalesce((select duration_seconds from by_account where vapi_account = 'normal'), 0),
    'durationData', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'value', value)) from duration_buckets), '[]'::jsonb),
    'typesData', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'value', value)) from types_data), '[]'::jsonb),
    'volumeData', coalesce((select jsonb_agg(jsonb_build_object('name', display, 'value', calls)) from daily), '[]'::jsonb),
    'costData', coalesce((select jsonb_agg(jsonb_build_object('name', display, 'value', credits)) from daily), '[]'::jsonb),
    'hourlyData', coalesce((select jsonb_agg(jsonb_build_object('hour', hour, 'count', count)) from hour_series), '[]'::jsonb)
  )
  from totals;
$$;


-- 1d. Secondary/Unknown call-sentiment counts from leads (backs Voice Analytics page).
--     All-time, no date filter — matches the existing behaviour of calls/stats route.
create or replace function public.get_leads_sentiment_stats()
returns jsonb
language sql
stable
as $$
  with vals as (
    select unnest(array[call_sentiment1, call_sentiment2, call_sentiment3]) as v, 'secondary' as bucket
    from public.leads
    union all
    select unnest(array[call_sentiment4, call_sentiment5, call_sentiment6]) as v, 'unknown' as bucket
    from public.leads
  ),
  normalized as (
    select bucket, lower(btrim(coalesce(v, ''))) as v from vals
  )
  select jsonb_build_object(
    'secondaryHotQualified', count(*) filter (where bucket = 'secondary' and v = 'hot / qualified'),
    'secondaryForecastReady', count(*) filter (where bucket = 'secondary' and v = 'forecast / ready to buy'),
    'unknownHotQualified', count(*) filter (where bucket = 'unknown' and v = 'hot / qualified'),
    'unknownForecastReady', count(*) filter (where bucket = 'unknown' and v = 'forecast / ready to buy')
  )
  from normalized;
$$;


-- 1c. Total cost grouped by account (backs /api/calls/total-cost).
create or replace function public.get_voice_total_cost()
returns jsonb
language sql
stable
as $$
  with unioned as (
    select coalesce(cost_usd, 0) as cost_usd, lower(coalesce(vapi_account, 'normal')) as vapi_account_raw
    from public.vapi_call_logs
    union all
    select coalesce(cost_usd, 0) as cost_usd, lower(coalesce(vapi_account, 'normal')) as vapi_account_raw
    from public.vapi_call_logs_nf
  ),
  normalized as (
    select cost_usd,
      case
        when vapi_account_raw = 'secondary' then 'secondary'
        when vapi_account_raw = 'unknown' then 'unknown'
        when vapi_account_raw in ('owner', 'owners') then 'owners'
        else 'normal'
      end as vapi_account
    from unioned
  )
  select jsonb_build_object(
    'total', coalesce(sum(cost_usd), 0),
    'byAccount', coalesce(
      (select jsonb_object_agg(vapi_account, total) from (
        select vapi_account, sum(cost_usd) as total from normalized group by vapi_account
      ) t), '{}'::jsonb
    )
  )
  from normalized;
$$;


-- =============================================================================
-- 2. LEADS TABLE — has real `created_at`/`last_outreach_at` timestamptz columns.
-- =============================================================================

create or replace function public.get_leads_stats(
  p_from timestamptz default null,
  p_to timestamptz default null
)
returns jsonb
language sql
stable
as $$
  with filtered as (
    select *
    from public.leads
    where (p_from is null or last_outreach_at >= p_from or (last_outreach_at is null and created_at >= p_from))
      and (p_to is null or last_outreach_at <= p_to or (last_outreach_at is null and created_at <= p_to))
  )
  select jsonb_build_object(
    'total', count(*),
    'active', count(*) filter (where is_active),
    'responded', count(*) filter (where response_received),
    'byType', coalesce((select jsonb_object_agg(lead_type, cnt) from (
      select coalesce(lead_type, 'unknown') as lead_type, count(*) as cnt from filtered group by 1
    ) t), '{}'::jsonb),
    'byStatus', coalesce((select jsonb_object_agg(status, cnt) from (
      select coalesce(status, 'unknown') as status, count(*) as cnt from filtered group by 1
    ) t), '{}'::jsonb)
  )
  from filtered;
$$;


-- =============================================================================
-- 3. OWNERS — master_leads. whatsapp_last_contacted is TEXT with inconsistent
--    formats, so it's cast defensively via safe_to_timestamptz() rather than
--    assumed parseable — this still moves the filter into SQL (index-assisted
--    where the cast succeeds) instead of pulling the whole table into Node.
--    Reply/message-count logic mirrors lib/master-leads-utils.ts exactly so the
--    two stay behaviourally identical.
-- =============================================================================

create or replace function public.get_owner_metrics(
  p_from timestamptz default null,
  p_to timestamptz default null
)
returns jsonb
language plpgsql
stable
as $$
declare
  result jsonb;
begin
  with base as (
    select
      master_leads_id,
      "Whatsapp_1", "Whatsapp 2", "WP_Replied_track", wa_sentiment,
      whatsapp_last_contacted,
      public.safe_to_timestamptz(whatsapp_last_contacted) as last_contacted_ts,
      (
        coalesce(btrim("Whatsapp_1"), '') <> '' or coalesce(btrim("Whatsapp 2"), '') <> ''
        or coalesce(btrim("W.P_FollowUp 1"), '') <> '' or coalesce(btrim("W.P_Replied 1"), '') <> ''
        or coalesce(btrim("W.P_FollowUp 2"), '') <> '' or coalesce(btrim("W.P_Replied 2"), '') <> ''
        or coalesce(btrim("W.P_FollowUp 3"), '') <> '' or coalesce(btrim("W.P_Replied 3"), '') <> ''
        or coalesce(btrim("W.P_FollowUp 4"), '') <> '' or coalesce(btrim("W.P_Replied 4"), '') <> ''
        or coalesce(btrim("W.P_FollowUp 5"), '') <> '' or coalesce(btrim("W.P_Replied 5"), '') <> ''
        or coalesce(btrim("W.P_FollowUp 6"), '') <> '' or coalesce(btrim("W.P_Replied 6"), '') <> ''
        or coalesce(btrim("W.P_FollowUp 7"), '') <> '' or coalesce(btrim("W.P_Replied 7"), '') <> ''
        or coalesce(btrim("W.P_FollowUp 8"), '') <> '' or coalesce(btrim("W.P_Replied 8"), '') <> ''
        or coalesce(btrim("W.P_FollowUp 9"), '') <> '' or coalesce(btrim("W.P_Replied 9"), '') <> ''
        or coalesce(btrim("W.P_FollowUp 10"), '') <> '' or coalesce(btrim("W.P_Replied 10"), '') <> ''
      ) as has_activity,
      (
        (case when "Whatsapp_1" is not null and btrim("Whatsapp_1") <> '' then 1 else 0 end) +
        (case when "Whatsapp 2" is not null and btrim("Whatsapp 2") <> '' then 1 else 0 end) +
        (case when "W.P_FollowUp 1" is not null and btrim("W.P_FollowUp 1") <> '' then 1 else 0 end) +
        (case when "W.P_FollowUp 2" is not null and btrim("W.P_FollowUp 2") <> '' then 1 else 0 end) +
        (case when "W.P_FollowUp 3" is not null and btrim("W.P_FollowUp 3") <> '' then 1 else 0 end) +
        (case when "W.P_FollowUp 4" is not null and btrim("W.P_FollowUp 4") <> '' then 1 else 0 end) +
        (case when "W.P_FollowUp 5" is not null and btrim("W.P_FollowUp 5") <> '' then 1 else 0 end) +
        (case when "W.P_FollowUp 6" is not null and btrim("W.P_FollowUp 6") <> '' then 1 else 0 end) +
        (case when "W.P_FollowUp 7" is not null and btrim("W.P_FollowUp 7") <> '' then 1 else 0 end) +
        (case when "W.P_FollowUp 8" is not null and btrim("W.P_FollowUp 8") <> '' then 1 else 0 end) +
        (case when "W.P_FollowUp 9" is not null and btrim("W.P_FollowUp 9") <> '' then 1 else 0 end) +
        (case when "W.P_FollowUp 10" is not null and btrim("W.P_FollowUp 10") <> '' then 1 else 0 end)
      ) as sent_count,
      (coalesce(btrim("WP_Replied_track"), '') <> '' and lower(btrim("WP_Replied_track")) <> 'no') as replied
    from public.master_leads
  ),
  eligible as (
    select *
    from base
    where has_activity
      and (p_from is null or (last_contacted_ts is not null and last_contacted_ts >= p_from))
      and (p_to is null or (last_contacted_ts is not null and last_contacted_ts <= p_to))
  ),
  daily as (
    select
      to_char(last_contacted_ts, 'Mon DD') as date,
      sum(sent_count) as sent,
      count(*) filter (where replied) as replied
    from eligible
    where last_contacted_ts is not null
    group by 1, to_char(last_contacted_ts, 'YYYYMMDD')
    order by to_char(last_contacted_ts, 'YYYYMMDD')
  )
  select jsonb_build_object(
    'totalOwners', count(*),
    'reachouts', count(*),
    'replies', count(*) filter (where replied),
    'msgsSent', coalesce(sum(sent_count), 0),
    'replyRate', case when count(*) > 0 then round((count(*) filter (where replied))::numeric / count(*) * 1000) / 10 else 0 end,
    'waitingOnReply', count(*) filter (where not replied),
    'sentiment', jsonb_build_object(
      'positive', count(*) filter (where lower(btrim(coalesce(wa_sentiment, ''))) = 'positive'),
      'neutral', count(*) filter (where lower(btrim(coalesce(wa_sentiment, ''))) = 'neutral'),
      'negative', count(*) filter (where lower(btrim(coalesce(wa_sentiment, ''))) = 'negative'),
      'unknown', count(*) filter (where lower(btrim(coalesce(wa_sentiment, ''))) not in ('positive', 'neutral', 'negative'))
    ),
    'trend', coalesce((select jsonb_agg(jsonb_build_object('date', date, 'sent', sent, 'replied', replied)) from (
      select * from daily order by date desc limit 7
    ) t), '[]'::jsonb),
    'oldestContactedAt', (select min(last_contacted_ts) from eligible where "Whatsapp_1" is not null and btrim("Whatsapp_1") <> '')
  ) into result
  from eligible;

  return result;
end;
$$;


-- Paginated, searched, filtered owner list rows (backs /api/whatsapp/owners list + Chat "Owners" tab).
-- Dropped first because its return-table shape changes across revisions (Postgres
-- refuses `create or replace` when OUT-parameter columns are added/removed/reordered).
drop function if exists public.get_owner_list(timestamptz, timestamptz, text, text, int, int);
create or replace function public.get_owner_list(
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_search text default null,
  p_reply_status text default 'all',  -- all | replied | waiting
  p_page int default 1,
  p_page_size int default 10
)
returns table (
  id bigint,
  name text,
  phone text,
  location text,
  project_name text,
  unit_number text,
  property_type text,
  replied boolean,
  sentiment text,
  last_contacted timestamptz,
  voice_call_status text,
  note text,
  sent_count int,
  message_statuses jsonb,
  total_count bigint
)
language sql
stable
as $$
  with base as (
    select
      master_leads_id,
      coalesce("Owner Name", 'Guest') as owner_name,
      coalesce("Contact Number", 'Unknown') as contact_number,
      "Location", "Project Name", "Unit Number", "Property Type",
      voice_call_status, note, wa_sentiment,
      public.safe_to_timestamptz(whatsapp_last_contacted) as last_contacted_ts,
      (
        select coalesce(jsonb_agg(jsonb_build_object('index', idx, 'status', ts) order by idx), '[]'::jsonb)
        from (
          select idx, ts from (values
            (1, "W.P_FollowUp 1_TS"), (2, "W.P_FollowUp 2_TS"), (3, "W.P_FollowUp 3_TS"),
            (4, "W.P_FollowUp 4_TS"), (5, "W.P_FollowUp 5_TS"), (6, "W.P_FollowUp 6_TS"),
            (7, "W.P_FollowUp 7_TS"), (8, "W.P_FollowUp 8_TS"), (9, "W.P_FollowUp 9_TS"),
            (10, "W.P_FollowUp 10_TS")
          ) as t(idx, ts)
          where ts is not null and btrim(ts) <> ''
          order by idx desc
          limit 2
        ) recent
      ) as message_statuses,
      (
        coalesce(btrim("Whatsapp_1"), '') <> '' or coalesce(btrim("Whatsapp 2"), '') <> ''
        or coalesce(btrim("W.P_FollowUp 1"), '') <> '' or coalesce(btrim("W.P_Replied 1"), '') <> ''
        or coalesce(btrim("W.P_FollowUp 2"), '') <> '' or coalesce(btrim("W.P_Replied 2"), '') <> ''
        or coalesce(btrim("W.P_FollowUp 3"), '') <> '' or coalesce(btrim("W.P_Replied 3"), '') <> ''
        or coalesce(btrim("W.P_FollowUp 4"), '') <> '' or coalesce(btrim("W.P_Replied 4"), '') <> ''
        or coalesce(btrim("W.P_FollowUp 5"), '') <> '' or coalesce(btrim("W.P_Replied 5"), '') <> ''
        or coalesce(btrim("W.P_FollowUp 6"), '') <> '' or coalesce(btrim("W.P_Replied 6"), '') <> ''
        or coalesce(btrim("W.P_FollowUp 7"), '') <> '' or coalesce(btrim("W.P_Replied 7"), '') <> ''
        or coalesce(btrim("W.P_FollowUp 8"), '') <> '' or coalesce(btrim("W.P_Replied 8"), '') <> ''
        or coalesce(btrim("W.P_FollowUp 9"), '') <> '' or coalesce(btrim("W.P_Replied 9"), '') <> ''
        or coalesce(btrim("W.P_FollowUp 10"), '') <> '' or coalesce(btrim("W.P_Replied 10"), '') <> ''
      ) as has_activity,
      (
        (case when "Whatsapp_1" is not null and btrim("Whatsapp_1") <> '' then 1 else 0 end) +
        (case when "Whatsapp 2" is not null and btrim("Whatsapp 2") <> '' then 1 else 0 end) +
        (case when "W.P_FollowUp 1" is not null and btrim("W.P_FollowUp 1") <> '' then 1 else 0 end) +
        (case when "W.P_FollowUp 2" is not null and btrim("W.P_FollowUp 2") <> '' then 1 else 0 end) +
        (case when "W.P_FollowUp 3" is not null and btrim("W.P_FollowUp 3") <> '' then 1 else 0 end) +
        (case when "W.P_FollowUp 4" is not null and btrim("W.P_FollowUp 4") <> '' then 1 else 0 end) +
        (case when "W.P_FollowUp 5" is not null and btrim("W.P_FollowUp 5") <> '' then 1 else 0 end) +
        (case when "W.P_FollowUp 6" is not null and btrim("W.P_FollowUp 6") <> '' then 1 else 0 end) +
        (case when "W.P_FollowUp 7" is not null and btrim("W.P_FollowUp 7") <> '' then 1 else 0 end) +
        (case when "W.P_FollowUp 8" is not null and btrim("W.P_FollowUp 8") <> '' then 1 else 0 end) +
        (case when "W.P_FollowUp 9" is not null and btrim("W.P_FollowUp 9") <> '' then 1 else 0 end) +
        (case when "W.P_FollowUp 10" is not null and btrim("W.P_FollowUp 10") <> '' then 1 else 0 end)
      ) as sent_count,
      (coalesce(btrim("WP_Replied_track"), '') <> '' and lower(btrim("WP_Replied_track")) <> 'no') as replied
    from public.master_leads
  ),
  eligible as (
    select *
    from base
    where has_activity
      and (p_from is null or (last_contacted_ts is not null and last_contacted_ts >= p_from))
      and (p_to is null or (last_contacted_ts is not null and last_contacted_ts <= p_to))
      and (
        p_search is null or p_search = ''
        or owner_name ilike '%' || p_search || '%'
        or contact_number ilike '%' || p_search || '%'
      )
      and (
        p_reply_status = 'all'
        or (p_reply_status = 'replied' and replied)
        or (p_reply_status = 'waiting' and not replied)
      )
  ),
  counted as (
    select *, count(*) over () as total_count
    from eligible
  )
  select
    master_leads_id, owner_name, contact_number, "Location", "Project Name", "Unit Number", "Property Type",
    replied, wa_sentiment, last_contacted_ts, voice_call_status, note, sent_count, message_statuses, total_count
  from counted
  order by last_contacted_ts desc nulls last
  limit p_page_size
  offset greatest(0, (p_page - 1) * p_page_size);
$$;


-- =============================================================================
-- 4. INTRO / INTRO_UK / FOLLOW_UP / FOLLOW_UP_UK — these DO have a real
--    "Last Contacted" timestamptz column plus "Created At"/"Updated At", so the
--    WhatsApp-eligibility date filter can now run in SQL. The per-message
--    W.P_N TS columns stay free text (used only for display/status pills, not
--    filtering), consistent with how the app already treats them.
-- =============================================================================

drop function if exists public.get_whatsapp_leads(text, timestamptz, timestamptz, text, text, int, int);
create or replace function public.get_whatsapp_leads(
  p_table text,                          -- 'intro' | 'intro_uk' | 'follow_up' | 'follow_up_uk'
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_search text default null,
  p_reply_status text default 'all',     -- all | replied | sent
  p_page int default 1,
  p_page_size int default 10
)
returns table (
  id text,
  name text,
  phone text,
  email text,
  replied boolean,
  last_contacted timestamptz,
  sent_count int,
  total_count bigint
)
language plpgsql
stable
as $$
begin
  if p_table not in ('intro', 'intro_uk', 'follow_up', 'follow_up_uk') then
    raise exception 'invalid table: %', p_table;
  end if;

  return query execute format($f$
    with base as (
      select
        "ID" as id,
        coalesce("Name", 'Guest') as name,
        coalesce("Phone", 'Unknown') as phone,
        "Email" as email,
        "Last Contacted" as last_contacted,
        (
          (case when "W.P_1" is not null and btrim("W.P_1") <> '' and lower(btrim("W.P_1")) <> 'no' then 1 else 0 end) +
          (case when "W.P_2" is not null and btrim("W.P_2") <> '' and lower(btrim("W.P_2")) <> 'no' then 1 else 0 end) +
          (case when "W.P_3" is not null and btrim("W.P_3") <> '' and lower(btrim("W.P_3")) <> 'no' then 1 else 0 end) +
          (case when "W.P_4" is not null and btrim("W.P_4") <> '' and lower(btrim("W.P_4")) <> 'no' then 1 else 0 end) +
          (case when "W.P_FollowUp 1" is not null and btrim("W.P_FollowUp 1") <> '' then 1 else 0 end) +
          (case when "W.P_FollowUp 2" is not null and btrim("W.P_FollowUp 2") <> '' then 1 else 0 end) +
          (case when "W.P_FollowUp 3" is not null and btrim("W.P_FollowUp 3") <> '' then 1 else 0 end) +
          (case when "W.P_FollowUp 4" is not null and btrim("W.P_FollowUp 4") <> '' then 1 else 0 end) +
          (case when "W.P_FollowUp 5" is not null and btrim("W.P_FollowUp 5") <> '' then 1 else 0 end) +
          (case when "W.P_FollowUp 6" is not null and btrim("W.P_FollowUp 6") <> '' then 1 else 0 end) +
          (case when "W.P_FollowUp 7" is not null and btrim("W.P_FollowUp 7") <> '' then 1 else 0 end) +
          (case when "W.P_FollowUp 8" is not null and btrim("W.P_FollowUp 8") <> '' then 1 else 0 end) +
          (case when "W.P_FollowUp 9" is not null and btrim("W.P_FollowUp 9") <> '' then 1 else 0 end) +
          (case when "W.P_FollowUp 10" is not null and btrim("W.P_FollowUp 10") <> '' then 1 else 0 end)
        ) as sent_count,
        (
          coalesce(btrim("W.P_1"), '') <> '' and lower(btrim("W.P_1")) <> 'no'
          or coalesce(btrim("W.P_2"), '') <> '' and lower(btrim("W.P_2")) <> 'no'
          or coalesce(btrim("W.P_3"), '') <> '' and lower(btrim("W.P_3")) <> 'no'
          or coalesce(btrim("W.P_4"), '') <> '' and lower(btrim("W.P_4")) <> 'no'
        ) as has_activity,
        (coalesce(btrim("WP_Replied_track"), '') <> '' and lower(btrim("WP_Replied_track")) <> 'no') as replied
      from public.%I
    ),
    eligible as (
      select * from base
      where has_activity
        and ($1 is null or (last_contacted is not null and last_contacted >= $1))
        and ($2 is null or (last_contacted is not null and last_contacted <= $2))
        and (
          $3 is null or $3 = ''
          or name ilike '%%' || $3 || '%%'
          or phone ilike '%%' || $3 || '%%'
          or coalesce(email, '') ilike '%%' || $3 || '%%'
        )
        and (
          $4 = 'all'
          or ($4 = 'replied' and replied)
          or ($4 = 'sent' and not replied)
        )
    ),
    counted as (
      select *, count(*) over () as total_count from eligible
    )
    select id, name, phone, email, replied, last_contacted, sent_count, total_count
    from counted
    order by last_contacted desc nulls last
    limit $5
    offset greatest(0, ($6 - 1) * $5)
  $f$, p_table)
  using p_from, p_to, p_search, p_reply_status, p_page_size, p_page;
end;
$$;


-- Aggregated stats for a single intro/follow_up-family table (backs per-tab metric cards).
create or replace function public.get_whatsapp_table_stats(
  p_table text,
  p_from timestamptz default null,
  p_to timestamptz default null
)
returns jsonb
language plpgsql
stable
as $$
declare
  result jsonb;
begin
  if p_table not in ('intro', 'intro_uk', 'follow_up', 'follow_up_uk') then
    raise exception 'invalid table: %', p_table;
  end if;

  execute format($f$
    with base as (
      select
        "Last Contacted" as last_contacted,
        (
          (case when "W.P_1" is not null and btrim("W.P_1") <> '' and lower(btrim("W.P_1")) <> 'no' then 1 else 0 end) +
          (case when "W.P_2" is not null and btrim("W.P_2") <> '' and lower(btrim("W.P_2")) <> 'no' then 1 else 0 end) +
          (case when "W.P_3" is not null and btrim("W.P_3") <> '' and lower(btrim("W.P_3")) <> 'no' then 1 else 0 end) +
          (case when "W.P_4" is not null and btrim("W.P_4") <> '' and lower(btrim("W.P_4")) <> 'no' then 1 else 0 end) +
          (case when "W.P_FollowUp 1" is not null and btrim("W.P_FollowUp 1") <> '' then 1 else 0 end) +
          (case when "W.P_FollowUp 2" is not null and btrim("W.P_FollowUp 2") <> '' then 1 else 0 end) +
          (case when "W.P_FollowUp 3" is not null and btrim("W.P_FollowUp 3") <> '' then 1 else 0 end) +
          (case when "W.P_FollowUp 4" is not null and btrim("W.P_FollowUp 4") <> '' then 1 else 0 end) +
          (case when "W.P_FollowUp 5" is not null and btrim("W.P_FollowUp 5") <> '' then 1 else 0 end) +
          (case when "W.P_FollowUp 6" is not null and btrim("W.P_FollowUp 6") <> '' then 1 else 0 end) +
          (case when "W.P_FollowUp 7" is not null and btrim("W.P_FollowUp 7") <> '' then 1 else 0 end) +
          (case when "W.P_FollowUp 8" is not null and btrim("W.P_FollowUp 8") <> '' then 1 else 0 end) +
          (case when "W.P_FollowUp 9" is not null and btrim("W.P_FollowUp 9") <> '' then 1 else 0 end) +
          (case when "W.P_FollowUp 10" is not null and btrim("W.P_FollowUp 10") <> '' then 1 else 0 end)
        ) as sent_count,
        (
          coalesce(btrim("W.P_1"), '') <> '' and lower(btrim("W.P_1")) <> 'no'
          or coalesce(btrim("W.P_2"), '') <> '' and lower(btrim("W.P_2")) <> 'no'
          or coalesce(btrim("W.P_3"), '') <> '' and lower(btrim("W.P_3")) <> 'no'
          or coalesce(btrim("W.P_4"), '') <> '' and lower(btrim("W.P_4")) <> 'no'
        ) as has_activity,
        (coalesce(btrim("WP_Replied_track"), '') <> '' and lower(btrim("WP_Replied_track")) <> 'no') as replied
      from public.%I
    ),
    eligible as (
      select * from base
      where has_activity
        and ($1 is null or (last_contacted is not null and last_contacted >= $1))
        and ($2 is null or (last_contacted is not null and last_contacted <= $2))
    )
    select jsonb_build_object(
      'reachouts', count(*),
      'msgsSent', coalesce(sum(sent_count), 0),
      'replies', count(*) filter (where replied),
      'waiting', count(*) filter (where not replied)
    )
    from eligible
  $f$, p_table)
  into result
  using p_from, p_to;

  return result;
end;
$$;


-- =============================================================================
-- 5. NURTURE_LEADS / NURTURE_LEADS_UK — has a real `wp_last_contacted`
--    timestamptz column, so eligibility date-filtering runs in SQL. The 12
--    week-slot columns (week1_wp_1..week3_wp_4) replace intro/follow_up's
--    W.P_1..4, but the reply cycle ("W.P_Replied N"/"W.P_FollowUp N", 1-10)
--    is identical in shape to intro/follow_up.
-- =============================================================================

drop function if exists public.get_nurture_leads(text, timestamptz, timestamptz, text, text, int, int);
create or replace function public.get_nurture_leads(
  p_table text,                          -- 'nurture_leads' | 'nurture_leads_uk'
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_search text default null,
  p_reply_status text default 'all',     -- all | replied | sent
  p_page int default 1,
  p_page_size int default 10
)
returns table (
  id uuid,
  name text,
  phone text,
  replied boolean,
  last_contacted timestamptz,
  sent_count int,
  total_count bigint
)
language plpgsql
stable
as $$
begin
  if p_table not in ('nurture_leads', 'nurture_leads_uk') then
    raise exception 'invalid table: %', p_table;
  end if;

  return query execute format($f$
    with base as (
      select
        id,
        coalesce(name, 'Guest') as name,
        coalesce("Phone", 'Unknown') as phone,
        coalesce(wp_last_contacted, "Last Contacted") as last_contacted,
        (
          (case when week1_wp_1 is not null and btrim(week1_wp_1) <> '' then 1 else 0 end) +
          (case when week1_wp_2 is not null and btrim(week1_wp_2) <> '' then 1 else 0 end) +
          (case when week1_wp_3 is not null and btrim(week1_wp_3) <> '' then 1 else 0 end) +
          (case when week1_wp_4 is not null and btrim(week1_wp_4) <> '' then 1 else 0 end) +
          (case when week2_wp_1 is not null and btrim(week2_wp_1) <> '' then 1 else 0 end) +
          (case when week2_wp_2 is not null and btrim(week2_wp_2) <> '' then 1 else 0 end) +
          (case when week2_wp_3 is not null and btrim(week2_wp_3) <> '' then 1 else 0 end) +
          (case when week2_wp_4 is not null and btrim(week2_wp_4) <> '' then 1 else 0 end) +
          (case when week3_wp_1 is not null and btrim(week3_wp_1) <> '' then 1 else 0 end) +
          (case when week3_wp_2 is not null and btrim(week3_wp_2) <> '' then 1 else 0 end) +
          (case when week3_wp_3 is not null and btrim(week3_wp_3) <> '' then 1 else 0 end) +
          (case when week3_wp_4 is not null and btrim(week3_wp_4) <> '' then 1 else 0 end) +
          (case when "W.P_FollowUp 1" is not null and btrim("W.P_FollowUp 1") <> '' then 1 else 0 end) +
          (case when "W.P_FollowUp 2" is not null and btrim("W.P_FollowUp 2") <> '' then 1 else 0 end) +
          (case when "W.P_FollowUp 3" is not null and btrim("W.P_FollowUp 3") <> '' then 1 else 0 end) +
          (case when "W.P_FollowUp 4" is not null and btrim("W.P_FollowUp 4") <> '' then 1 else 0 end) +
          (case when "W.P_FollowUp 5" is not null and btrim("W.P_FollowUp 5") <> '' then 1 else 0 end) +
          (case when "W.P_FollowUp 6" is not null and btrim("W.P_FollowUp 6") <> '' then 1 else 0 end) +
          (case when "W.P_FollowUp 7" is not null and btrim("W.P_FollowUp 7") <> '' then 1 else 0 end) +
          (case when "W.P_FollowUp 8" is not null and btrim("W.P_FollowUp 8") <> '' then 1 else 0 end) +
          (case when "W.P_FollowUp 9" is not null and btrim("W.P_FollowUp 9") <> '' then 1 else 0 end) +
          (case when "W.P_FollowUp 10" is not null and btrim("W.P_FollowUp 10") <> '' then 1 else 0 end)
        ) as sent_count,
        (
          coalesce(btrim(week1_wp_1), '') <> '' or coalesce(btrim(week1_wp_2), '') <> ''
          or coalesce(btrim(week1_wp_3), '') <> '' or coalesce(btrim(week1_wp_4), '') <> ''
          or coalesce(btrim(week2_wp_1), '') <> '' or coalesce(btrim(week2_wp_2), '') <> ''
          or coalesce(btrim(week2_wp_3), '') <> '' or coalesce(btrim(week2_wp_4), '') <> ''
          or coalesce(btrim(week3_wp_1), '') <> '' or coalesce(btrim(week3_wp_2), '') <> ''
          or coalesce(btrim(week3_wp_3), '') <> '' or coalesce(btrim(week3_wp_4), '') <> ''
        ) as has_activity,
        (coalesce(btrim("WP_Replied_track"), '') <> '' and lower(btrim("WP_Replied_track")) <> 'no') as replied
      from public.%I
    ),
    eligible as (
      select * from base
      where has_activity
        and ($1 is null or (last_contacted is not null and last_contacted >= $1))
        and ($2 is null or (last_contacted is not null and last_contacted <= $2))
        and (
          $3 is null or $3 = ''
          or name ilike '%%' || $3 || '%%'
          or phone ilike '%%' || $3 || '%%'
        )
        and (
          $4 = 'all'
          or ($4 = 'replied' and replied)
          or ($4 = 'sent' and not replied)
        )
    ),
    counted as (
      select *, count(*) over () as total_count from eligible
    )
    select id, name, phone, replied, last_contacted, sent_count, total_count
    from counted
    order by last_contacted desc nulls last
    limit $5
    offset greatest(0, ($6 - 1) * $5)
  $f$, p_table)
  using p_from, p_to, p_search, p_reply_status, p_page_size, p_page;
end;
$$;


create or replace function public.get_nurture_table_stats(
  p_table text,
  p_from timestamptz default null,
  p_to timestamptz default null
)
returns jsonb
language plpgsql
stable
as $$
declare
  result jsonb;
begin
  if p_table not in ('nurture_leads', 'nurture_leads_uk') then
    raise exception 'invalid table: %', p_table;
  end if;

  execute format($f$
    with base as (
      select
        coalesce(wp_last_contacted, "Last Contacted") as last_contacted,
        (
          (case when week1_wp_1 is not null and btrim(week1_wp_1) <> '' then 1 else 0 end) +
          (case when week1_wp_2 is not null and btrim(week1_wp_2) <> '' then 1 else 0 end) +
          (case when week1_wp_3 is not null and btrim(week1_wp_3) <> '' then 1 else 0 end) +
          (case when week1_wp_4 is not null and btrim(week1_wp_4) <> '' then 1 else 0 end) +
          (case when week2_wp_1 is not null and btrim(week2_wp_1) <> '' then 1 else 0 end) +
          (case when week2_wp_2 is not null and btrim(week2_wp_2) <> '' then 1 else 0 end) +
          (case when week2_wp_3 is not null and btrim(week2_wp_3) <> '' then 1 else 0 end) +
          (case when week2_wp_4 is not null and btrim(week2_wp_4) <> '' then 1 else 0 end) +
          (case when week3_wp_1 is not null and btrim(week3_wp_1) <> '' then 1 else 0 end) +
          (case when week3_wp_2 is not null and btrim(week3_wp_2) <> '' then 1 else 0 end) +
          (case when week3_wp_3 is not null and btrim(week3_wp_3) <> '' then 1 else 0 end) +
          (case when week3_wp_4 is not null and btrim(week3_wp_4) <> '' then 1 else 0 end) +
          (case when "W.P_FollowUp 1" is not null and btrim("W.P_FollowUp 1") <> '' then 1 else 0 end) +
          (case when "W.P_FollowUp 2" is not null and btrim("W.P_FollowUp 2") <> '' then 1 else 0 end) +
          (case when "W.P_FollowUp 3" is not null and btrim("W.P_FollowUp 3") <> '' then 1 else 0 end) +
          (case when "W.P_FollowUp 4" is not null and btrim("W.P_FollowUp 4") <> '' then 1 else 0 end) +
          (case when "W.P_FollowUp 5" is not null and btrim("W.P_FollowUp 5") <> '' then 1 else 0 end) +
          (case when "W.P_FollowUp 6" is not null and btrim("W.P_FollowUp 6") <> '' then 1 else 0 end) +
          (case when "W.P_FollowUp 7" is not null and btrim("W.P_FollowUp 7") <> '' then 1 else 0 end) +
          (case when "W.P_FollowUp 8" is not null and btrim("W.P_FollowUp 8") <> '' then 1 else 0 end) +
          (case when "W.P_FollowUp 9" is not null and btrim("W.P_FollowUp 9") <> '' then 1 else 0 end) +
          (case when "W.P_FollowUp 10" is not null and btrim("W.P_FollowUp 10") <> '' then 1 else 0 end)
        ) as sent_count,
        (
          coalesce(btrim(week1_wp_1), '') <> '' or coalesce(btrim(week1_wp_2), '') <> ''
          or coalesce(btrim(week1_wp_3), '') <> '' or coalesce(btrim(week1_wp_4), '') <> ''
          or coalesce(btrim(week2_wp_1), '') <> '' or coalesce(btrim(week2_wp_2), '') <> ''
          or coalesce(btrim(week2_wp_3), '') <> '' or coalesce(btrim(week2_wp_4), '') <> ''
          or coalesce(btrim(week3_wp_1), '') <> '' or coalesce(btrim(week3_wp_2), '') <> ''
          or coalesce(btrim(week3_wp_3), '') <> '' or coalesce(btrim(week3_wp_4), '') <> ''
        ) as has_activity,
        (coalesce(btrim("WP_Replied_track"), '') <> '' and lower(btrim("WP_Replied_track")) <> 'no') as replied
      from public.%I
    ),
    eligible as (
      select * from base
      where has_activity
        and ($1 is null or (last_contacted is not null and last_contacted >= $1))
        and ($2 is null or (last_contacted is not null and last_contacted <= $2))
    )
    select jsonb_build_object(
      'reachouts', count(*),
      'msgsSent', coalesce(sum(sent_count), 0),
      'replies', count(*) filter (where replied),
      'waiting', count(*) filter (where not replied)
    )
    from eligible
  $f$, p_table)
  into result
  using p_from, p_to;

  return result;
end;
$$;


-- =============================================================================
-- 6. COMBINED INTRO/INTRO_UK/FOLLOW_UP/FOLLOW_UP_UK OVERVIEW — replaces the
--    full select=* fetch + in-memory reduce that used to run on every load of
--    the WhatsApp Dashboard, WhatsApp Analytics, and Master Dashboard pages
--    (this was the single largest source of Supabase egress in the app).
--
--    Business rules mirror app/api/whatsapp/overview/route.ts exactly:
--    - A row is a "reachout" only if at least one of W.P_1..W.P_4 (or its TS)
--      is non-empty/non-"No", AND its resolved reachout date falls in [from,to].
--    - Reachout date = embedded date in W.P_1 content, else W.P_1 TS, else
--      created_at (only as a last resort, when a message exists).
--    - Messages sent = count of W.P_1..4 + W.P_FollowUp + W.P_FollowUp 1..10
--      whose resolved date falls in [from,to].
--    - Replied = WP_Replied_track is non-empty/non-"no" (date-checked if it has
--      an embedded date), OR any W.P_Replied 1..10 is non-empty/non-"no".
-- =============================================================================

-- Extracts a trailing embedded date from free text content, matching parseMsg()
-- in lib/server-parsers.ts: content ending in "\n\nYYYY-MM-DDTHH:MM:SS..." (ISO,
-- double newline) or a last line containing both '-' and ':' (space-separated
-- date/time). Returns NULL if no date is found — the caller falls back to
-- created_at or a TS column, exactly like the Node implementation.
create or replace function public.extract_embedded_date(txt text)
returns timestamptz
language plpgsql
immutable
as $$
declare
  lines text[];
  last_line text;
  candidate text;
begin
  if txt is null or btrim(txt) = '' then
    return null;
  end if;

  -- ISO date on its own after a blank line: "...\n\n2026-07-18T13:55:46..."
  candidate := substring(txt from '\n\n(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[^\n]*)$');
  if candidate is not null then
    return public.safe_to_timestamptz(candidate);
  end if;

  -- Last line looks like a date/time (contains both '-' and ':')
  lines := regexp_split_to_array(btrim(txt), E'\n');
  last_line := btrim(lines[array_upper(lines, 1)]);
  if array_length(lines, 1) > 1 and position('-' in last_line) > 0 and position(':' in last_line) > 0 then
    return public.safe_to_timestamptz(replace(last_line, ' ', 'T'));
  end if;

  return null;
end;
$$;

create or replace function public.get_whatsapp_normal_overview(
  p_from timestamptz default null,
  p_to timestamptz default null
)
returns jsonb
language plpgsql
stable
as $$
declare
  result jsonb;
begin
  with unioned as (
    select "ID" as id, "Name" as name, "Phone" as phone, "Created At" as created_at, 'intro'::text as source_table,
      "W.P_1", "W.P_2", "W.P_3", "W.P_4", "W.P_1 TS", "W.P_FollowUp 1", "W.P_FollowUp 2", "W.P_FollowUp 3",
      "W.P_FollowUp 4", "W.P_FollowUp 5", "W.P_FollowUp 6", "W.P_FollowUp 7", "W.P_FollowUp 8", "W.P_FollowUp 9", "W.P_FollowUp 10",
      w_p_followup_ts_1, w_p_followup_ts_2, w_p_followup_ts_3, w_p_followup_ts_4, w_p_followup_ts_5,
      w_p_followup_ts_6, w_p_followup_ts_7, w_p_followup_ts_8, w_p_followup_ts_9, w_p_followup_ts_10,
      "WP_Replied_track", "W.P_Replied 1", "W.P_Replied 2", "W.P_Replied 3", "W.P_Replied 4", "W.P_Replied 5",
      "W.P_Replied 6", "W.P_Replied 7", "W.P_Replied 8", "W.P_Replied 9", "W.P_Replied 10"
    from public.intro
    union all
    select "ID", "Name", "Phone", "Created At", 'intro_uk'::text,
      "W.P_1", "W.P_2", "W.P_3", "W.P_4", "W.P_1 TS", "W.P_FollowUp 1", "W.P_FollowUp 2", "W.P_FollowUp 3",
      "W.P_FollowUp 4", "W.P_FollowUp 5", "W.P_FollowUp 6", "W.P_FollowUp 7", "W.P_FollowUp 8", "W.P_FollowUp 9", "W.P_FollowUp 10",
      w_p_followup_ts_1, w_p_followup_ts_2, w_p_followup_ts_3, w_p_followup_ts_4, w_p_followup_ts_5,
      w_p_followup_ts_6, w_p_followup_ts_7, w_p_followup_ts_8, w_p_followup_ts_9, w_p_followup_ts_10,
      "WP_Replied_track", "W.P_Replied 1", "W.P_Replied 2", "W.P_Replied 3", "W.P_Replied 4", "W.P_Replied 5",
      "W.P_Replied 6", "W.P_Replied 7", "W.P_Replied 8", "W.P_Replied 9", "W.P_Replied 10"
    from public.intro_uk
    union all
    select "ID", "Name", "Phone", "Created At", 'follow_up'::text,
      "W.P_1", "W.P_2", "W.P_3", "W.P_4", "W.P_1 TS", "W.P_FollowUp 1", "W.P_FollowUp 2", "W.P_FollowUp 3",
      "W.P_FollowUp 4", "W.P_FollowUp 5", "W.P_FollowUp 6", "W.P_FollowUp 7", "W.P_FollowUp 8", "W.P_FollowUp 9", "W.P_FollowUp 10",
      w_p_followup_ts_1, w_p_followup_ts_2, w_p_followup_ts_3, w_p_followup_ts_4, w_p_followup_ts_5,
      w_p_followup_ts_6, w_p_followup_ts_7, w_p_followup_ts_8, w_p_followup_ts_9, w_p_followup_ts_10,
      "WP_Replied_track", "W.P_Replied 1", "W.P_Replied 2", "W.P_Replied 3", "W.P_Replied 4", "W.P_Replied 5",
      "W.P_Replied 6", "W.P_Replied 7", "W.P_Replied 8", "W.P_Replied 9", "W.P_Replied 10"
    from public.follow_up
    union all
    select "ID", "Name", "Phone", "Created At", 'follow_up_uk'::text,
      "W.P_1", "W.P_2", "W.P_3", "W.P_4", "W.P_1 TS", "W.P_FollowUp 1", "W.P_FollowUp 2", "W.P_FollowUp 3",
      "W.P_FollowUp 4", "W.P_FollowUp 5", "W.P_FollowUp 6", "W.P_FollowUp 7", "W.P_FollowUp 8", "W.P_FollowUp 9", "W.P_FollowUp 10",
      w_p_followup_ts_1, w_p_followup_ts_2, w_p_followup_ts_3, w_p_followup_ts_4, w_p_followup_ts_5,
      w_p_followup_ts_6, w_p_followup_ts_7, w_p_followup_ts_8, w_p_followup_ts_9, w_p_followup_ts_10,
      "WP_Replied_track", "W.P_Replied 1", "W.P_Replied 2", "W.P_Replied 3", "W.P_Replied 4", "W.P_Replied 5",
      "W.P_Replied 6", "W.P_Replied 7", "W.P_Replied 8", "W.P_Replied 9", "W.P_Replied 10"
    from public.follow_up_uk
  ),
  base as (
    select
      id, name, phone, created_at, source_table,
      -- Reachout date: embedded date in W.P_1, else W.P_1 TS, else created_at (only if a message exists)
      coalesce(
        public.extract_embedded_date("W.P_1"),
        public.safe_to_timestamptz("W.P_1 TS"),
        case when coalesce(btrim("W.P_1"), '') <> '' and lower(btrim("W.P_1")) <> 'no' then created_at end
      ) as reachout_date,
      (
        (coalesce(btrim("W.P_1"), '') <> '' and lower(btrim("W.P_1")) <> 'no') or coalesce(btrim("W.P_1 TS"), '') <> ''
        or (coalesce(btrim("W.P_2"), '') <> '' and lower(btrim("W.P_2")) <> 'no')
        or (coalesce(btrim("W.P_3"), '') <> '' and lower(btrim("W.P_3")) <> 'no')
        or (coalesce(btrim("W.P_4"), '') <> '' and lower(btrim("W.P_4")) <> 'no')
      ) as has_any_msg,
      -- Per-message resolved dates, used for both "sent in range" counting and the trend chart
      array_remove(array[
        coalesce(public.extract_embedded_date("W.P_1"), public.safe_to_timestamptz("W.P_1 TS")),
        public.extract_embedded_date("W.P_2"),
        public.extract_embedded_date("W.P_3"),
        public.extract_embedded_date("W.P_4"),
        coalesce(public.extract_embedded_date("W.P_FollowUp 1"), public.safe_to_timestamptz(w_p_followup_ts_1)),
        coalesce(public.extract_embedded_date("W.P_FollowUp 2"), public.safe_to_timestamptz(w_p_followup_ts_2)),
        coalesce(public.extract_embedded_date("W.P_FollowUp 3"), public.safe_to_timestamptz(w_p_followup_ts_3)),
        coalesce(public.extract_embedded_date("W.P_FollowUp 4"), public.safe_to_timestamptz(w_p_followup_ts_4)),
        coalesce(public.extract_embedded_date("W.P_FollowUp 5"), public.safe_to_timestamptz(w_p_followup_ts_5)),
        coalesce(public.extract_embedded_date("W.P_FollowUp 6"), public.safe_to_timestamptz(w_p_followup_ts_6)),
        coalesce(public.extract_embedded_date("W.P_FollowUp 7"), public.safe_to_timestamptz(w_p_followup_ts_7)),
        coalesce(public.extract_embedded_date("W.P_FollowUp 8"), public.safe_to_timestamptz(w_p_followup_ts_8)),
        coalesce(public.extract_embedded_date("W.P_FollowUp 9"), public.safe_to_timestamptz(w_p_followup_ts_9)),
        coalesce(public.extract_embedded_date("W.P_FollowUp 10"), public.safe_to_timestamptz(w_p_followup_ts_10))
      ]::timestamptz[], null) as msg_dates,
      -- Reply detection + reply date, same precedence as processReplyLeads/route.ts
      (
        (coalesce(btrim("WP_Replied_track"), '') <> '' and lower(btrim("WP_Replied_track")) <> 'no')
        or (coalesce(btrim("W.P_Replied 1"), '') <> '' and lower(btrim("W.P_Replied 1")) <> 'no')
        or (coalesce(btrim("W.P_Replied 2"), '') <> '' and lower(btrim("W.P_Replied 2")) <> 'no')
        or (coalesce(btrim("W.P_Replied 3"), '') <> '' and lower(btrim("W.P_Replied 3")) <> 'no')
        or (coalesce(btrim("W.P_Replied 4"), '') <> '' and lower(btrim("W.P_Replied 4")) <> 'no')
        or (coalesce(btrim("W.P_Replied 5"), '') <> '' and lower(btrim("W.P_Replied 5")) <> 'no')
        or (coalesce(btrim("W.P_Replied 6"), '') <> '' and lower(btrim("W.P_Replied 6")) <> 'no')
        or (coalesce(btrim("W.P_Replied 7"), '') <> '' and lower(btrim("W.P_Replied 7")) <> 'no')
        or (coalesce(btrim("W.P_Replied 8"), '') <> '' and lower(btrim("W.P_Replied 8")) <> 'no')
        or (coalesce(btrim("W.P_Replied 9"), '') <> '' and lower(btrim("W.P_Replied 9")) <> 'no')
        or (coalesce(btrim("W.P_Replied 10"), '') <> '' and lower(btrim("W.P_Replied 10")) <> 'no')
      ) as has_reply,
      coalesce(
        public.extract_embedded_date("WP_Replied_track"),
        public.extract_embedded_date("W.P_Replied 1"), public.extract_embedded_date("W.P_Replied 2"),
        public.extract_embedded_date("W.P_Replied 3"), public.extract_embedded_date("W.P_Replied 4"),
        public.extract_embedded_date("W.P_Replied 5"), public.extract_embedded_date("W.P_Replied 6"),
        public.extract_embedded_date("W.P_Replied 7"), public.extract_embedded_date("W.P_Replied 8"),
        public.extract_embedded_date("W.P_Replied 9"), public.extract_embedded_date("W.P_Replied 10")
      ) as reply_date
    from unioned
  ),
  eligible as (
    select *
    from base
    where has_any_msg
      and reachout_date is not null
      and (p_from is null or reachout_date >= p_from)
      and (p_to is null or reachout_date <= p_to)
  ),
  scored as (
    select
      *,
      (select count(*) from unnest(msg_dates) d where p_from is null or (d >= p_from and (p_to is null or d <= p_to))) as sent_count_in_range,
      (
        -- Reply counts "in range" if it has a resolvable date that's in range, OR has no date at all
        -- (treated as already-in-range since the lead itself passed the reachout-date filter above)
        has_reply and (reply_date is null or ((p_from is null or reply_date >= p_from) and (p_to is null or reply_date <= p_to)))
      ) as replied_in_range
    from eligible
  ),
  per_table as (
    select
      source_table,
      count(*) as reachouts,
      sum(sent_count_in_range) as msgs_sent,
      count(*) filter (where replied_in_range) as replies
    from scored
    group by source_table
  ),
  daily as (
    select
      to_char(coalesce(reachout_date, created_at), 'Mon DD') as date,
      sum(sent_count_in_range) as sent,
      count(*) filter (where replied_in_range) as replied
    from scored
    group by 1, to_char(coalesce(reachout_date, created_at), 'YYYYMMDD')
    order by to_char(coalesce(reachout_date, created_at), 'YYYYMMDD')
  )
  select jsonb_build_object(
    'totalReachouts', (select count(*) from scored),
    'totalMsgsSent', coalesce((select sum(sent_count_in_range) from scored), 0),
    'totalReplies', (select count(*) from scored where replied_in_range),
    'waiting', (select count(*) from scored where sent_count_in_range > 0 and not replied_in_range),
    'uniqueContacted', (select count(*) from scored where sent_count_in_range > 0),
    'tableReachouts', coalesce((select jsonb_object_agg(source_table, reachouts) from per_table), '{}'::jsonb),
    'tableReplies', coalesce((select jsonb_object_agg(source_table, replies) from per_table), '{}'::jsonb),
    'tableMsgsSent', coalesce((select jsonb_object_agg(source_table, msgs_sent) from per_table), '{}'::jsonb),
    'trend', coalesce((select jsonb_agg(jsonb_build_object('date', date, 'sent', sent, 'replied', replied)) from (
      select * from daily order by date desc limit 7
    ) t), '[]'::jsonb),
    'oldestReachoutAt', (select min(reachout_date) from scored)
  ) into result;

  return result;
end;
$$;


-- Reply-preview rows (name/phone/last-reply snippet) for the "Recent WhatsApp
-- Replies" panel. Only replied rows are returned — NOT the whole table — and
-- only the small set of columns needed to build a preview snippet, keeping
-- payload size tiny compared to the old full-table fetch.
drop function if exists public.get_whatsapp_reply_previews(timestamptz, timestamptz, int);
create or replace function public.get_whatsapp_reply_previews(
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_limit int default 50
)
returns table (
  id text,
  name text,
  phone text,
  source_table text,
  reply_content text,
  reply_date timestamptz
)
language sql
stable
as $$
  with unioned as (
    select "ID" as id, "Name" as name, "Phone" as phone, "Created At" as created_at, 'intro'::text as source_table,
      "WP_Replied_track", "W.P_Replied 1", "W.P_Replied 2", "W.P_Replied 3", "W.P_Replied 4", "W.P_Replied 5",
      "W.P_Replied 6", "W.P_Replied 7", "W.P_Replied 8", "W.P_Replied 9", "W.P_Replied 10"
    from public.intro
    union all
    select "ID", "Name", "Phone", "Created At", 'intro_uk'::text,
      "WP_Replied_track", "W.P_Replied 1", "W.P_Replied 2", "W.P_Replied 3", "W.P_Replied 4", "W.P_Replied 5",
      "W.P_Replied 6", "W.P_Replied 7", "W.P_Replied 8", "W.P_Replied 9", "W.P_Replied 10"
    from public.intro_uk
    union all
    select "ID", "Name", "Phone", "Created At", 'follow_up'::text,
      "WP_Replied_track", "W.P_Replied 1", "W.P_Replied 2", "W.P_Replied 3", "W.P_Replied 4", "W.P_Replied 5",
      "W.P_Replied 6", "W.P_Replied 7", "W.P_Replied 8", "W.P_Replied 9", "W.P_Replied 10"
    from public.follow_up
    union all
    select "ID", "Name", "Phone", "Created At", 'follow_up_uk'::text,
      "WP_Replied_track", "W.P_Replied 1", "W.P_Replied 2", "W.P_Replied 3", "W.P_Replied 4", "W.P_Replied 5",
      "W.P_Replied 6", "W.P_Replied 7", "W.P_Replied 8", "W.P_Replied 9", "W.P_Replied 10"
    from public.follow_up_uk
  ),
  base as (
    select
      id, name, phone, created_at, source_table,
      -- Take the latest non-empty reply field, preferring one with a resolvable date
      coalesce(
        nullif(btrim("W.P_Replied 10"), ''), nullif(btrim("W.P_Replied 9"), ''), nullif(btrim("W.P_Replied 8"), ''),
        nullif(btrim("W.P_Replied 7"), ''), nullif(btrim("W.P_Replied 6"), ''), nullif(btrim("W.P_Replied 5"), ''),
        nullif(btrim("W.P_Replied 4"), ''), nullif(btrim("W.P_Replied 3"), ''), nullif(btrim("W.P_Replied 2"), ''),
        nullif(btrim("W.P_Replied 1"), ''), nullif(btrim("WP_Replied_track"), '')
      ) as reply_content_raw,
      coalesce(
        public.extract_embedded_date("W.P_Replied 10"), public.extract_embedded_date("W.P_Replied 9"),
        public.extract_embedded_date("W.P_Replied 8"), public.extract_embedded_date("W.P_Replied 7"),
        public.extract_embedded_date("W.P_Replied 6"), public.extract_embedded_date("W.P_Replied 5"),
        public.extract_embedded_date("W.P_Replied 4"), public.extract_embedded_date("W.P_Replied 3"),
        public.extract_embedded_date("W.P_Replied 2"), public.extract_embedded_date("W.P_Replied 1"),
        public.extract_embedded_date("WP_Replied_track"),
        created_at
      ) as reply_date,
      (
        (coalesce(btrim("WP_Replied_track"), '') <> '' and lower(btrim("WP_Replied_track")) <> 'no')
        or (coalesce(btrim("W.P_Replied 1"), '') <> '' and lower(btrim("W.P_Replied 1")) <> 'no')
        or (coalesce(btrim("W.P_Replied 2"), '') <> '' and lower(btrim("W.P_Replied 2")) <> 'no')
        or (coalesce(btrim("W.P_Replied 3"), '') <> '' and lower(btrim("W.P_Replied 3")) <> 'no')
        or (coalesce(btrim("W.P_Replied 4"), '') <> '' and lower(btrim("W.P_Replied 4")) <> 'no')
        or (coalesce(btrim("W.P_Replied 5"), '') <> '' and lower(btrim("W.P_Replied 5")) <> 'no')
        or (coalesce(btrim("W.P_Replied 6"), '') <> '' and lower(btrim("W.P_Replied 6")) <> 'no')
        or (coalesce(btrim("W.P_Replied 7"), '') <> '' and lower(btrim("W.P_Replied 7")) <> 'no')
        or (coalesce(btrim("W.P_Replied 8"), '') <> '' and lower(btrim("W.P_Replied 8")) <> 'no')
        or (coalesce(btrim("W.P_Replied 9"), '') <> '' and lower(btrim("W.P_Replied 9")) <> 'no')
        or (coalesce(btrim("W.P_Replied 10"), '') <> '' and lower(btrim("W.P_Replied 10")) <> 'no')
      ) as has_reply
    from unioned
  )
  select id, name, phone, source_table, reply_content_raw, reply_date
  from base
  where has_reply
    and (p_from is null or reply_date >= p_from)
    and (p_to is null or reply_date <= p_to)
  order by reply_date desc nulls last
  limit p_limit;
$$;


-- =============================================================================
-- Grants — allow the API (service role) to call these. Adjust if using a
-- different role name; service_role already bypasses RLS by default in Supabase.
-- =============================================================================
grant execute on function public.get_voice_call_logs to service_role, anon, authenticated;
grant execute on function public.get_voice_call_stats to service_role, anon, authenticated;
grant execute on function public.get_voice_total_cost to service_role, anon, authenticated;
grant execute on function public.get_leads_sentiment_stats to service_role, anon, authenticated;
grant execute on function public.get_leads_stats to service_role, anon, authenticated;
grant execute on function public.get_owner_metrics to service_role, anon, authenticated;
grant execute on function public.get_owner_list to service_role, anon, authenticated;
grant execute on function public.get_whatsapp_leads to service_role, anon, authenticated;
grant execute on function public.get_whatsapp_table_stats to service_role, anon, authenticated;
grant execute on function public.get_nurture_leads to service_role, anon, authenticated;
grant execute on function public.get_nurture_table_stats to service_role, anon, authenticated;
grant execute on function public.extract_embedded_date to service_role, anon, authenticated;
grant execute on function public.get_whatsapp_normal_overview to service_role, anon, authenticated;
grant execute on function public.get_whatsapp_reply_previews to service_role, anon, authenticated;
