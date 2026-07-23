create table public.follow_up (
  "ID" text not null,
  "AssignTo ID" text null,
  "Status ID" text null,
  "Name" text null,
  "Lead Owner" text null,
  "Country Code" text null,
  "Phone" text null,
  "Email" text null,
  "Replied" text null,
  "Last Contacted" timestamp with time zone null,
  "FollowUp 48 Hr" text null,
  "Email 1" text null,
  "Email 2" text null,
  "Voice 1" text null,
  "Voice 2" text null,
  "Sender Email" text null,
  "Created At" timestamp with time zone null default now(),
  "Updated At" timestamp with time zone null default now(),
  "W.P_1" text null,
  "W.P_2" text null,
  "W.P_Replied 1" text null,
  "Email_1" text null,
  "Email_2" text null,
  "Email_3" text null,
  "Email_Replied" text null,
  "W.P_FollowUp 1" text null,
  "Dropped" text null,
  "W.P_1 TS" text null,
  "W.P_2 TS" text null,
  "W.P_Replied 2" text null,
  "W.P_FollowUp 2" text null,
  "W.P_Replied 3" text null,
  "W.P_FollowUp 3" text null,
  "W.P_Replied 4" text null,
  "W.P_FollowUp 4" text null,
  "W.P_Replied 5" text null,
  "W.P_FollowUp 5" text null,
  "W.P_Replied 6" text null,
  "W.P_FollowUp 6" text null,
  "W.P_Replied 7" text null,
  "W.P_FollowUp 7" text null,
  "W.P_Replied 8" text null,
  "W.P_FollowUp 8" text null,
  "W.P_Replied 9" text null,
  "W.P_FollowUp 9" text null,
  "W.P_Replied 10" text null,
  "W.P_FollowUp 10" text null,
  "W.P_1 Retry" text null,
  "W.P_2 Retry" text null,
  "Email_2 TS" text null,
  "Email_2 Retry" text null,
  "Email_3 TS" text null,
  "Email_3 Retry" text null,
  "Unsubscribed" text null,
  "W.P_3" text null,
  "W.P_4" text null,
  "WP_Replied_track" text null,
  "Call_replied_track" text null,
  bitrix_lead_id text null,
  "WP_last_contacted" text null,
  "Email_last_contacted" text null,
  "W.P_3 TS" text null,
  "W.P_4 TS" text null,
  "W.P_3 retry" text null,
  "W.P_4 retry" text null,
  description text null,
  w_p_followup_ts_1 text null,
  w_p_followup_ts_2 text null,
  w_p_followup_ts_3 text null,
  w_p_followup_ts_4 text null,
  w_p_followup_ts_5 text null,
  w_p_followup_ts_6 text null,
  w_p_followup_ts_7 text null,
  w_p_followup_ts_8 text null,
  w_p_followup_ts_9 text null,
  w_p_followup_ts_10 text null,
  wa_sentiment text null,
  wa_sentiment_note text null,
  constraint follow_up_pkey primary key ("ID")
) TABLESPACE pg_default;

create index IF not exists idx_follow_up_wp_last_contacted on public.follow_up using btree ("WP_last_contacted") TABLESPACE pg_default;

create index IF not exists idx_follow_up_email_last_contacted on public.follow_up using btree ("Email_last_contacted") TABLESPACE pg_default;

create index IF not exists idx_follow_up_name_trgm on public.follow_up using gin ("Name" gin_trgm_ops) TABLESPACE pg_default;

create index IF not exists idx_follow_up_phone_trgm on public.follow_up using gin ("Phone" gin_trgm_ops) TABLESPACE pg_default;

create index IF not exists idx_follow_up_created_at on public.follow_up using btree ("Created At") TABLESPACE pg_default;

create index IF not exists idx_follow_up_updated_at on public.follow_up using btree ("Updated At") TABLESPACE pg_default;

