-- Migration: Clerk user IDs are strings (e.g. "user_2ab…"), not UUIDs.
-- Widen every "which user" column from uuid to text.
alter table org_members        alter column user_id      type text;
alter table contracts          alter column user_id      type text;
alter table contract_versions  alter column created_by   type text;
alter table clause_library     alter column user_id      type text;
alter table clause_comments    alter column user_id      type text;
alter table approval_requests  alter column requested_by type text;
alter table approval_decisions alter column decided_by   type text;
