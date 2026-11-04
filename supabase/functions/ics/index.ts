// Edge function "ics": returns the iCal text of one of the caller's calendar feeds.
// Browsers cannot fetch calendar.google.com directly (no CORS), so the app asks this function.
// The feed is looked up with the caller's own token, so row level security only finds their feeds:
// the function can only fetch addresses a signed-in user saved, it is not an open proxy.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const { id } = await req.json().catch(() => ({}));
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: feed } = await db.from('calendar_feeds').select('url').eq('id', id).maybeSingle();
  if (!feed) return new Response('feed not found', { status: 404, headers: cors });

  const res = await fetch(feed.url.trim().replace(/^webcal:/i, 'https:'));
  if (!res.ok) return new Response(`calendar responded ${res.status}`, { status: 502, headers: cors });
  return new Response(await res.text(), { headers: { ...cors, 'Content-Type': 'text/calendar; charset=utf-8' } });
});