create table public.follow_up_uk (
  "ID" text not null,
  "AssignTo ID" text null,
  "Status ID" text null,
  "Name" text null,
  "Lead Owner" text null,
  "Country Code" text null,
  "Phone" text null,
  "Email" text null,
  "Replied" text null,
  "Last Contacted" timestamp with time zone null,
  "FollowUp 48 Hr" text null,
  "Email 1" text null,
  "Email 2" text null,
  "Voice 1" text null,
  "Voice 2" text null,
  "Sender Email" text null,
  "Created At" timestamp with time zone null default now(),
  "Updated At" timestamp with time zone null default now(),
  "W.P_1" text null,
  "W.P_2" text null,
  "W.P_Replied 1" text null,
  "Email_1" text null,
  "Email_2" text null,
  "Email_3" text null,
  "Email_Replied" text null,
  "W.P_FollowUp 1" text null,
  "Dropped" text null,
  "W.P_1 TS" text null,
  "W.P_2 TS" text null,
  "W.P_Replied 2" text null,
  "W.P_FollowUp 2" text null,
  "W.P_Replied 3" text null,
  "W.P_FollowUp 3" text null,
  "W.P_Replied 4" text null,
  "W.P_FollowUp 4" text null,
  "W.P_Replied 5" text null,
  "W.P_FollowUp 5" text null,
  "W.P_Replied 6" text null,
  "W.P_FollowUp 6" text null,
  "W.P_Replied 7" text null,
  "W.P_FollowUp 7" text null,
  "W.P_Replied 8" text null,
  "W.P_FollowUp 8" text null,
  "W.P_Replied 9" text null,
  "W.P_FollowUp 9" text null,
  "W.P_Replied 10" text null,
  "W.P_FollowUp 10" text null,
  "W.P_1 Retry" text null,
  "W.P_2 Retry" text null,
  "Email_2 TS" text null,
  "Email_2 Retry" text null,
  "Email_3 TS" text null,
  "Email_3 Retry" text null,
  "Unsubscribed" text null,
  "W.P_3" text null,
  "W.P_4" text null,
  "WP_Replied_track" text null,
  "Call_replied_track" text null,
  bitrix_lead_id text null,
  "WP_last_contacted" text null,
  "Email_last_contacted" text null,
  "W.P_3 TS" text null,
  "W.P_4 TS" text null,
  "W.P_3 retry" text null,
  "W.P_4 retry" text null,
  w_p_followup_ts_1 text null,
  w_p_followup_ts_2 text null,
  w_p_followup_ts_3 text null,
  w_p_followup_ts_4 text null,
  w_p_followup_ts_5 text null,
  w_p_followup_ts_6 text null,
  w_p_followup_ts_7 text null,
  w_p_followup_ts_8 text null,
  w_p_followup_ts_9 text null,
  w_p_followup_ts_10 text null,
  wa_sentiment text null,
  wa_sentiment_note text null,
  constraint follow_up_uk_pkey primary key ("ID")
) TABLESPACE pg_default;

create index IF not exists idx_follow_up_uk_wp_last_contacted on public.follow_up_uk using btree ("WP_last_contacted") TABLESPACE pg_default;

create index IF not exists idx_follow_up_uk_email_last_contacted on public.follow_up_uk using btree ("Email_last_contacted") TABLESPACE pg_default;

create index IF not exists idx_follow_up_uk_name_trgm on public.follow_up_uk using gin ("Name" gin_trgm_ops) TABLESPACE pg_default;

create index IF not exists idx_follow_up_uk_phone_trgm on public.follow_up_uk using gin ("Phone" gin_trgm_ops) TABLESPACE pg_default;

create index IF not exists idx_follow_up_uk_created_at on public.follow_up_uk using btree ("Created At") TABLESPACE pg_default;

create index IF not exists idx_follow_up_uk_updated_at on public.follow_up_uk using btree ("Updated At") TABLESPACE pg_default;

