// Edge function : reçoit un ping telemetry anonyme et l'insère dans la table.
// Durcie (audit M3) : validation STRICTE du payload, borne de taille, gardes de
// volume anti-abus, erreurs génériques (pas de fuite Postgres), CORS restreint.
// Passe par la service role key (bypass RLS) — le client n'a AUCUN accès direct
// à la table (privilèges révoqués + aucune politique, cf. migration M4).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Origines autorisées (défense en profondeur : un fetch navigateur envoie
// toujours l'en-tête Origin). Production + dev local par défaut — ajustable
// via l'env ALLOWED_ORIGINS (liste séparée par des virgules).
const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS")
  ?? "https://herve-coulon.github.io,http://localhost:8080,http://127.0.0.1:8080")
  .split(",").map((s) => s.trim()).filter(Boolean);

const RE_ID = /^[0-9a-f]{16}$/;      // newTelemetryId() -> 16 hex (crypto.randomUUID)
const RE_DAY = /^\d{4}-\d{2}-\d{2}$/; // dayKey() -> YYYY-MM-DD (UTC)
const MAX_BODY = 4096;               // 4 Ko de payload max
const MAX_LEVEL = 999;
const MAX_STREAK = 10000;
const MAX_FEATURES = 20;
const MAX_FEATURE_LEN = 24;
const MAX_DAY_ROWS = 100000;         // garde de volume : pings par jour (DAU réaliste ≪)
const MAX_ID_ROWS = 1000;            // garde de volume : jours distincts par id

/** En-têtes CORS : seulement si l'origine est dans la liste (sinon, aucun). */
function corsFor(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  if (!origin || !ALLOWED_ORIGINS.includes(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function json(o: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

/** Retourne une raison d'invalidité, ou null si le payload est propre. */
function invalidReason(body: any): string | null {
  if (!body || typeof body !== "object") return "corps invalide";
  const { id, day, level, streak, features } = body;

  if (typeof id !== "string" || !RE_ID.test(id)) return "id invalide";
  if (typeof day !== "string" || !RE_DAY.test(day)) return "jour invalide";
  const d = new Date(day + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return "jour invalide";
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  if (d.getTime() > today.getTime() + 86400000) return "jour dans le futur"; // tolérance fuseau

  if (level != null && (!Number.isInteger(level) || level < 0 || level > MAX_LEVEL)) return "niveau invalide";
  if (streak != null && (!Number.isInteger(streak) || streak < 0 || streak > MAX_STREAK)) return "série invalide";
  if (features != null && (
    !Array.isArray(features) || features.length > MAX_FEATURES
    || features.some((f) => typeof f !== "string" || f.length > MAX_FEATURE_LEN)
  )) return "fonctionnalités invalides";

  return null;
}

serve(async (req: Request) => {
  const cors = corsFor(req);
  if (req.method === "OPTIONS") return new Response("ok", { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: "POST uniquement" }, 405, cors);

  // Borne de taille AVANT tout parsing.
  let text: string;
  try { text = await req.text(); } catch { return json({ error: "corps illisible" }, 400, cors); }
  if (text.length > MAX_BODY) return json({ error: "corps trop volumineux" }, 413, cors);

  let body: any;
  try { body = JSON.parse(text); } catch { return json({ error: "JSON invalide" }, 400, cors); }

  const invalid = invalidReason(body);
  if (invalid) return json({ error: invalid }, 400, cors);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  // Gardes de volume (anti-abus) : un comptage par jour et par id avant insertion.
  const { count: dayCount, error: errDay } = await supabase
    .from("telemetry_daily").select("id", { count: "exact", head: true }).eq("day", body.day);
  if (errDay) { console.error("telemetry count day error:", errDay.message); return json({ error: "service indisponible" }, 500, cors); }
  if ((dayCount ?? 0) > MAX_DAY_ROWS) return json({ error: "trop de requêtes" }, 429, cors);

  const { count: idCount, error: errId } = await supabase
    .from("telemetry_daily").select("id", { count: "exact", head: true }).eq("id", body.id);
  if (errId) { console.error("telemetry count id error:", errId.message); return json({ error: "service indisponible" }, 500, cors); }
  if ((idCount ?? 0) > MAX_ID_ROWS) return json({ error: "trop de requêtes" }, 429, cors);

  const { error } = await supabase.from("telemetry_daily").upsert({
    id: body.id,
    day: body.day,
    level: body.level ?? null,
    streak: body.streak ?? 0,
    features: body.features ?? [],
  }, { onConflict: "id,day" });

  // Erreurs génériques côté client ; le détail (Postgres) ne reste qu'en logs.
  if (error) { console.error("telemetry upsert error:", error.message); return json({ error: "insertion refusée" }, 500, cors); }

  return json({ ok: true }, 200, cors);
});
