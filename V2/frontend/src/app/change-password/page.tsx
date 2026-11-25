import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AuthFrame } from '@/components/AuthFrame';
import { ForcedPasswordForm } from '@/components/auth/ForcedPasswordForm';
import { getServerProfile } from '@/lib/server-api';

export const metadata: Metadata = { title: 'Change your password' };
export const dynamic = 'force-dynamic';

export default async function ChangePasswordPage() {
  const profile = await getServerProfile();
  if (!profile) redirect('/login');
  if (!profile.member.mustChangePassword) {
    redirect(profile.member.isSuperAdmin && !profile.tenant ? '/admin' : '/dashboard');
  }

  return <AuthFrame><ForcedPasswordForm isSuperAdmin={profile.member.isSuperAdmin} hasTenant={Boolean(profile.tenant)} /></AuthFrame>;
}
