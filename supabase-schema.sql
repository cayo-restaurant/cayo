-- CAYO reservations table
-- Run this in Supabase → SQL Editor → New query → paste → Run

-- If you already have an old "reservations" table with a different shape,
-- uncomment the next line to drop it first (this deletes all existing data):
-- drop table if exists public.reservations cascade;

create table if not exists public.reservations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  date date not null,
  time text not null,           -- HH:MM (19:00 .. 22:30)
  area text not null check (area in ('bar', 'table')),
  guests int not null check (guests between 1 and 10),
  phone text not null,
  email text not null,
  terms boolean not null default true,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'cancelled')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Helpful indexes
create index if not exists reservations_date_idx on public.reservations (date);
create index if not exists reservations_status_idx on public.reservations (status);
create index if not exists reservations_date_time_idx on public.reservations (date, time);

-- Row Level Security — locked down.
-- All access goes through the service role (used by our server API routes),
-- which BYPASSES RLS. The anon key cannot read or write reservations directly,
-- so the data is only reachable through our authenticated server endpoints.
alter table public.reservations enable row level security;
