const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8' },
});

function clean(value, max = 2000) {
  return String(value || '').trim().slice(0, max);
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function verifyTurnstile(token, ip, secret) {
  if (!token || !secret) return { ok: true, skipped: true };
  const form = new FormData();
  form.append('secret', secret);
  form.append('response', token);
  if (ip) form.append('remoteip', ip);
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  return { ok: !!data.success, data };
}

export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json().catch(() => null);
    if (!body) return json({ ok: false, error: 'Invalid request.' }, 400);

    // Honeypot — humans never fill this.
    if (clean(body.company, 200)) return json({ ok: true });

    const name = clean(body.name, 120);
    const email = clean(body.email, 240);
    const business = clean(body.business, 500);
    const message = clean(body.message, 3000);

    if (!name || !email || !business) {
      return json({ ok: false, error: 'Name, email, and business / website are required.' }, 400);
    }
    if (!isEmail(email)) return json({ ok: false, error: 'Please enter a valid email.' }, 400);

    const ip = request.headers.get('CF-Connecting-IP') || '';
    const turnstile = await verifyTurnstile(body.turnstileToken, ip, env.TURNSTILE_SECRET_KEY);
    if (!turnstile.ok) return json({ ok: false, error: 'Verification failed. Please try again.' }, 403);

    if (!env.RESEND_API_KEY) return json({ ok: false, error: 'Forms are not configured yet.' }, 500);

    const submittedAt = new Date().toISOString();
    const subject = `New pHouse website review request: ${business.slice(0, 80)}`;
    const text = [
      'New pHouse website review request',
      '',
      `Name: ${name}`,
      `Email: ${email}`,
      `Business / website: ${business}`,
      message ? `Message: ${message}` : '',
      '',
      `Submitted: ${submittedAt}`,
      `IP: ${ip || 'unknown'}`,
      `Turnstile: ${turnstile.skipped ? 'skipped/optional' : 'verified'}`,
      '',
      'No prospect communication has been sent. Mike approval still required before any outreach.',
    ].filter(Boolean).join('\n');

    const html = `
      <h2>New pHouse website review request</h2>
      <p><strong>Name:</strong> ${escapeHtml(name)}</p>
      <p><strong>Email:</strong> <a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></p>
      <p><strong>Business / website:</strong><br>${escapeHtml(business).replace(/\n/g, '<br>')}</p>
      ${message ? `<p><strong>Message:</strong><br>${escapeHtml(message).replace(/\n/g, '<br>')}</p>` : ''}
      <hr>
      <p><small>Submitted: ${escapeHtml(submittedAt)}<br>IP: ${escapeHtml(ip || 'unknown')}<br>Turnstile: ${turnstile.skipped ? 'skipped/optional' : 'verified'}</small></p>
      <p><em>No prospect communication has been sent. Mike approval still required before any outreach.</em></p>
    `;

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.RESEND_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: 'pHouse Web Forms <forms@phouseweb.ca>',
        to: [env.PHOUSE_FORM_TO || 'mikecarcasole@gmail.com'],
        reply_to: email,
        subject,
        text,
        html,
      }),
    });

    const resendData = await resendRes.json().catch(() => ({}));
    if (!resendRes.ok) {
      console.error('Resend failed', resendRes.status, resendData);
      return json({ ok: false, error: 'Could not send right now. Please email hello@phouseweb.ca.' }, 502);
    }

    return json({ ok: true });
  } catch (err) {
    console.error(err);
    return json({ ok: false, error: 'Unexpected error. Please email hello@phouseweb.ca.' }, 500);
  }
}

export async function onRequestGet() {
  return json({ ok: false, error: 'Method not allowed.' }, 405);
}

function escapeHtml(str) {
  return String(str).replace(/[&<>'"]/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  }[c]));
}