create table public.intro (
  "ID" text not null,
  "AssignTo ID" text null,
  "Status ID" text null,
  "Name" text null,
  "Lead Owner" text null,
  "Country Code" text null,
  "Phone" text null,
  "Email" text null,
  "Replied" text null,
  "Last Contacted" timestamp with time zone null,
  "FollowUp 48 Hr" text null,
  "Email 1" text null,
  "Email 2" text null,
  "Voice 1" text null,
  "Voice 2" text null,
  "Sender Email" text null,
  "Created At" timestamp with time zone null default now(),
  "Updated At" timestamp with time zone null default now(),
  "W.P_1" text null,
  "W.P_2" text null,
  "W.P_Replied 1" text null,
  "Email_1" text null,
  "Email_2" text null,
  "Email_3" text null,
  "Email_Replied" text null,
  "W.P_FollowUp 1" text null,
  "Dropped" text null,
  "W.P_1 TS" text null,
  "W.P_2 TS" text null,
  "W.P_Replied 2" text null,
  "W.P_FollowUp 2" text null,
  "W.P_Replied 3" text null,
  "W.P_FollowUp 3" text null,
  "W.P_Replied 4" text null,
  "W.P_FollowUp 4" text null,
  "W.P_Replied 5" text null,
  "W.P_FollowUp 5" text null,
  "W.P_Replied 6" text null,
  "W.P_FollowUp 6" text null,
  "W.P_Replied 7" text null,
  "W.P_FollowUp 7" text null,
  "W.P_Replied 8" text null,
  "W.P_FollowUp 8" text null,
  "W.P_Replied 9" text null,
  "W.P_FollowUp 9" text null,
  "W.P_Replied 10" text null,
  "W.P_FollowUp 10" text null,
  "W.P_1 Retry" text null,
  "W.P_2 Retry" text null,
  "Email_2 TS" text null,
  "Email_2 Retry" text null,
  "Email_3 TS" text null,
  "Email_3 Retry" text null,
  "Unsubscribed" text null,
  "W.P_3" text null,
  "W.P_4" text null,
  "WP_Replied_track" text null,
  "Call_replied_track" text null,
  bitrix_lead_id text null,
  "WP_last_contacted" text null,
  "Email_last_contacted" text null,
  "W.P_3 TS" text null,
  "W.P_4 TS" text null,
  "W.P_3 retry" text null,
  "W.P_4 retry" text null,
  description text null,
  w_p_followup_ts_1 text null,
  w_p_followup_ts_2 text null,
  w_p_followup_ts_3 text null,
  w_p_followup_ts_4 text null,
  w_p_followup_ts_5 text null,
  w_p_followup_ts_6 text null,
  w_p_followup_ts_7 text null,
  w_p_followup_ts_8 text null,
  w_p_followup_ts_9 text null,
  w_p_followup_ts_10 text null,
  wa_sentiment text null,
  wa_sentiment_note text null,
  constraint intro_pkey primary key ("ID")
) TABLESPACE pg_default;

create index IF not exists idx_intro_wp_last_contacted on public.intro using btree ("WP_last_contacted") TABLESPACE pg_default;

create index IF not exists idx_intro_email_last_contacted on public.intro using btree ("Email_last_contacted") TABLESPACE pg_default;

create index IF not exists idx_intro_name_trgm on public.intro using gin ("Name" gin_trgm_ops) TABLESPACE pg_default;

create index IF not exists idx_intro_phone_trgm on public.intro using gin ("Phone" gin_trgm_ops) TABLESPACE pg_default;

create index IF not exists idx_intro_created_at on public.intro using btree ("Created At") TABLESPACE pg_default;

create index IF not exists idx_intro_updated_at on public.intro using btree ("Updated At") TABLESPACE pg_default;

create table public.intro_uk (
  "ID" text not null,
  "AssignTo ID" text null,
  "Status ID" text null,
  "Name" text null,
  "Lead Owner" text null,
  "Country Code" text null,
  "Phone" text null,
  "Email" text null,
  "Replied" text null,
  "Last Contacted" timestamp with time zone null,
  "FollowUp 48 Hr" text null,
  "Email 1" text null,
  "Email 2" text null,
  "Voice 1" text null,
  "Voice 2" text null,
  "Sender Email" text null,
  "Created At" timestamp with time zone null default now(),
  "Updated At" timestamp with time zone null default now(),
  "W.P_1" text null,
  "W.P_2" text null,
  "W.P_Replied 1" text null,
  "Email_1" text null,
  "Email_2" text null,
  "Email_3" text null,
  "Email_Replied" text null,
  "W.P_FollowUp 1" text null,
  "Dropped" text null,
  "W.P_1 TS" text null,
  "W.P_2 TS" text null,
  "W.P_Replied 2" text null,
  "W.P_FollowUp 2" text null,
  "W.P_Replied 3" text null,
  "W.P_FollowUp 3" text null,
  "W.P_Replied 4" text null,
  "W.P_FollowUp 4" text null,
  "W.P_Replied 5" text null,
  "W.P_FollowUp 5" text null,
  "W.P_Replied 6" text null,
  "W.P_FollowUp 6" text null,
  "W.P_Replied 7" text null,
  "W.P_FollowUp 7" text null,
  "W.P_Replied 8" text null,
  "W.P_FollowUp 8" text null,
  "W.P_Replied 9" text null,
  "W.P_FollowUp 9" text null,
  "W.P_Replied 10" text null,
  "W.P_FollowUp 10" text null,
  "W.P_1 Retry" text null,
  "W.P_2 Retry" text null,
  "Email_2 TS" text null,
  "Email_2 Retry" text null,
  "Email_3 TS" text null,
  "Email_3 Retry" text null,
  "Unsubscribed" text null,
  "W.P_3" text null,
  "W.P_4" text null,
  "WP_Replied_track" text null,
  "Call_replied_track" text null,
  bitrix_lead_id text null,
  "WP_last_contacted" text null,
  "Email_last_contacted" text null,
  "W.P_3 TS" text null,
  "W.P_4 TS" text null,
  "W.P_3 retry" text null,
  "W.P_4 retry" text null,
  w_p_followup_ts_1 text null,
  w_p_followup_ts_2 text null,
  w_p_followup_ts_3 text null,
  w_p_followup_ts_4 text null,
  w_p_followup_ts_5 text null,
  w_p_followup_ts_6 text null,
  w_p_followup_ts_7 text null,
  w_p_followup_ts_8 text null,
  w_p_followup_ts_9 text null,
  w_p_followup_ts_10 text null,
  wa_sentiment text null,
  wa_sentiment_note text null,
  constraint intro_uk_pkey primary key ("ID")
) TABLESPACE pg_default;

