import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowUpRight, KeyRound, ShieldCheck, UsersRound, Fingerprint, Activity } from 'lucide-react';
import { getServerProfile, serverApi } from '@/lib/server-api';
import { redirect } from 'next/navigation';

export const metadata: Metadata = { title: 'Overview' };

type SessionList = { sessions: Array<{ id: string; current: boolean }> };
type MembersList = { members: Array<{ id: string }> };

export default async function DashboardPage() {
  const profile = await getServerProfile();
  if (!profile) redirect('/login');

  const [sessionResult, memberResult] = await Promise.all([
    serverApi<SessionList>('auth/sessions'),
    !profile.member.isSuperAdmin && profile.member.role === 'owner' ? serverApi<MembersList>('tenant-members') : Promise.resolve(null),
  ]);
  const activeSessions = sessionResult?.data.sessions.length ?? 0;
  const memberCount = memberResult?.data.members.length;
  const firstName = profile.member.email.split('@')[0].split(/[._-]/)[0];

  return <div className="space-y-7">
    <section className="relative overflow-hidden rounded-[24px] bg-[#173b2f] px-6 py-7 text-white sm:px-9 sm:py-9">
      <div className="pointer-events-none absolute -right-10 -top-24 h-[340px] w-[340px] rounded-full border border-white/[.07]" />
      <div className="pointer-events-none absolute -right-2 -top-10 h-[240px] w-[240px] rounded-full border border-white/[.07]" />
      <div className="pointer-events-none absolute -bottom-24 right-40 h-48 w-48 rounded-full bg-[#6ddc9a]/10 blur-[70px]" />
      <div className="relative z-10 max-w-[650px]">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#b9f3cf]/20 bg-[#b9f3cf]/[.08] px-3 py-1.5 text-[9px] font-bold uppercase tracking-[.14em] text-[#b9f3cf]"><span className="h-1.5 w-1.5 rounded-full bg-[#8fe5aa]" />Workspace ready</div>
        <h1 className="text-[29px] font-semibold tracking-[-.05em] sm:text-[36px]">Good to see you, {firstName}.</h1>
        <p className="mt-3 max-w-[550px] text-[12px] leading-6 text-[#bfd0c5] sm:text-[13px]">Your workspace is protected and ready. Manage your people and keep an eye on active access from here.</p>
      </div>
      <div className="relative z-10 mt-7 flex flex-wrap gap-2.5">
        {!profile.member.isSuperAdmin && profile.member.role === 'owner' && <Link href="/dashboard/team" className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#b9f3cf] px-4 text-[11px] font-bold text-[#174d3b] transition hover:bg-[#d1f7df]">Manage team <ArrowUpRight size={15} /></Link>}
        <Link href="/dashboard/security" className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/20 bg-white/[.07] px-4 text-[11px] font-semibold text-white transition hover:bg-white/[.12]"><KeyRound size={14} /> Security settings</Link>
      </div>
    </section>

    <section aria-label="Workspace summary" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <SummaryCard icon={UsersRound} label="Workspace members" value={memberCount === undefined ? '—' : String(memberCount)} note={profile.member.role === 'owner' && !profile.member.isSuperAdmin ? 'Accounts in your tenant' : `Your assigned role: ${profile.member.role}`} tone="green" />
      <SummaryCard icon={Fingerprint} label="Active sessions" value={String(activeSessions)} note="Across your signed-in devices" tone="blue" />
      <SummaryCard icon={ShieldCheck} label="Session security" value="Enabled" note="Revocable, device-aware access" tone="amber" />
    </section>

    <section className="grid gap-5 xl:grid-cols-[1.2fr_.8fr]">
      <div className="card p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4"><div><div className="text-[13px] font-semibold text-[#25372e]">Your workspace</div><p className="mt-1 text-[11px] text-[#87938c]">A quick look at the account you are using.</p></div><span className="rounded-lg bg-[#edf6f0] p-2 text-[#398364]"><Activity size={17} /></span></div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <InfoTile label="Workspace" value={profile.tenant?.name || 'Platform administrator'} />
          <InfoTile label="Workspace address" value={profile.tenant?.slug ? `/w/${profile.tenant.slug}` : 'Platform access'} mono />
          <InfoTile label="Signed in as" value={profile.member.email} />
          <InfoTile label="Account role" value={profile.member.isSuperAdmin ? 'Super Admin' : profile.member.role} />
        </div>
      </div>

      <div className="card p-5 sm:p-6">
        <div className="text-[13px] font-semibold text-[#25372e]">A couple of good next steps</div>
        <div className="mt-4 space-y-2">
          <QuickLink href="/dashboard/security" icon={KeyRound} title="Review signed-in devices" description="Revoke sessions you no longer use." />
          {!profile.member.isSuperAdmin && profile.member.role === 'owner' && <QuickLink href="/dashboard/team" icon={UsersRound} title="Set up your team" description="Create accounts and manage role labels." />}
          {!profile.member.isSuperAdmin && profile.member.role === 'owner' && <QuickLink href="/dashboard/activity" icon={Activity} title="Review workspace activity" description="See sign-ins, security changes, and team management events." />}
        </div>
        <div className="mt-4 rounded-xl border border-[#e8eee9] bg-[#f8faf8] px-3.5 py-3 text-[10px] leading-5 text-[#78867d]">More controls will appear here as their V2 APIs become available.</div>
      </div>
    </section>
  </div>;
}

function SummaryCard({ icon: Icon, label, value, note, tone }: { icon: typeof UsersRound; label: string; value: string; note: string; tone: 'green' | 'blue' | 'amber' }) {
  const tones = { green: 'bg-[#e8f5ed] text-[#327656]', blue: 'bg-[#edf2f8] text-[#54749b]', amber: 'bg-[#fbf4e3] text-[#a47d2f]' };
  return <div className="card p-5"><div className="flex items-center justify-between"><span className="text-[11px] font-medium text-[#7e8b83]">{label}</span><span className={`rounded-[10px] p-2 ${tones[tone]}`}><Icon size={16} /></span></div><div className="mt-4 text-[27px] font-semibold tracking-[-.05em] text-[#1d3027]">{value}</div><div className="mt-1 text-[10px] text-[#9aa59e]">{note}</div></div>;
}

function InfoTile({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div className="rounded-xl border border-[#edf1ee] bg-[#fbfcfb] px-3.5 py-3"><div className="text-[9px] font-bold uppercase tracking-[.1em] text-[#9aa69f]">{label}</div><div className={`mt-1.5 truncate text-[11px] font-semibold text-[#3b4a42] ${mono ? 'font-mono' : ''}`} title={value}>{value}</div></div>;
}

function QuickLink({ href, icon: Icon, title, description }: { href: string; icon: typeof KeyRound; title: string; description: string }) {
  return <Link href={href} className="group flex items-center gap-3 rounded-xl border border-[#edf1ee] p-3 transition hover:border-[#d2e4d8] hover:bg-[#fbfdfb]"><span className="rounded-[10px] bg-[#edf6f0] p-2 text-[#398364]"><Icon size={15} /></span><span className="min-w-0 flex-1"><span className="block text-[11px] font-semibold text-[#35453c]">{title}</span><span className="mt-1 block text-[10px] text-[#89958d]">{description}</span></span><ArrowUpRight size={14} className="text-[#a0ada5] transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-[#398364]" /></Link>;
}
