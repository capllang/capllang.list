const UPSTREAM_ORIGIN = 'https://jsonbin-proxy.awak-cot-u-sibak.workers.dev';
const FRONTEND_ORIGIN = 'https://capllang-list.vercel.app';
const SESSION_COOKIE = 'admin_session';

function parseCookies(header = '') {
  const cookies = {};
  for (const part of String(header).split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    const name = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (name) cookies[name] = value;
  }
  return cookies;
}

function getSetCookies(headers) {
  if (typeof headers.getSetCookie === 'function') {
    return headers.getSetCookie();
  }
  const cookie = headers.get('set-cookie');
  return cookie ? [cookie] : [];
}

export default {
  async fetch(request) {
    try {
      const incomingUrl = new URL(request.url);
      const rawPath = String(incomingUrl.searchParams.get('path') || '')
        .replace(/^\/+/, '');

      if (!rawPath || rawPath === 'proxy') {
        return Response.json(
          { error: 'Invalid API proxy path.' },
          { status: 400 }
        );
      }

      const upstreamUrl = new URL(`/${rawPath}`, UPSTREAM_ORIGIN);
      for (const [key, value] of incomingUrl.searchParams.entries()) {
        if (key !== 'path') upstreamUrl.searchParams.append(key, value);
      }

      const upstreamHeaders = new Headers();
      for (const name of ['accept', 'accept-language', 'content-type', 'user-agent']) {
        const value = request.headers.get(name);
        if (value) upstreamHeaders.set(name, value);
      }

      const cookieHeader = request.headers.get('cookie') || '';
      const sessionToken = parseCookies(cookieHeader)[SESSION_COOKIE] || '';

      if (sessionToken) {
        // Kirim melalui beberapa representasi server-to-server. Worker tetap
        // melakukan verifikasi kriptografis dan cek sesi aktif di D1.
        upstreamHeaders.set('cookie', `${SESSION_COOKIE}=${sessionToken}`);
        upstreamHeaders.set('x-admin-session', sessionToken);
        upstreamHeaders.set('authorization', `Bearer ${sessionToken}`);
      }

      // Route admin yang mengubah state memvalidasi origin di Worker.
      upstreamHeaders.set('origin', FRONTEND_ORIGIN);

      const method = request.method.toUpperCase();
      let body;
      if (method !== 'GET' && method !== 'HEAD') {
        body = await request.arrayBuffer();
      }

      const upstream = await fetch(upstreamUrl, {
        method,
        headers: upstreamHeaders,
        body,
        redirect: 'manual'
      });

      const responseHeaders = new Headers();
      for (const name of [
        'content-type',
        'cache-control',
        'etag',
        'retry-after',
        'location',
        'x-request-id'
      ]) {
        const value = upstream.headers.get(name);
        if (value) responseHeaders.set(name, value);
      }

      // Semua respons auth/admin bersifat private dan tidak boleh dicache.
      if (rawPath.startsWith('auth/') || rawPath.startsWith('admin/')) {
        responseHeaders.set('cache-control', 'no-store, private');
      }

      for (const cookie of getSetCookies(upstream.headers)) {
        responseHeaders.append('set-cookie', cookie);
      }

      return new Response(upstream.body, {
        status: upstream.status,
        headers: responseHeaders
      });
    } catch (error) {
      console.error('API proxy error:', error);
      return Response.json(
        { error: 'API proxy temporarily unavailable.' },
        {
          status: 502,
          headers: { 'cache-control': 'no-store' }
        }
      );
    }
  }
};
