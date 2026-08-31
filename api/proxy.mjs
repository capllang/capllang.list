const UPSTREAM_ORIGIN = 'https://jsonbin-proxy.awak-cot-u-sibak.workers.dev';
const FRONTEND_ORIGIN = 'https://capllang-list.vercel.app';

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

    // Pertahankan query asli selain parameter internal `path`.
    for (const [key, value] of Object.entries(req.query || {})) {
      if (key === 'path' || value === undefined || value === null) continue;
      if (Array.isArray(value)) {
        for (const item of value) upstreamUrl.searchParams.append(key, String(item));
      } else {
        upstreamUrl.searchParams.set(key, String(value));
      }
    }

    const headers = {};
    for (const name of [
      'accept',
      'accept-language',
      'content-type',
      'cookie',
      'user-agent'
    ]) {
      const value = req.headers?.[name];
      if (typeof value === 'string' && value) headers[name] = value;
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

    // Teruskan cookie HttpOnly dari Worker ke browser same-origin.
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
