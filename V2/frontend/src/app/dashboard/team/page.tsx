import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { UsersClient } from '@/components/team/UsersClient';
import { getServerProfile, serverApi } from '@/lib/server-api';

export const metadata: Metadata = { title: 'Team members' };

type TeamMember = { id: string; email: string; role: string; created_at: string; updated_at: string };
type MemberData = { members: TeamMember[] };

export default async function TeamPage() {
  const profile = await getServerProfile();
  if (!profile) redirect('/login');
  if (profile.member.isSuperAdmin || profile.member.role !== 'owner') redirect('/dashboard');

  const result = await serverApi<MemberData>('tenant-members');
  return <UsersClient members={result?.data.members ?? []} ownerId={profile.member.id} initialError={result ? '' : 'Could not load members. Check the V2 API connection and reload.'} />;
}