create index IF not exists idx_intro_uk_wp_last_contacted on public.intro_uk using btree ("WP_last_contacted") TABLESPACE pg_default;

create index IF not exists idx_intro_uk_email_last_contacted on public.intro_uk using btree ("Email_last_contacted") TABLESPACE pg_default;

create index IF not exists idx_intro_uk_name_trgm on public.intro_uk using gin ("Name" gin_trgm_ops) TABLESPACE pg_default;

create index IF not exists idx_intro_uk_phone_trgm on public.intro_uk using gin ("Phone" gin_trgm_ops) TABLESPACE pg_default;

create index IF not exists idx_intro_uk_created_at on public.intro_uk using btree ("Created At") TABLESPACE pg_default;

create index IF not exists idx_intro_uk_updated_at on public.intro_uk using btree ("Updated At") TABLESPACE pg_default;

create table public.leads (
  id uuid not null default gen_random_uuid (),
  bitrix_lead_id text not null,
  lead_type text null,
  source text null,
  "Phone" text null,
  email text null,
  name text null,
  current_loop text null,
  current_step integer null default 0,
  loop_started_at timestamp with time zone null,
  last_outreach_at timestamp with time zone null,
  status text null,
  responsible_person_id text null,
  is_active boolean null default true,
  response_received boolean null default false,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  lead_status text null,
  description text null,
  call_note1 text null,
  call_note2 text null,
  call_note3 text null,
  call_note4 text null,
  call_note5 text null,
  call_note6 text null,
  call_sentiment1 text null,
  call_sentiment2 text null,
  call_sentiment3 text null,
  call_sentiment4 text null,
  call_sentiment5 text null,
  call_sentiment6 text null,
  whatsapp_phone_number_id text null,
  constraint leads_pkey primary key (id),
  constraint leads_bitrix_lead_id_key unique (bitrix_lead_id),
  constraint leads_lead_type_check check (
    (
      lead_type = any (
        array['secondary'::text, 'unknown'::text, 'owner'::text]
      )
    )
  )
) TABLESPACE pg_default;

create index IF not exists idx_leads_last_outreach_at on public.leads using btree (last_outreach_at) TABLESPACE pg_default;

create index IF not exists idx_leads_name_trgm on public.leads using gin (name gin_trgm_ops) TABLESPACE pg_default;

create index IF not exists idx_leads_phone_trgm on public.leads using gin ("Phone" gin_trgm_ops) TABLESPACE pg_default;

create index IF not exists idx_leads_created_at on public.leads using btree (created_at) TABLESPACE pg_default;

create index IF not exists idx_leads_updated_at on public.leads using btree (updated_at) TABLESPACE pg_default;

