import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { SecurityClient } from '@/components/security/SecurityClient';
import type { ActiveSession } from '@/lib/api';
import { getServerProfile, serverApi } from '@/lib/server-api';

export const metadata: Metadata = { title: 'Security & sessions' };

type SessionData = { sessions: ActiveSession[] };

export default async function SecurityPage() {
  const profile = await getServerProfile();
  if (!profile) redirect('/login');
  const sessions = await serverApi<SessionData>('auth/sessions');
  return <SecurityClient email={profile.member.email} sessions={sessions?.data.sessions ?? []} initialError={sessions ? '' : 'Could not load active sessions. Check the V2 API connection and reload.'} />;
}
