-- Durcissement (audit M4) : les fonctions telemetry et push passent par la
-- service role (bypass RLS) — AUCUNE insertion client directe n'est nécessaire.
-- On supprime la politique d'insertion ouverte sur telemetry_daily (elle
-- permettait d'insérer en direct via REST, en contournant la validation de la
-- fonction) et on révoque les privilèges à anon/authenticated. La lecture reste
-- bloquée (politique "no select telemetry" + RLS). Idempotent.

drop policy if exists "insert telemetry" on public.telemetry_daily;

revoke insert, update, delete on public.telemetry_daily from anon, authenticated;

-- Même principe sur les tables push (fonction uniquement) — défense en profondeur.
revoke insert, update, delete on public.push_subs from anon, authenticated;
revoke insert, update, delete on public.push_config from anon, authenticated;
