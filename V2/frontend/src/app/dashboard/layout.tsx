import { redirect } from 'next/navigation';
import { AccountActions } from '@/components/dashboard/AccountActions';
import { ExitImpersonation } from '@/components/dashboard/ExitImpersonation';
import { Navigation } from '@/components/dashboard/Navigation';
import { getServerProfile } from '@/lib/server-api';

export const dynamic = 'force-dynamic';

export default async function DashboardLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const profile = await getServerProfile();
  if (!profile) redirect('/login');
  if (profile.member.mustChangePassword) redirect('/change-password');
  if (profile.member.isSuperAdmin && !profile.tenant) redirect('/admin');

  const workspace = profile.tenant?.name || 'Platform workspace';
  const role = profile.member.isSuperAdmin ? 'Super Admin · impersonating' : profile.member.role;

  return <div className="min-h-screen bg-[#f5f7f4] lg:flex">
    <Navigation workspace={workspace} owner={!profile.member.isSuperAdmin && profile.member.role === 'owner'} />
    <div className="min-w-0 flex-1">
      {profile.member.isSuperAdmin && profile.tenant && <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#f0dca8] bg-[#fff8e7] px-5 py-2.5 pl-[68px] text-[11px] text-[#775719] lg:px-8">
        <span><strong>Impersonation active.</strong> You are viewing {profile.tenant.name} as a platform administrator.</span>
        <ExitImpersonation />
      </div>}
      <header className="sticky top-0 z-30 flex h-[68px] items-center justify-between border-b border-[#e6ece7] bg-white/90 px-5 pl-[68px] backdrop-blur-xl sm:px-8 sm:pl-[68px] lg:px-9">
        <div><div className="text-[10px] font-medium text-[#89968e]">{workspace}</div><div className="mt-0.5 text-[12px] font-semibold text-[#26372f]">Workspace console</div></div>
        <div className="flex items-center gap-3">
          <div className="hidden text-right sm:block"><div className="max-w-[220px] truncate text-[11px] font-semibold text-[#314239]">{profile.member.email}</div><div className="mt-0.5 text-[9px] capitalize text-[#91a097]">{role}</div></div>
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#e0f3e6] text-[11px] font-bold text-[#1c654a]">{profile.member.email.slice(0, 1).toUpperCase()}</div>
          <AccountActions />
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1440px] px-5 py-7 sm:px-8 sm:py-9 lg:px-10">{children}</main>
    </div>
  </div>;
}