create table public.master_leads (
  "Location" text null,
  "Project Name" text null,
  "Unit Number" text null,
  "Actual Size" text null,
  "Owner Name" text null,
  "Contact Number" text null,
  "Voice 1" text null,
  "Whatsapp_1" text null,
  "Voice 2" text null,
  "Whatsapp 2" text null,
  "WP 1 TS" text null,
  "WP 2 TS" text null,
  "WP 1 Retry" text null,
  master_leads_id bigint not null,
  voice_call_status text null,
  note text null,
  "Last Contacted" text null,
  "Replied" text null,
  "Property Type" text null,
  created_at timestamp with time zone null default now(),
  voice_recording_url text null,
  "WP 1 Retry_TS" text null,
  "W.P_Replied 1" text null,
  "W.P_FollowUp 1" text null,
  "W.P_Replied 2" text null,
  "W.P_FollowUp 2" text null,
  "W.P_Replied 3" text null,
  "W.P_FollowUp 3" text null,
  "W.P_Replied 4" text null,
  "W.P_FollowUp 4" text null,
  "W.P_Replied 5" text null,
  "W.P_FollowUp 5" text null,
  "W.P_Replied 6" text null,
  "W.P_FollowUp 6" text null,
  "W.P_Replied 7" text null,
  "W.P_FollowUp 7" text null,
  "W.P_Replied 8" text null,
  "W.P_FollowUp 8" text null,
  "W.P_Replied 9" text null,
  "W.P_FollowUp 9" text null,
  "W.P_Replied 10" text null,
  "W.P_FollowUp 10" text null,
  "W.P_Replied 1_TS" text null,
  "W.P_FollowUp 1_TS" text null,
  "W.P_Replied 2_TS" text null,
  "W.P_FollowUp 2_TS" text null,
  "W.P_Replied 3_TS" text null,
  "W.P_FollowUp 3_TS" text null,
  "W.P_Replied 4_TS" text null,
  "W.P_FollowUp 4_TS" text null,
  "W.P_Replied 5_TS" text null,
  "W.P_FollowUp 5_TS" text null,
  "W.P_Replied 6_TS" text null,
  "W.P_FollowUp 6_TS" text null,
  "W.P_Replied 7_TS" text null,
  "W.P_FollowUp 7_TS" text null,
  "W.P_Replied 8_TS" text null,
  "W.P_FollowUp 8_TS" text null,
  "W.P_Replied 9_TS" text null,
  "W.P_FollowUp 9_TS" text null,
  "W.P_Replied 10_TS" text null,
  "W.P_FollowUp 10_TS" text null,
  wa_sentiment_note text null,
  wa_sentiment text null,
  "WP_Replied_track" text null,
  call_reply_track text null,
  whatsapp_last_contacted text null,
  constraint master_leads_pkey primary key (master_leads_id)
) TABLESPACE pg_default;

create index IF not exists idx_master_leads_last_contacted on public.master_leads using btree ("Last Contacted") TABLESPACE pg_default;

create index IF not exists idx_master_leads_owner_name_trgm on public.master_leads using gin ("Owner Name" gin_trgm_ops) TABLESPACE pg_default;

create index IF not exists idx_master_leads_contact_number_trgm on public.master_leads using gin ("Contact Number" gin_trgm_ops) TABLESPACE pg_default;

create index IF not exists idx_master_leads_created_at on public.master_leads using btree (created_at) TABLESPACE pg_default;

create trigger trg_sync_vapi_call_logs_from_master_leads
after INSERT
or
update on master_leads for EACH row
execute FUNCTION sync_vapi_call_logs_from_master_leads ();

