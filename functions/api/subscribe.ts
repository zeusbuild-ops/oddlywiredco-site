interface Env {
  DB: D1Database;
}

async function hashIp(ip: string): Promise<string> {
  const enc = new TextEncoder().encode(ip + 'owc_salt_2026');
  const hash = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const form = await request.formData();
    const email = String(form.get('email') || '').trim().toLowerCase();
    const honeypot = String(form.get('name') || '');

    // Honeypot check
    if (honeypot) {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }

    // Basic email validation
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return new Response(JSON.stringify({ error: 'invalid email' }), { status: 400 });
    }

    const userAgent = request.headers.get('user-agent') || '';
    const ip = request.headers.get('cf-connecting-ip') || '';
    const ipHash = ip ? await hashIp(ip) : null;

    // Rate-limit by hashed IP — max 3 signups per hour
    if (ipHash) {
      const rateCheck = await env.DB.prepare(
        "SELECT COUNT(*) AS n FROM newsletter_signups WHERE ip_hash = ? AND created_at > datetime('now', '-1 hour')"
      ).bind(ipHash).first<{ n: number }>();
      if (rateCheck && rateCheck.n >= 3) {
        return new Response(JSON.stringify({ error: 'rate limited' }), { status: 429 });
      }
    }

    // Insert (ignore conflict on existing email)
    await env.DB.prepare(
      'INSERT INTO newsletter_signups (email, source, user_agent, ip_hash) VALUES (?, ?, ?, ?) ON CONFLICT(email) DO NOTHING'
    ).bind(email, 'site_v1', userAgent.slice(0, 200), ipHash).run();

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'server error' }), { status: 500 });
  }
};
