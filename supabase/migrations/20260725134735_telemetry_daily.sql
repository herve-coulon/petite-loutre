-- Table de télémétrie privacy-first : un ping par jour par joueur anonyme.
-- Pas de colonne personnelle, pas de RLS de lecture, insertion libre via anon key.
create table if not exists public.telemetry_daily (
  id         text        not null,
  day        date        not null,
  level      int,
  streak     int,
  features   jsonb       default '[]'::jsonb,
  created_at timestamptz default now(),
  primary key (id, day)
);

-- Index pour les requêtes analytiques (DAU, features les plus utilisées)
create index if not exists idx_telemetry_day on public.telemetry_daily (day);
create index if not exists idx_telemetry_level on public.telemetry_daily (level);

-- RLS : insertion anonyme (anon key), AUCUNE lecture (privacy)
alter table public.telemetry_daily enable row level security;

create policy "insert telemetry"
  on public.telemetry_daily for insert
  with check (true);

create policy "no select telemetry"
  on public.telemetry_daily for select
  using (false);
