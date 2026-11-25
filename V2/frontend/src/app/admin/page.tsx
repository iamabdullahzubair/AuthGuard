import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AdminConsole } from '@/components/admin/AdminConsole';
import { getServerProfile } from '@/lib/server-api';

export const metadata: Metadata = { title: 'Platform access' };
export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const profile = await getServerProfile();
  if (!profile) redirect('/login');
  if (!profile.member.isSuperAdmin) redirect('/dashboard');
  if (profile.tenant) redirect('/dashboard');

  return <AdminConsole email={profile.member.email} />;
}