create table public.nurture_leads (
  id uuid not null default gen_random_uuid (),
  lead_id text null,
  bitrix_lead_id text null,
  name text null,
  "Lead Owner" text null,
  country_code text null,
  "Phone" text null,
  assign_to_id text null,
  status_id text null,
  "Replied" text null default false,
  dropped boolean null default false,
  unsubscribed boolean null default false,
  "Description" text null,
  call_replied_track text null,
  "WP_Replied_track" text null,
  "Last Contacted" timestamp with time zone null,
  wp_last_contacted timestamp with time zone null,
  wa_sentiment text null,
  wa_sentiment_note text null,
  current_week integer null default 1,
  workflow_status text null,
  next_action_at timestamp with time zone null,
  next_action_type text null,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  week1_voice_1 text null,
  week1_voice_1_ts timestamp with time zone null,
  week1_voice_1_replied boolean null default false,
  week1_voice_1_status text null,
  week1_voice_1_sentiment text null,
  week1_voice_1_call_note text null,
  week1_voice_2 text null,
  week1_voice_2_ts timestamp with time zone null,
  week1_voice_2_replied boolean null default false,
  week1_voice_2_status text null,
  week1_voice_2_sentiment text null,
  week1_voice_2_call_note text null,
  week1_wp_1 text null,
  week1_wp_1_ts text null,
  week1_wp_1_retry integer null default 0,
  week1_wp_2 text null,
  week1_wp_2_ts text null,
  week1_wp_2_retry integer null default 0,
  week1_wp_3 text null,
  week1_wp_3_ts text null,
  week1_wp_3_retry integer null default 0,
  week1_wp_4 text null,
  week1_wp_4_ts text null,
  week1_wp_4_retry integer null default 0,
  week2_voice_1 text null,
  week2_voice_1_ts timestamp with time zone null,
  week2_voice_1_replied boolean null default false,
  week2_voice_1_status text null,
  week2_voice_1_sentiment text null,
  week2_voice_1_call_note text null,
  week2_voice_2 text null,
  week2_voice_2_ts timestamp with time zone null,
  week2_voice_2_replied boolean null default false,
  week2_voice_2_status text null,
  week2_voice_2_sentiment text null,
  week2_voice_2_call_note text null,
  week2_wp_1 text null,
  week2_wp_1_ts text null,
  week2_wp_1_retry integer null default 0,
  week2_wp_2 text null,
  week2_wp_2_ts text null,
  week2_wp_2_retry integer null default 0,
  week2_wp_3 text null,
  week2_wp_3_ts text null,
  week2_wp_3_retry integer null default 0,
  week2_wp_4 text null,
  week2_wp_4_ts text null,
  week2_wp_4_retry integer null default 0,
  week3_voice_1 text null,
  week3_voice_1_ts timestamp with time zone null,
  week3_voice_1_replied boolean null default false,
  week3_voice_1_status text null,
  week3_voice_1_sentiment text null,
  week3_voice_1_call_note text null,
  week3_voice_2 text null,
  week3_voice_2_ts timestamp with time zone null,
  week3_voice_2_replied boolean null default false,
  week3_voice_2_status text null,
  week3_voice_2_sentiment text null,
  week3_voice_2_call_note text null,
  week3_wp_1 text null,
  week3_wp_1_ts text null,
  week3_wp_1_retry integer null default 0,
  week3_wp_2 text null,
  week3_wp_2_ts text null,
  week3_wp_2_retry integer null default 0,
  week3_wp_3 text null,
  week3_wp_3_ts text null,
  week3_wp_3_retry integer null default 0,
  week3_wp_4 text null,
  week3_wp_4_ts text null,
  week3_wp_4_retry integer null default 0,
  "W.P_Replied 1" text null,
  "W.P_Replied 2" text null,
  "W.P_Replied 3" text null,
  "W.P_Replied 4" text null,
  "W.P_Replied 5" text null,
  "W.P_Replied 6" text null,
  "W.P_Replied 7" text null,
  "W.P_Replied 8" text null,
  "W.P_Replied 9" text null,
  "W.P_Replied 10" text null,
  "W.P_FollowUp 1" text null,
  "W.P_FollowUp 2" text null,
  "W.P_FollowUp 3" text null,
  "W.P_FollowUp 4" text null,
  "W.P_FollowUp 5" text null,
  "W.P_FollowUp 6" text null,
  "W.P_FollowUp 7" text null,
  "W.P_FollowUp 8" text null,
  "W.P_FollowUp 9" text null,
  "W.P_FollowUp 10" text null,
  "W.P_FollowUp TS 1" text null,
  "W.P_FollowUp TS 2" text null,
  "W.P_FollowUp TS 3" text null,
  "W.P_FollowUp TS 4" text null,
  "W.P_FollowUp TS 5" text null,
  "W.P_FollowUp TS 6" text null,
  "W.P_FollowUp TS 7" text null,
  "W.P_FollowUp TS 8" text null,
  "W.P_FollowUp TS 9" text null,
  "W.P_FollowUp TS 10" text null,
  constraint nurture_leads_pkey primary key (id),
  constraint nurture_leads_phone_key unique ("Phone")
) TABLESPACE pg_default;

create index IF not exists idx_nurture_leads_name_trgm on public.nurture_leads using gin (name gin_trgm_ops) TABLESPACE pg_default;

create index IF not exists idx_nurture_leads_phone_trgm on public.nurture_leads using gin ("Phone" gin_trgm_ops) TABLESPACE pg_default;

create index IF not exists idx_nurture_leads_created_at on public.nurture_leads using btree (created_at) TABLESPACE pg_default;

create index IF not exists idx_nurture_leads_updated_at on public.nurture_leads using btree (updated_at) TABLESPACE pg_default;

