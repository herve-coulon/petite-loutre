-- Rappels push (v3.0) : abonnements navigateur anonymes + rendez-vous planifiés.
-- Lues/écrites UNIQUEMENT par la fonction supabase/functions/push/index.ts
-- (service_role, bypass RLS). Aucune politique : le client n'y accède jamais.
-- Idempotentes : sur le projet existant (tables déjà présentes), no-op.

-- Abonnement + file de rappels déposés par le client (max 12, triés).
create table if not exists public.push_subs (
  id         bigint generated always as identity primary key,
  endpoint   text not null unique,          -- PushSubscription.endpoint (identifiant)
  p256dh     text not null,                 -- clé publique client (web-push)
  auth       text not null,                 -- secret d'authentification client
  reminders  jsonb not null default '[]'::jsonb,  -- [{at,title,body,tag}] borné à 12
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_push_subs_updated on public.push_subs (updated_at);

-- Configuration de la fonction : clés VAPID (subject/public/private) + cron_secret.
-- Remplie manuellement (Dashboard SQL) — AUCUNE valeur sensible dans le dépôt.
create table if not exists public.push_config (
  key   text primary key,
  value text not null
);

alter table public.push_subs enable row level security;
alter table public.push_config enable row level security;
-- Pas de politique : accès réservé à la service role via la fonction.

-- ⚠️ Cron (à configurer dans le Dashboard → Edge Functions → Scheduled) :
--   « Envoyer les rappels dus » -> cron 10 min -> POST /functions/v1/push
--   body {"action":"tick"} + header x-cron-secret = <cron_secret de push_config>
