import { redirect } from 'next/navigation';
import { getServerProfile } from '@/lib/server-api';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const profile = await getServerProfile();
  if (!profile) redirect('/login');
  if (profile.member.isSuperAdmin && !profile.tenant) redirect('/admin');
  redirect('/dashboard');
}