create table public.nurture_leads_uk (
  id uuid not null default gen_random_uuid (),
  lead_id text null,
  bitrix_lead_id text null,
  name text null,
  "Lead Owner" text null,
  country_code text null,
  "Phone" text null,
  assign_to_id text null,
  status_id text null,
  "Replied" text null,
  dropped boolean null,
  unsubscribed boolean null,
  call_replied_track text null,
  "WP_Replied_track" text null,
  "Last Contacted" timestamp with time zone null,
  wp_last_contacted timestamp with time zone null,
  wa_sentiment text null,
  wa_sentiment_note text null,
  current_week integer null,
  workflow_status text null,
  next_action_at timestamp with time zone null,
  next_action_type text null,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  week1_voice_1 text null,
  week1_voice_1_ts timestamp with time zone null,
  week1_voice_1_replied boolean null,
  week1_voice_1_status text null,
  week1_voice_1_sentiment text null,
  week1_voice_1_call_note text null,
  week1_voice_2 text null,
  week1_voice_2_ts timestamp with time zone null,
  week1_voice_2_replied boolean null,
  week1_voice_2_status text null,
  week1_voice_2_sentiment text null,
  week1_voice_2_call_note text null,
  week1_wp_1 text null,
  week1_wp_1_ts text null,
  week1_wp_1_retry integer null,
  week1_wp_2 text null,
  week1_wp_2_ts text null,
  week1_wp_2_retry integer null,
  week1_wp_3 text null,
  week1_wp_3_ts text null,
  week1_wp_3_retry integer null,
  week1_wp_4 text null,
  week1_wp_4_ts text null,
  week1_wp_4_retry integer null,
  week2_voice_1 text null,
  week2_voice_1_ts timestamp with time zone null,
  week2_voice_1_replied boolean null,
  week2_voice_1_status text null,
  week2_voice_1_sentiment text null,
  week2_voice_1_call_note text null,
  week2_voice_2 text null,
  week2_voice_2_ts timestamp with time zone null,
  week2_voice_2_replied boolean null,
  week2_voice_2_status text null,
  week2_voice_2_sentiment text null,
  week2_voice_2_call_note text null,
  week2_wp_1 text null,
  week2_wp_1_ts text null,
  week2_wp_1_retry integer null,
  week2_wp_2 text null,
  week2_wp_2_ts text null,
  week2_wp_2_retry integer null,
  week2_wp_3 text null,
  week2_wp_3_ts text null,
  week2_wp_3_retry integer null,
  week2_wp_4 text null,
  week2_wp_4_ts text null,
  week2_wp_4_retry integer null,
  week3_voice_1 text null,
  week3_voice_1_ts timestamp with time zone null,
  week3_voice_1_replied boolean null,
  week3_voice_1_status text null,
  week3_voice_1_sentiment text null,
  week3_voice_1_call_note text null,
  week3_voice_2 text null,
  week3_voice_2_ts timestamp with time zone null,
  week3_voice_2_replied boolean null,
  week3_voice_2_status text null,
  week3_voice_2_sentiment text null,
  week3_voice_2_call_note text null,
  week3_wp_1 text null,
  week3_wp_1_ts text null,
  week3_wp_1_retry integer null,
  week3_wp_2 text null,
  week3_wp_2_ts text null,
  week3_wp_2_retry integer null,
  week3_wp_3 text null,
  week3_wp_3_ts text null,
  week3_wp_3_retry integer null,
  week3_wp_4 text null,
  week3_wp_4_ts text null,
  week3_wp_4_retry integer null,
  "W.P_Replied 1" text null,
  "W.P_Replied 2" text null,
  "W.P_Replied 3" text null,
  "W.P_Replied 4" text null,
  "W.P_Replied 5" text null,
  "W.P_Replied 6" text null,
  "W.P_Replied 7" text null,
  "W.P_Replied 8" text null,
  "W.P_Replied 9" text null,
  "W.P_Replied 10" text null,
  "W.P_FollowUp 1" text null,
  "W.P_FollowUp 2" text null,
  "W.P_FollowUp 3" text null,
  "W.P_FollowUp 4" text null,
  "W.P_FollowUp 5" text null,
  "W.P_FollowUp 6" text null,
  "W.P_FollowUp 7" text null,
  "W.P_FollowUp 8" text null,
  "W.P_FollowUp 9" text null,
  "W.P_FollowUp 10" text null,
  "W.P_FollowUp TS 1" text null,
  "W.P_FollowUp TS 2" text null,
  "W.P_FollowUp TS 3" text null,
  "W.P_FollowUp TS 4" text null,
  "W.P_FollowUp TS 5" text null,
  "W.P_FollowUp TS 6" text null,
  "W.P_FollowUp TS 7" text null,
  "W.P_FollowUp TS 8" text null,
  "W.P_FollowUp TS 9" text null,
  "W.P_FollowUp TS 10" text null,
  constraint nurture_leads_uk_pkey primary key (id),
  constraint nurture_leads_uk_phone_key unique ("Phone")
) TABLESPACE pg_default;

create index IF not exists idx_nurture_leads_uk_name_trgm on public.nurture_leads_uk using gin (name gin_trgm_ops) TABLESPACE pg_default;

create index IF not exists idx_nurture_leads_uk_phone_trgm on public.nurture_leads_uk using gin ("Phone" gin_trgm_ops) TABLESPACE pg_default;

create index IF not exists idx_nurture_leads_uk_created_at on public.nurture_leads_uk using btree (created_at) TABLESPACE pg_default;

create index IF not exists idx_nurture_leads_uk_updated_at on public.nurture_leads_uk using btree (updated_at) TABLESPACE pg_default;

