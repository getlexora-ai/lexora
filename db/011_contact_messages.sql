-- Migration: messages sent through the public contact form (/contact).
-- Run:  psql "$DATABASE_URL_UNPOOLED" -f db/011_contact_messages.sql
--
-- Every submission is stored here first, then a best-effort copy is emailed to
-- the contact address. The row is the durable record: if the email hand-off
-- fails or no email provider is configured yet, nothing is lost.

create table if not exists contact_messages (
  id          bigint generated always as identity primary key,
  name        text not null,
  email       text not null,
  message     text not null,
  ip          text,                            -- best-effort client IP
  user_agent  text,
  forwarded   boolean not null default false,  -- did the email hand-off succeed
  created_at  timestamptz not null default now()
);

create index if not exists contact_messages_created_idx
  on contact_messages (created_at desc);
