-- Plafond de coût MENSUEL pour l'API Kimi (É6 — Dialogues vivants).
-- Un simple compteur de tokens par mois ('YYYY-MM'). L'Edge Function refuse
-- l'appel API au-delà du plafond (le client retombe alors sur les dialogues
-- écrits — le jeu ne se dégrade jamais). Seule l'Edge Function (service role) y accède.
create table if not exists public.kimi_usage (
  month        text        primary key,   -- 'YYYY-MM'
  total_tokens bigint      default 0,
  updated_at   timestamptz default now()
);

alter table public.kimi_usage enable row level security;

-- Incrément atomique du compteur du mois (créé au besoin) ; renvoie le total à jour.
create or replace function public.kimi_usage_add(p_month text, p_tokens int)
returns bigint
language plpgsql
security definer
as $$
declare total bigint;
begin
  insert into public.kimi_usage (month, total_tokens, updated_at)
    values (p_month, greatest(p_tokens, 0), now())
  on conflict (month) do update
    set total_tokens = public.kimi_usage.total_tokens + greatest(excluded.total_tokens, 0),
        updated_at = now()
  returning total_tokens into total;
  return total;
end;
$$;
