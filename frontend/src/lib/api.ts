export const API_BASE_URL = typeof window !== 'undefined' ? '' : (process.env.INTERNAL_BACKEND_URL || 'http://127.0.0.1:3001');

export interface Member {
  id: string;
  email: string;
  role: string;
  isSuperAdmin: boolean;
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  tier: string;
  branding?: {
    issuerName?: string;
    primaryColor?: string;
    logoUrl?: string;
  };
}

export function getStoredToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('ag_token');
}

export function setStoredAuth(token: string, member: Member, tenant?: Tenant | null) {
  if (typeof window === 'undefined') return;
  localStorage.setItem('ag_token', token);
  localStorage.setItem('ag_member', JSON.stringify(member));
  if (tenant) {
    localStorage.setItem('ag_tenant', JSON.stringify(tenant));
  } else {
    localStorage.removeItem('ag_tenant');
  }
}

export function clearStoredAuth() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('ag_token');
  localStorage.removeItem('ag_member');
  localStorage.removeItem('ag_tenant');
}

export function getStoredMember(): Member | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem('ag_member');
  return raw ? JSON.parse(raw) : null;
}

export function getStoredTenant(): Tenant | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem('ag_tenant');
  return raw ? JSON.parse(raw) : null;
}

export async function apiClient<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers = new Headers(options.headers || {});

  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const url = `${API_BASE_URL}${endpoint}`;
  const res = await fetch(url, { ...options, headers });

  if (res.status === 401) {
    clearStoredAuth();
    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
      window.location.href = '/login';
    }
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error || `Request failed with status ${res.status}`);
  }

  return data;
}
