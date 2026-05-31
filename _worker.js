const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8' },
});
const clean = (value, max = 2000) => String(value || '').trim().slice(0, max);
const isEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const escapeHtml = (str) => String(str).replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));

async function verifyTurnstile(token, ip, secret) {
  if (!token || !secret) return { ok: true, skipped: true };
  const form = new FormData();
  form.append('secret', secret);
  form.append('response', token);
  if (ip) form.append('remoteip', ip);
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form });
  const data = await res.json().catch(() => ({}));
  return { ok: !!data.success, data };
}

async function handleContact(request, env) {
  if (request.method !== 'POST') return json({ ok: false, error: 'Method not allowed.' }, 405);
  const body = await request.json().catch(() => null);
  if (!body) return json({ ok: false, error: 'Invalid request.' }, 400);
  if (clean(body.company, 200)) return json({ ok: true });

  const name = clean(body.name, 120);
  const email = clean(body.email, 240);
  const business = clean(body.business, 500);
  const message = clean(body.message, 3000);
  if (!name || !email || !business) return json({ ok: false, error: 'Name, email, and business / website are required.' }, 400);
  if (!isEmail(email)) return json({ ok: false, error: 'Please enter a valid email.' }, 400);

  const ip = request.headers.get('CF-Connecting-IP') || '';
  const host = new URL(request.url).hostname;
  const turnstileRequired = host === 'phouseweb.ca' || host === 'www.phouseweb.ca';
  if (turnstileRequired && !body.turnstileToken) return json({ ok: false, error: 'Please complete verification.' }, 403);
  const turnstile = await verifyTurnstile(body.turnstileToken, ip, env.TURNSTILE_SECRET_KEY);
  if (!turnstile.ok) return json({ ok: false, error: 'Verification failed. Please try again.' }, 403);
  if (!env.RESEND_API_KEY) return json({ ok: false, error: 'Forms are not configured yet.' }, 500);

  const submittedAt = new Date().toISOString();
  const subject = `New pHouse website review request: ${business.slice(0, 80)}`;
  const text = [
    'New pHouse website review request', '',
    `Name: ${name}`, `Email: ${email}`, `Business / website: ${business}`,
    message ? `Message: ${message}` : '', '',
    `Submitted: ${submittedAt}`, `IP: ${ip || 'unknown'}`,
    `Turnstile: ${turnstile.skipped ? 'skipped/optional' : 'verified'}`, '',
    'This is an inbound website form submission. No outbound prospect email has been sent by this form.',
  ].filter(Boolean).join('\n');
  const html = `
    <h2>New pHouse website review request</h2>
    <p><strong>Name:</strong> ${escapeHtml(name)}</p>
    <p><strong>Email:</strong> <a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></p>
    <p><strong>Business / website:</strong><br>${escapeHtml(business).replace(/\n/g, '<br>')}</p>
    ${message ? `<p><strong>Message:</strong><br>${escapeHtml(message).replace(/\n/g, '<br>')}</p>` : ''}
    <hr><p><small>Submitted: ${escapeHtml(submittedAt)}<br>IP: ${escapeHtml(ip || 'unknown')}<br>Turnstile: ${turnstile.skipped ? 'skipped/optional' : 'verified'}</small></p>
    <p><em>This is an inbound website form submission. No outbound prospect email has been sent by this form.</em></p>`;

  const resendRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: 'pHouse Web Forms <forms@phouseweb.ca>',
      to: [env.PHOUSE_FORM_TO || 'mike@phouseproductions.com'],
      reply_to: email,
      subject, text, html,
    }),
  });
  const resendData = await resendRes.json().catch(() => ({}));
  if (!resendRes.ok) {
    console.error('Resend failed', resendRes.status, resendData);
    return json({ ok: false, error: 'Could not send right now. Please email hello@phouseweb.ca.' }, 502);
  }
  return json({ ok: true });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/api/contact') return handleContact(request, env);
    return env.ASSETS.fetch(request);
  },
};
