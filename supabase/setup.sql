-- MovieHub Auto Uploader V2 - isolated read-only mobile snapshot.
-- Run in a NEW Supabase project if possible. Replace both UUIDs below first.
-- In Authentication > Users create two CONFIRMED email users:
--   owner = your normal phone login (magic link)
--   agent = dedicated email/password user whose credentials stay on laptop
-- NEVER commit your real UUIDs to a public repository if you consider them private.
-- This is a single-owner/single-agent installation, not a multi-tenant hosted SaaS.

create table if not exists public.mh_uploader_snapshot (
  id integer primary key default 1 check (id=1),
  owner_id uuid not null references auth.users(id),
  agent_id uuid not null references auth.users(id),
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint mh_payload_limit check (octet_length(payload::text) <= 350000)
);

alter table public.mh_uploader_snapshot enable row level security;
revoke all on table public.mh_uploader_snapshot from public, anon, authenticated;
grant select on table public.mh_uploader_snapshot to authenticated;
grant update (payload,updated_at) on table public.mh_uploader_snapshot to authenticated;

-- RLS: owner can read; agent can read (required for UPDATE); nobody else.
drop policy if exists mh_read_owner_or_agent on public.mh_uploader_snapshot;
create policy mh_read_owner_or_agent on public.mh_uploader_snapshot
for select to authenticated
using ((select auth.uid())=owner_id or (select auth.uid())=agent_id);

-- Only agent can update metadata. No insert/delete privileges, cannot change owner or agent.
drop policy if exists mh_update_agent_only on public.mh_uploader_snapshot;
create policy mh_update_agent_only on public.mh_uploader_snapshot
for update to authenticated
using ((select auth.uid())=agent_id)
with check ((select auth.uid())=agent_id);

-- ONE-TIME INSTALL after replacing both identifiers with UUIDs from Auth > Users.
-- Run this INSERT separately in SQL editor; do not ship changed IDs in GitHub.
-- insert into public.mh_uploader_snapshot (id, owner_id, agent_id)
-- values (1, 'REPLACE_OWNER_AUTH_UUID'::uuid, 'REPLACE_AGENT_AUTH_UUID'::uuid);

-- Check after setup:
-- select id, owner_id, agent_id, updated_at from public.mh_uploader_snapshot;
-- Next, test API permissions as owner and agent (see docs/MOBILE_SETUP.md).
