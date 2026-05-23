import type { APIRoute } from 'astro';

async function hashIp(ip: string): Promise<string> {
  const enc = new TextEncoder().encode(ip + 'owc_salt_2026');
  const hash = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export const POST: APIRoute = async ({ request, locals }) => {
  const DB = locals.runtime?.env?.DB;

  try {
    const form = await request.formData();
    const email = String(form.get('email') || '').trim().toLowerCase();
    const honeypot = String(form.get('name') || '');

    if (honeypot) {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return new Response(JSON.stringify({ error: 'invalid email' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!DB) {
      return new Response(JSON.stringify({ error: 'database unavailable' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const userAgent = request.headers.get('user-agent') || '';
    const ip = request.headers.get('cf-connecting-ip') || '';
    const ipHash = ip ? await hashIp(ip) : null;

    if (ipHash) {
      const rateCheck = await DB.prepare(
        "SELECT COUNT(*) AS n FROM newsletter_signups WHERE ip_hash = ? AND created_at > datetime('now', '-1 hour')"
      ).bind(ipHash).first<{ n: number }>();
      if (rateCheck && rateCheck.n >= 3) {
        return new Response(JSON.stringify({ error: 'rate limited' }), {
          status: 429,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    await DB.prepare(
      'INSERT INTO newsletter_signups (email, source, user_agent, ip_hash) VALUES (?, ?, ?, ?) ON CONFLICT(email) DO NOTHING'
    ).bind(email, 'site_v1', userAgent.slice(0, 200), ipHash).run();

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
