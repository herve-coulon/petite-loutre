// Edge Function : proxy Kimi (Moonshot AI) avec cache côté serveur.
// Objectif : économiser les crédits token en réutilisant les réponses identiques.
// La clé API Kimi reste côté serveur (secret Supabase) ; le client ne l'a jamais.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") ?? "*";
const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const KIMI_API_KEY = Deno.env.get("KIMI_API_KEY") ?? "";
const KIMI_BASE_URL = "https://api.moonshot.cn/v1";
const DEFAULT_MODEL = "kimi-k2.7";
const DEFAULT_TEMPERATURE = 0.7;
const DEFAULT_MAX_TOKENS = 1024;
const CACHE_TTL_HOURS = Number(Deno.env.get("KIMI_CACHE_TTL_HOURS") ?? "24");

interface Message {
  role: string;
  content: string;
}

interface ChatRequest {
  messages: Message[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

function normalizeMessage(msg: unknown): Message | null {
  if (!msg || typeof msg !== "object") return null;
  const m = msg as Record<string, unknown>;
  const role = String(m.role || "").trim().toLowerCase();
  const content = String(m.content || "").trim();
  if (!role || !content) return null;
  return { role, content };
}

function normalizeMessages(messages: unknown): Message[] {
  if (!Array.isArray(messages)) return [];
  return messages.map(normalizeMessage).filter((m): m is Message => m !== null);
}

async function cacheKey(messages: Message[], model: string, temperature: number, maxTokens: number): Promise<string> {
  const payload = JSON.stringify({
    model,
    temperature,
    maxTokens,
    messages,
  });
  const data = new TextEncoder().encode(payload);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = (await req.json()) as ChatRequest;
    const messages = normalizeMessages(body.messages);
    if (messages.length === 0) {
      return new Response(JSON.stringify({ error: "messages array required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const model = String(body.model || DEFAULT_MODEL);
    const temperature = Number(body.temperature ?? DEFAULT_TEMPERATURE);
    const maxTokens = Number(body.maxTokens ?? DEFAULT_MAX_TOKENS);

    const key = await cacheKey(messages, model, temperature, maxTokens);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // 1. Chercher dans le cache
    const { data: cached } = await supabase
      .from("kimi_cache")
      .select("response_json, expires_at, hit_count")
      .eq("cache_key", key)
      .single();

    const now = new Date().toISOString();

    if (cached && cached.expires_at && cached.expires_at > now) {
      // Cache hit : met à jour le compteur de réutilisations
      await supabase
        .from("kimi_cache")
        .update({ hit_count: (cached.hit_count || 0) + 1 })
        .eq("cache_key", key);

      const response = cached.response_json as Record<string, unknown>;
      return new Response(
        JSON.stringify({ ...response, cached: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Cache miss : appel API Kimi
    if (!KIMI_API_KEY) {
      return new Response(JSON.stringify({ error: "KIMI_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiRes = await fetch(`${KIMI_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${KIMI_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
      }),
    });

    if (!apiRes.ok) {
      const errText = await apiRes.text();
      console.error("kimi api error:", apiRes.status, errText);
      return new Response(JSON.stringify({ error: "Kimi API error", status: apiRes.status }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiJson = await apiRes.json();

    // 3. Stocker dans le cache
    const expiresAt = new Date(Date.now() + CACHE_TTL_HOURS * 60 * 60 * 1000).toISOString();
    const usage = (apiJson.usage || {}) as Record<string, number>;

    const { error: insertError } = await supabase.from("kimi_cache").upsert({
      cache_key: key,
      model,
      temperature,
      max_tokens: maxTokens,
      response_json: apiJson,
      prompt_tokens: usage.prompt_tokens ?? 0,
      completion_tokens: usage.completion_tokens ?? 0,
      total_tokens: usage.total_tokens ?? 0,
      expires_at: expiresAt,
      hit_count: 0,
    }, { onConflict: "cache_key" });

    if (insertError) {
      console.error("kimi cache insert error:", insertError);
    }

    return new Response(
      JSON.stringify({ ...apiJson, cached: false }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("kimi-chat error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