create table public.vapi_call_logs (
  id text not null,
  started_at timestamp with time zone null,
  customer_phone text null,
  customer_name text null,
  duration_seconds double precision null,
  status text null,
  cost_usd double precision null,
  source text null,
  transcript jsonb null,
  summary text null,
  recording_url text null,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  vapi_account text null default 'normal'::text,
  "assistantId" text null,
  type text null,
  voice_call_status text null,
  note text null,
  constraint vapi_call_logs_pkey primary key (id)
) TABLESPACE pg_default;

create index IF not exists idx_vapi_logs_started_at on public.vapi_call_logs using btree (started_at desc) TABLESPACE pg_default;

create index IF not exists idx_vapi_call_logs_account on public.vapi_call_logs using btree (vapi_account) TABLESPACE pg_default;

create index IF not exists idx_vapi_call_logs_account_date on public.vapi_call_logs using btree (vapi_account, started_at desc) TABLESPACE pg_default;

create index IF not exists idx_vapi_call_logs_started_at on public.vapi_call_logs using btree (started_at desc) TABLESPACE pg_default;

create index IF not exists idx_vapi_calls_date on public.vapi_call_logs using btree (started_at desc) TABLESPACE pg_default;

create index IF not exists idx_vapi_logs_account_started on public.vapi_call_logs using btree (vapi_account, started_at desc) TABLESPACE pg_default;

create index IF not exists idx_vapi_call_logs_created_at on public.vapi_call_logs using btree (created_at desc) TABLESPACE pg_default;

create index IF not exists idx_vapi_call_logs_assistant_id on public.vapi_call_logs using btree ("assistantId") TABLESPACE pg_default;

create index IF not exists idx_vapi_call_logs_assistant_created on public.vapi_call_logs using btree ("assistantId", created_at desc) TABLESPACE pg_default;

create index IF not exists idx_vapi_call_logs_voice_status on public.vapi_call_logs using btree (voice_call_status) TABLESPACE pg_default;

create index IF not exists idx_vapi_call_logs_cost on public.vapi_call_logs using btree (cost_usd) TABLESPACE pg_default;

create trigger trg_sync_vapi_call_logs_voice_status_note BEFORE INSERT
or
update OF customer_phone on vapi_call_logs for EACH row
execute FUNCTION sync_vapi_call_logs_voice_status_note ();

create table public.vapi_call_logs_nf (
  id text not null,
  started_at timestamp with time zone null,
  customer_phone text null,
  customer_name text null,
  duration_seconds double precision null,
  status text null,
  cost_usd double precision null,
  source text null,
  transcript jsonb null,
  summary text null,
  recording_url text null,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  vapi_account text null default 'normal'::text,
  "assistantId" text null,
  type text null,
  voice_call_status text null,
  note text null,
  constraint vapi_call_logs_nf_pkey primary key (id)
) TABLESPACE pg_default;

create index IF not exists vapi_call_logs_nf_started_at_idx on public.vapi_call_logs_nf using btree (started_at desc) TABLESPACE pg_default;

create index IF not exists vapi_call_logs_nf_vapi_account_idx on public.vapi_call_logs_nf using btree (vapi_account) TABLESPACE pg_default;

create index IF not exists vapi_call_logs_nf_vapi_account_started_at_idx on public.vapi_call_logs_nf using btree (vapi_account, started_at desc) TABLESPACE pg_default;

create index IF not exists vapi_call_logs_nf_started_at_idx1 on public.vapi_call_logs_nf using btree (started_at desc) TABLESPACE pg_default;

create index IF not exists vapi_call_logs_nf_started_at_idx2 on public.vapi_call_logs_nf using btree (started_at desc) TABLESPACE pg_default;

create index IF not exists vapi_call_logs_nf_vapi_account_started_at_idx1 on public.vapi_call_logs_nf using btree (vapi_account, started_at desc) TABLESPACE pg_default;

create index IF not exists idx_vapi_call_logs_nf_created_at on public.vapi_call_logs_nf using btree (created_at desc) TABLESPACE pg_default;

create index IF not exists idx_vapi_call_logs_nf_assistant_id on public.vapi_call_logs_nf using btree ("assistantId") TABLESPACE pg_default;

create index IF not exists idx_vapi_call_logs_nf_assistant_created on public.vapi_call_logs_nf using btree ("assistantId", created_at desc) TABLESPACE pg_default;

create index IF not exists idx_vapi_call_logs_nf_voice_status on public.vapi_call_logs_nf using btree (voice_call_status) TABLESPACE pg_default;

create index IF not exists idx_vapi_call_logs_nf_cost on public.vapi_call_logs_nf using btree (cost_usd) TABLESPACE pg_default;