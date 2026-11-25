import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { getServerProfile } from '@/lib/server-api';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const profile = await getServerProfile();
  if (!profile) redirect('/login');
  if (profile.member.mustChangePassword) redirect('/change-password');
  if (!profile.member.isSuperAdmin) redirect('/dashboard');
  if (profile.tenant) redirect('/dashboard');

  return <AdminShell email={profile.member.email}>{children}</AdminShell>;
}
