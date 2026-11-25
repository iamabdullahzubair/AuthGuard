export type ApiEnvelope<T> = {
  success: boolean;
  message: string;
  data: T;
  error?: { code: string; details?: unknown };
};

export type Member = {
  id: string;
  email: string;
  role: string;
  isSuperAdmin: boolean;
  mustChangePassword: boolean;
};

export type Tenant = {
  id: string;
  name: string;
  slug: string;
  tier: string;
  status?: string;
  branding?: { issuerName?: string; primaryColor?: string };
};

export type AuthProfile = {
  member: Member;
  tenant: Tenant | null;
  session: { id: string };
};

export type ActiveSession = {
  id: string;
  deviceName: string;
  deviceType: 'web' | 'pwa' | 'mobile';
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  ipAddress: string | null;
  userAgent: string | null;
  current: boolean;
};

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(message: string, status: number, code = 'REQUEST_FAILED') {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');

  const response = await fetch(`/api/v2/${path.replace(/^\//, '')}`, {
    ...init,
    headers,
    credentials: 'same-origin',
    cache: 'no-store',
  });
  const envelope = await response.json().catch(() => null) as ApiEnvelope<T> | null;

  if (!response.ok || !envelope?.success) {
    throw new ApiError(
      envelope?.message || 'The request could not be completed.',
      response.status,
      envelope?.error?.code,
    );
  }

  return envelope.data;
}
