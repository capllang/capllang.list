const UPSTREAM_ORIGIN = 'https://jsonbin-proxy.awak-cot-u-sibak.workers.dev';
const FRONTEND_ORIGIN = 'https://capllang-list.vercel.app';
const SESSION_COOKIE = 'admin_session';

function parseCookieHeader(header = '') {
  const out = {};
  for (const part of String(header).split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const key = part.slice(0, i).trim();
    const value = part.slice(i + 1).trim();
    if (key) out[key] = value;
  }
  return out;
}

function getSessionToken(req) {
  // Jalur resmi helper Vercel Node.js Function.
  const helperToken = req?.cookies?.[SESSION_COOKIE];
  if (typeof helperToken === 'string' && helperToken) {
    return helperToken;
  }

  // Fallback untuk runtime/request yang menyediakan header Cookie langsung.
  const cookieHeader = typeof req?.headers?.cookie === 'string'
    ? req.headers.cookie
    : '';

  const headerToken = parseCookieHeader(cookieHeader)[SESSION_COOKIE];
  return typeof headerToken === 'string' && headerToken
    ? headerToken
    : null;
}

export default async function handler(req, res) {
  try {
    const rawPath = Array.isArray(req.query?.path)
      ? req.query.path.join('/')
      : String(req.query?.path || '').replace(/^\/+/, '');

    if (!rawPath || rawPath === 'proxy') {
      res.status(400).json({ error: 'Invalid API proxy path.' });
      return;
    }

    const upstreamUrl = new URL(`/${rawPath}`, UPSTREAM_ORIGIN);

    for (const [key, value] of Object.entries(req.query || {})) {
      if (key === 'path' || value === undefined || value === null) continue;
      if (Array.isArray(value)) {
        for (const item of value) {
          upstreamUrl.searchParams.append(key, String(item));
        }
      } else {
        upstreamUrl.searchParams.set(key, String(value));
      }
    }

    const headers = {};
    for (const name of ['accept', 'accept-language', 'content-type', 'user-agent']) {
      const value = req.headers?.[name];
      if (typeof value === 'string' && value) headers[name] = value;
    }

    // Ambil session dari helper Vercel atau Cookie header, lalu kirim ulang
    // ke Worker melalui dua jalur. Worker lama bisa membaca Cookie;
    // Worker final juga bisa memakai X-Admin-Session sebagai fallback.
    const sessionToken = getSessionToken(req);
    if (sessionToken) {
      headers.cookie = `${SESSION_COOKIE}=${sessionToken}`;
      headers['x-admin-session'] = sessionToken;
    }

    // Worker memvalidasi Origin untuk route admin yang mengubah state.
    headers.origin = FRONTEND_ORIGIN;

    const method = String(req.method || 'GET').toUpperCase();
    let body;

    if (method !== 'GET' && method !== 'HEAD') {
      if (req.body === undefined || req.body === null) {
        body = undefined;
      } else if (typeof req.body === 'string' || Buffer.isBuffer(req.body)) {
        body = req.body;
      } else {
        body = JSON.stringify(req.body);
        if (!headers['content-type']) headers['content-type'] = 'application/json';
      }
    }

    const upstream = await fetch(upstreamUrl, {
      method,
      headers,
      body,
      redirect: 'manual'
    });

    res.status(upstream.status);

    for (const name of [
      'content-type',
      'cache-control',
      'etag',
      'retry-after',
      'location',
      'x-request-id'
    ]) {
      const value = upstream.headers.get(name);
      if (value) res.setHeader(name, value);
    }

    // Pertahankan Set-Cookie dari Worker agar login/logout tetap mengubah
    // cookie HttpOnly pada domain frontend Vercel.
    if (typeof upstream.headers.getSetCookie === 'function') {
      const cookies = upstream.headers.getSetCookie();
      if (cookies.length) res.setHeader('Set-Cookie', cookies);
    } else {
      const cookie = upstream.headers.get('set-cookie');
      if (cookie) res.setHeader('Set-Cookie', cookie);
    }

    if (method === 'HEAD' || upstream.status === 204 || upstream.status === 304) {
      res.end();
      return;
    }

    const data = Buffer.from(await upstream.arrayBuffer());
    res.send(data);
  } catch (error) {
    console.error('API proxy error:', error);
    res.status(502).json({ error: 'API proxy temporarily unavailable.' });
  }
}
