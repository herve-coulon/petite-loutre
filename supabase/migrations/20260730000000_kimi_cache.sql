-- Table de cache pour les réponses de l'API Kimi (Moonshot AI).
-- Permet de réutiliser les réponses identiques et d'économiser les crédits token.
-- Seule l'Edge Function Supabase (service role) accède à cette table.
create table if not exists public.kimi_cache (
  cache_key          text        primary key,
  model              text        not null,
  temperature        numeric     not null,
  max_tokens         int         not null,
  response_json      jsonb       not null,
  prompt_tokens      int         default 0,
  completion_tokens  int         default 0,
  total_tokens       int         default 0,
  hit_count          int         default 0,
  created_at         timestamptz default now(),
  expires_at         timestamptz not null
);

-- Index rapide pour vérifier la validité et nettoyer les entrées périmées.
create index if not exists idx_kimi_cache_expires on public.kimi_cache (expires_at);

-- RLS : seule l'Edge Function (service role) accède à cette table.
alter table public.kimi_cache enable row level security;

-- Fonction utilitaire pour nettoyer les entrées expirées (appelable par un cron).
create or replace function public.kimi_cache_cleanup()
returns int
language plpgsql
security definer
as $$
declare
  deleted_count int;
begin
  delete from public.kimi_cache where expires_at < now();
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;
