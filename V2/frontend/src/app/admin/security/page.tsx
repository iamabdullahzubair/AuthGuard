import type { Metadata } from 'next';
import { SecurityClient } from '@/components/security/SecurityClient';
import type { ActiveSession } from '@/lib/api';
import { getServerProfile, serverApi } from '@/lib/server-api';

export const metadata: Metadata = { title: 'Admin account security' };
type SessionData = { sessions: ActiveSession[] };

export default async function AdminSecurityPage() {
  const profile = await getServerProfile();
  const result = await serverApi<SessionData>('auth/sessions');
  return <SecurityClient email={profile?.member.email ?? 'Super Admin'} sessions={result?.data.sessions ?? []} initialError={result ? '' : 'Could not load active sessions. Check the V2 API connection and reload.'} />;
}
