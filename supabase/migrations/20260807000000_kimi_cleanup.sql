-- Nettoyage : « Dialogues vivants » est passé en génération LOCALE (v3.95), la
-- voie Kimi (proxy + cache serveur + plafond) n'est plus appelée. On retire donc
-- proprement les objets devenus inutiles. Idempotent (if exists).
drop function if exists public.kimi_usage_add(text, int);
drop function if exists public.kimi_cache_cleanup();
drop table if exists public.kimi_usage;
drop table if exists public.kimi_cache;
