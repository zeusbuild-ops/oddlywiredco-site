// Brevo (transactional email) send helper + review-request email template.
// API key is expected on `env.BREVO_API_KEY` (worker secret) — callers pass it in
// to keep this module pure-fetch and easy to test.

interface BrevoSendArgs {
  to: { email: string; name?: string };
  subject: string;
  htmlBody: string;
  apiKey: string;
  fromEmail?: string;
  fromName?: string;
}

export async function brevoSend(args: BrevoSendArgs): Promise<void> {
  const {
    to, subject, htmlBody, apiKey,
    fromEmail = 'hello@oddlywiredco.com',
    fromName = 'OddlyWiredCo',
  } = args;
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'api-key': apiKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      sender: { email: fromEmail, name: fromName },
      to: [to],
      subject,
      htmlContent: htmlBody,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`brevo send failed: ${res.status} ${text}`);
  }
}

export function reviewRequestEmailHtml(args: {
  productTitle: string;
  productImage: string;
  reviewUrl: string;
  unsubscribeUrl: string;
}): string {
  return `<!doctype html>
<html><body style="font-family:Inter,system-ui,sans-serif;background:#F4EFE6;color:#0E0E11;padding:32px;line-height:1.6;">
  <div style="max-width:520px;margin:0 auto;background:#FFFFFF;border-radius:8px;padding:32px;">
    <img src="${args.productImage}" alt="" style="width:100%;max-width:240px;display:block;margin:0 auto 24px;border-radius:6px;">
    <h1 style="font-family:Menlo,monospace;font-size:22px;font-weight:700;margin:0 0 14px;">what did your brain think?</h1>
    <p style="margin:0 0 18px;">your ${args.productTitle} arrived a week ago. if it landed, we'd love to hear how.</p>
    <p style="margin:0 0 24px;">tell us what your brain made of it. no template, no ratings essay — just a sentence is fine.</p>
    <a href="${args.reviewUrl}" style="display:inline-block;background:#4CE2C1;color:#0E0E11;padding:12px 22px;border-radius:4px;text-decoration:none;font-weight:700;font-family:Menlo,monospace;text-transform:uppercase;letter-spacing:1.5px;font-size:13px;">leave a review →</a>
    <p style="margin:32px 0 0;font-size:11px;opacity:0.55;">
      sent to verified buyers only. <a href="${args.unsubscribeUrl}" style="color:inherit;">unsubscribe</a>
    </p>
  </div>
</body></html>`;
}
