-- Migration: per-key rate limiting for the paid "compute" API routes.
-- Run:  psql "$DATABASE_URL_UNPOOLED" -f db/003_rate_limits.sql

-- Fixed-window counters: one row per (bucket key, window bucket).
create table if not exists rate_limits (
  bucket_key   text not null,          -- "analyse:ip:1.2.3.4:h" | "analyse:u:user_2ab:d"
  window_start timestamptz not null,   -- date_trunc('hour'|'day', now())
  count        int not null default 0,
  primary key (bucket_key, window_start)
);

-- Insert-only log, written only when a request is blocked. Powers the KPI.
create table if not exists rate_limit_blocks (
  id           bigint generated always as identity primary key,
  route        text not null,
  scope        text not null,          -- 'guest' | 'user'
  bucket_key   text not null,
  created_at   timestamptz not null default now()
);
create index if not exists rate_limit_blocks_created_idx on rate_limit_blocks (created_at desc);
