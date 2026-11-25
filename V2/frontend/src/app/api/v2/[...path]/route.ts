import { NextRequest, NextResponse } from 'next/server';

const cookieName = 'authguard_session';
const backendBaseUrl = (process.env.V2_API_BASE_URL || 'http://127.0.0.1:3100').replace(/\/$/, '');
const mutatingMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const ttlDays = Number(process.env.V2_SESSION_TTL_DAYS || 7);
const fallbackSessionTtl = Number.isFinite(ttlDays) && ttlDays > 0 ? ttlDays * 24 * 60 * 60 : 7 * 24 * 60 * 60;

function jsonError(status: number, message: string, code: string) {
  return NextResponse.json({ success: false, message, error: { code } }, { status });
}

async function proxy(request: NextRequest, context: { params: { path: string[] } }) {
  const { path } = context.params;
  if (!path?.length || path.some((part) => part === '.' || part === '..')) {
    return jsonError(404, 'Endpoint not found', 'ENDPOINT_NOT_FOUND');
  }

  const method = request.method.toUpperCase();
  const isLogout = method === 'POST' && path[0] === 'auth' && ['logout', 'logout-all'].includes(path[1]);
  const origin = request.headers.get('origin');
  if (mutatingMethods.has(method) && origin && origin !== request.nextUrl.origin) {
    return jsonError(403, 'Cross-origin request rejected', 'ORIGIN_MISMATCH');
  }

  const upstreamUrl = `${backendBaseUrl}/api/v2/${path.map(encodeURIComponent).join('/')}${request.nextUrl.search}`;
  const headers = new Headers();
  const contentType = request.headers.get('content-type');
  if (contentType) headers.set('content-type', contentType);

  const token = request.cookies.get(cookieName)?.value;
  if (token) headers.set('authorization', `Bearer ${token}`);

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, {
      method,
      headers,
      body: method === 'GET' || method === 'HEAD' ? undefined : await request.arrayBuffer(),
      cache: 'no-store',
      redirect: 'manual',
    });
  } catch {
    const failed = jsonError(502, 'Authentication service is unavailable', 'UPSTREAM_UNAVAILABLE');
    if (isLogout) failed.cookies.delete(cookieName);
    return failed;
  }

  const isJson = upstream.headers.get('content-type')?.includes('application/json');
  if (!isJson) {
    return new NextResponse(await upstream.arrayBuffer(), {
      status: upstream.status,
      headers: { 'content-type': upstream.headers.get('content-type') || 'application/octet-stream' },
    });
  }

  let payload: any;
  try {
    payload = await upstream.json();
  } catch {
    return jsonError(502, 'Authentication service returned an invalid response', 'INVALID_UPSTREAM_RESPONSE');
  }

  const isLoginOrRegister = method === 'POST' && path.length === 2 && path[0] === 'auth' && ['login', 'register'].includes(path[1]);
  const isTokenRotation = method === 'POST' && path[0] === 'auth' && (path[1] === 'exit-impersonation' || path[1] === 'impersonate');
  const shouldSetSession = isLoginOrRegister || isTokenRotation;
  const sessionToken = shouldSetSession ? payload?.data?.token : null;
  let maxAge: number | undefined;

  if (sessionToken && typeof sessionToken === 'string') {
    if (payload.data.expiresAt) {
      maxAge = Math.max(0, Math.floor((new Date(payload.data.expiresAt).getTime() - Date.now()) / 1000));
    }
    delete payload.data.token;
  }

  const response = NextResponse.json(payload, { status: upstream.status });
  if (sessionToken && typeof sessionToken === 'string') {
    response.cookies.set(cookieName, sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: maxAge ?? fallbackSessionTtl,
    });
  }

  if (upstream.ok && isLogout) response.cookies.delete(cookieName);
  if (upstream.status === 401) response.cookies.delete(cookieName);
  return response;
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
