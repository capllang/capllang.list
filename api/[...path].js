const UPSTREAM_ORIGIN = 'https://jsonbin-proxy.awak-cot-u-sibak.workers.dev';

export default async function handler(req, res) {
  try {
    const originalUrl = req.url || '/api';
    const upstreamPath = originalUrl.replace(/^\/api(?=\/|\?|$)/, '') || '/';
    const upstreamUrl = `${UPSTREAM_ORIGIN}${upstreamPath}`;

    const headers = new Headers();

    for (const name of [
      'accept',
      'accept-language',
      'content-type',
      'cookie',
      'user-agent'
    ]) {
      const value = req.headers[name];
      if (typeof value === 'string' && value) {
        headers.set(name, value);
      }
    }

    // Worker memeriksa Origin untuk route yang mengubah state.
    // Untuk request browser normal, teruskan Origin asli. Jika tidak ada,
    // gunakan origin host frontend produksi yang sedang menerima request.
    const requestOrigin =
      (typeof req.headers.origin === 'string' && req.headers.origin) ||
      (typeof req.headers.host === 'string' && req.headers.host
        ? `https://${req.headers.host}`
        : 'https://capllang-list.vercel.app');

    headers.set('origin', requestOrigin);

    const method = (req.method || 'GET').toUpperCase();
    let body;

    if (method !== 'GET' && method !== 'HEAD') {
      if (req.body === undefined || req.body === null) {
        body = undefined;
      } else if (typeof req.body === 'string' || Buffer.isBuffer(req.body)) {
        body = req.body;
      } else {
        body = JSON.stringify(req.body);
        if (!headers.has('content-type')) {
          headers.set('content-type', 'application/json');
        }
      }
    }

    const upstream = await fetch(upstreamUrl, {
      method,
      headers,
      body,
      redirect: 'manual'
    });

    res.statusCode = upstream.status;

    // Salin header yang memang dibutuhkan client.
    for (const name of [
      'content-type',
      'cache-control',
      'etag',
      'retry-after',
      'location',
      'x-request-id'
    ]) {
      const value = upstream.headers.get(name);
      if (value) {
        res.setHeader(name, value);
      }
    }

    // Bagian penting: Set-Cookie harus diteruskan eksplisit oleh proxy.
    // Worker tetap menjadi pihak yang membuat session cookie HttpOnly.
    if (typeof upstream.headers.getSetCookie === 'function') {
      const cookies = upstream.headers.getSetCookie();
      if (cookies.length) {
        res.setHeader('Set-Cookie', cookies);
      }
    } else {
      const cookie = upstream.headers.get('set-cookie');
      if (cookie) {
        res.setHeader('Set-Cookie', cookie);
      }
    }

    if (method === 'HEAD' || upstream.status === 204 || upstream.status === 304) {
      res.end();
      return;
    }

    const data = Buffer.from(await upstream.arrayBuffer());
    res.end(data);
  } catch (error) {
    console.error('API proxy error:', error);
    res.statusCode = 502;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'API proxy temporarily unavailable.' }));
  }
}
