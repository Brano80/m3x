-- 20261023000008_retire_tool_radar.sql
-- Retire Tool Radar. Already applied to prod (orcsrdsqvtxkaoiwjomp) on 2026-10-22/23 via two
-- migrations: revoke_public_execute_get_tool_radar_config + retire_tool_radar_public_access.
-- This file is the migration-history record.
--
-- Data in the tool_radar schema is kept. The anon/authenticated API roles can no longer read,
-- write or call anything in it; service_role (server-side only) keeps access.
-- The tool-radar-embed and tool-radar-re-embed Edge Functions were replaced with stubs that
-- return 410 Gone.

-- public-schema functions that wrap tool_radar
revoke execute on function public.get_tool_radar_card(uuid)               from public, anon, authenticated;
revoke execute on function public.get_tool_radar_config(text)             from public, anon, authenticated;
grant  execute on function public.get_tool_radar_config(text)             to service_role;
revoke execute on function public.match_tool_cards(vector, integer)       from public, anon, authenticated;
revoke execute on function public.search_tools(vector, integer)           from public, anon, authenticated;
revoke execute on function public.update_tool_radar_embedding(uuid, text) from public, anon, authenticated;
revoke execute on function public.tool_radar_search(vector, integer)      from public, anon, authenticated;

-- the tool_radar schema itself (exposed via PostgREST db_schemas)
revoke execute on all functions in schema tool_radar from public, anon, authenticated;
revoke all on all tables in schema tool_radar from anon, authenticated;
revoke usage on schema tool_radar from anon, authenticated;
