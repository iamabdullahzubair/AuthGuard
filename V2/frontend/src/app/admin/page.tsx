import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Activity, Building2, ChartNoAxesCombined, KeyRound, LockKeyhole, ServerCog, ShieldCheck, TriangleAlert, UsersRound } from 'lucide-react';
import { serverApi } from '@/lib/server-api';

export const metadata: Metadata = { title: 'Platform overview' };

type TenantSummary = { id: string; name: string; slug: string; status: 'active' | 'suspended'; createdAt: string; ownerEmail: string | null; memberCount: number };
type TenantDirectory = { tenants: TenantSummary[]; pagination: { total: number; limit: number; offset: number; hasMore: boolean } };

const upcoming = [
  { title: 'Platform analytics', detail: 'Global user, device, webhook, and verification metrics across tenants.', icon: ChartNoAxesCombined },
  { title: 'System health', detail: 'API, database, Redis, relay, and worker health in one place.', icon: ServerCog },
];

export default async function AdminPage() {
  const result = await serverApi<TenantDirectory>('super-admin/tenants?limit=4&offset=0');
  const tenants = result?.data.tenants ?? [];
  const tenantTotal = result?.data.pagination.total;

  return <div className="space-y-7">
    <section className="relative overflow-hidden rounded-[24px] bg-[#24392d] px-6 py-7 text-white sm:px-9 sm:py-9">
      <div className="pointer-events-none absolute -right-12 -top-24 h-[340px] w-[340px] rounded-full border border-white/[.07]" /><div className="pointer-events-none absolute -right-2 -top-10 h-[240px] w-[240px] rounded-full border border-white/[.07]" /><div className="pointer-events-none absolute -bottom-24 right-40 h-48 w-48 rounded-full bg-[#e8c96f]/10 blur-[70px]" />
      <div className="relative z-10 max-w-[680px]"><div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#f1d98f]/25 bg-[#f1d98f]/[.09] px-3 py-1.5 text-[9px] font-bold uppercase tracking-[.14em] text-[#f1d98f]"><ShieldCheck size={13} /> Platform administrator</div><h1 className="text-[29px] font-semibold tracking-[-.05em] sm:text-[36px]">Platform overview</h1><p className="mt-3 text-[12px] leading-6 text-[#c5d0c8] sm:text-[13px]">A control room for tenant operations, platform activity, and service health. V2 capabilities are being brought online in stages.</p></div>
      <div className="relative z-10 mt-6 flex flex-wrap gap-2.5"><Link href="/admin/tenants" className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#f1d98f] px-4 text-[10px] font-bold text-[#4c3d18] transition hover:bg-[#f7e7b3]">Open tenant directory <ArrowRight size={14} /></Link><Link href="/admin/audit-logs" className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/20 bg-white/[.07] px-4 text-[10px] font-semibold text-white transition hover:bg-white/[.12]"><Activity size={14} />Activity &amp; audit logs</Link><Link href="/admin/security" className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/20 bg-white/[.07] px-4 text-[10px] font-semibold text-white transition hover:bg-white/[.12]"><LockKeyhole size={14} />Account security</Link></div>
    </section>

    <section className="grid gap-4 sm:grid-cols-3">
      <SummaryCard icon={Building2} label="Tenant workspaces" value={tenantTotal === undefined ? 'Unavailable' : String(tenantTotal)} detail={tenantTotal === undefined ? 'Tenant directory API is unreachable' : 'Across the V2 platform'} tone="amber" />
      <SummaryCard icon={KeyRound} label="Tenant access" value="Available" detail="Search and scoped impersonation" tone="green" />
      <SummaryCard icon={LockKeyhole} label="Admin security" value="Available" detail="Password and active sessions" tone="blue" />
    </section>

    <section className="grid gap-5 xl:grid-cols-[1.15fr_.85fr]">
      <div className="overflow-hidden rounded-[18px] border border-[#e5ebe7] bg-white">
        <div className="flex items-center justify-between border-b border-[#edf1ee] px-5 py-4"><div><h2 className="text-[12px] font-semibold text-[#34443b]">Recently created tenants</h2><p className="mt-1 text-[10px] text-[#98a39c]">Latest workspaces from the V2 tenant directory.</p></div><Link href="/admin/tenants" className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#55725f] hover:text-[#176b52]">View all <ArrowRight size={12} /></Link></div>
        {!result ? <div className="px-5 py-10 text-center text-[10px] text-[#9b4b3c]">Tenant directory is unavailable. Check the V2 API connection.</div> : tenants.length === 0 ? <div className="px-5 py-10 text-center"><Building2 size={20} className="mx-auto text-[#a8b4ac]" /><p className="mt-3 text-[11px] font-semibold text-[#4d5c53]">No tenant workspaces yet</p><p className="mt-1 text-[9px] text-[#909c94]">Tenant registrations will appear here.</p></div> : <div className="divide-y divide-[#eff2f0]">{tenants.map((tenant) => <div key={tenant.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5"><div className="flex min-w-0 items-center gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-[#fbf3dc] text-[#987733]"><Building2 size={14} /></span><div className="min-w-0"><div className="truncate text-[10px] font-semibold text-[#34443b]">{tenant.name}</div><div className="mt-1 truncate text-[9px] text-[#929e96]">{tenant.ownerEmail || tenant.slug}</div></div></div><span className={`status-pill px-2 py-1 text-[8px] ${tenant.status === 'active' ? 'bg-[#edf7f0] text-[#397a58]' : 'bg-[#fff3e8] text-[#a0602b]'}`}>{tenant.status}</span></div>)}</div>}
      </div>

      <div className="rounded-[18px] border border-[#e5ebe7] bg-white p-5"><div className="flex items-center gap-2"><TriangleAlert size={15} className="text-[#a47b2d]" /><h2 className="text-[12px] font-semibold text-[#34443b]">Next platform capabilities</h2></div><p className="mt-1.5 text-[10px] leading-5 text-[#89968e]">Tenant operations, account security, and activity history are available. These platform-wide capabilities are still planned.</p><div className="mt-4 space-y-2">{upcoming.map((item) => { const Icon = item.icon; return <div key={item.title} className="flex gap-3 rounded-xl border border-[#edf1ee] bg-[#fcfdfc] p-3"><span className="mt-0.5 rounded-[9px] bg-[#f2f4ef] p-1.5 text-[#819087]"><Icon size={13} /></span><span><span className="block text-[10px] font-semibold text-[#4b5a51]">{item.title}</span><span className="mt-1 block text-[9px] leading-4 text-[#909c94]">{item.detail}</span></span></div>; })}</div></div>
    </section>

    <div className="flex items-start gap-2.5 rounded-xl border border-[#f1e2ba] bg-[#fff9e9] p-3.5 text-[10px] leading-5 text-[#795d20]"><TriangleAlert size={14} className="mt-0.5 shrink-0" /><span>Platform-wide analytics and live service health are not available yet. Tenant lifecycle actions and searchable audit history are now available.</span></div>
  </div>;
}

function SummaryCard({ icon: Icon, label, value, detail, tone }: { icon: typeof Building2; label: string; value: string; detail: string; tone: 'amber' | 'green' | 'blue' }) {
  const tones = { amber: 'bg-[#fbf3df] text-[#9b7935]', green: 'bg-[#e8f5ed] text-[#327656]', blue: 'bg-[#edf2f8] text-[#54749b]' };
  return <div className="rounded-[16px] border border-[#e5ebe7] bg-white p-4"><div className="flex items-center justify-between"><span className="text-[10px] font-medium text-[#7e8b83]">{label}</span><span className={`rounded-[10px] p-2 ${tones[tone]}`}><Icon size={15} /></span></div><div className="mt-3 text-[20px] font-semibold tracking-[-.04em] text-[#263930]">{value}</div><div className="mt-1 text-[9px] text-[#98a39c]">{detail}</div></div>;
}
