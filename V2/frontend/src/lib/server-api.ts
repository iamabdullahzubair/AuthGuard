import { cookies } from 'next/headers';
import { ApiEnvelope, AuthProfile } from './api';

const backendBaseUrl = (process.env.V2_API_BASE_URL || 'http://127.0.0.1:3100').replace(/\/$/, '');

export async function serverApi<T>(path: string): Promise<ApiEnvelope<T> | null> {
  const token = cookies().get('authguard_session')?.value;
  if (!token) return null;

  try {
    const response = await fetch(`${backendBaseUrl}/api/v2/${path.replace(/^\//, '')}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    const envelope = await response.json() as ApiEnvelope<T>;
    return response.ok && envelope.success ? envelope : null;
  } catch {
    return null;
  }
}

export async function getServerProfile() {
  const result = await serverApi<AuthProfile>('auth/me');
  return result?.data ?? null;
}
