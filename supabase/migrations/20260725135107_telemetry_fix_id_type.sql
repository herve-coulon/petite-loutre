-- Correction : id en text au lieu de uuid (le client envoie un hex 16 chars, pas un UUID)
alter table public.telemetry_daily drop constraint telemetry_daily_pkey;
alter table public.telemetry_daily alter column id type text using id::text;
alter table public.telemetry_daily add primary key (id, day);
