// Rappels push de Ma Petite Loutre — abonnements anonymes + envoi planifié.
// Le CLIENT calcule ses prochains rendez-vous (faim, héron, quêtes) et les dépose
// ici ; le cron appelle {action:'tick'} toutes les 10 min pour envoyer les dus.
import { createClient } from 'npm:@supabase/supabase-js@2.45.0';
import webpush from 'npm:web-push@3.6.7';

const supa = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

async function config(): Promise<Record<string, string>> {
  const { data, error } = await supa.from('push_config').select('key,value');
  if (error) throw new Error('config: ' + error.message);
  return Object.fromEntries((data ?? []).map((r: { key: string; value: string }) => [r.key, r.value]));
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST uniquement' }, 405);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'JSON invalide' }, 400); }

  const cfg = await config();
  webpush.setVapidDetails(cfg.vapid_subject, cfg.vapid_public, cfg.vapid_private);

  // ----- abonnement / mise à jour des rappels (appelé par le jeu) -----
  if (body.action === 'subscribe') {
    const s = body.sub;
    if (!s?.endpoint || !s?.keys?.p256dh || !s?.keys?.auth) return json({ error: 'abonnement invalide' }, 400);
    const reminders = (Array.isArray(body.reminders) ? body.reminders : [])
      .filter((r: any) => r && typeof r.at === 'number' && typeof r.title === 'string')
      .slice(0, 12); // borne anti-abus
    const { error } = await supa.from('push_subs').upsert({
      endpoint: s.endpoint,
      p256dh: s.keys.p256dh,
      auth: s.keys.auth,
      reminders,
      updated_at: new Date().toISOString()
    }, { onConflict: 'endpoint' });
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true, reminders: reminders.length });
  }

  // ----- désabonnement -----
  if (body.action === 'unsubscribe') {
    if (!body.endpoint) return json({ error: 'endpoint requis' }, 400);
    await supa.from('push_subs').delete().eq('endpoint', body.endpoint);
    return json({ ok: true });
  }

  // ----- envoi des rappels dus (appelé par pg_cron) -----
  if (body.action === 'tick') {
    if (req.headers.get('x-cron-secret') !== cfg.cron_secret) return json({ error: 'refusé' }, 403);
    const now = Date.now();
    const { data: subs, error } = await supa.from('push_subs').select('*');
    if (error) return json({ error: error.message }, 500);
    let sent = 0, pruned = 0, failed = 0;
    for (const row of subs ?? []) {
      const all = Array.isArray(row.reminders) ? row.reminders : [];
      const due = all.filter((r: any) => r.at <= now);
      if (!due.length) continue;
      const keep = all.filter((r: any) => r.at > now);
      const r = due.sort((a: any, b: any) => b.at - a.at)[0]; // un seul envoi : le plus récent dû
      try {
        await webpush.sendNotification(
          { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
          JSON.stringify({ title: r.title, body: r.body ?? '', tag: r.tag ?? 'loutre' }),
          { TTL: 3600 }
        );
        sent++;
        await supa.from('push_subs').update({ reminders: keep, updated_at: new Date().toISOString() }).eq('id', row.id);
      } catch (e: any) {
        if (e?.statusCode === 404 || e?.statusCode === 410) {
          await supa.from('push_subs').delete().eq('id', row.id); // abonnement mort
          pruned++;
        } else {
          failed++;
          await supa.from('push_subs').update({ reminders: keep, updated_at: new Date().toISOString() }).eq('id', row.id);
        }
      }
    }
    return json({ ok: true, checked: (subs ?? []).length, sent, pruned, failed });
  }

  return json({ error: 'action inconnue' }, 400);
});
