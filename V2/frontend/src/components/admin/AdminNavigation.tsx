'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, Building2, CircleGauge, LockKeyhole, ServerCog, ShieldCheck } from 'lucide-react';

const available = [
  { href: '/admin', label: 'Platform overview', icon: CircleGauge, exact: true },
  { href: '/admin/tenants', label: 'Tenant directory', icon: Building2 },
  { href: '/admin/security', label: 'Account security', icon: LockKeyhole },
];
const planned = [
  { label: 'Activity & audit logs', icon: Activity },
  { label: 'System health', icon: ServerCog },
];

export function AdminNavigation() {
  const pathname = usePathname();

  return <>
  <nav aria-label="Platform console navigation" className="flex gap-1 overflow-x-auto border-b border-[#e6ece7] bg-white px-3 py-2 lg:hidden">
    {available.map((item) => {
      const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
      const Icon = item.icon;
      return <Link key={item.href} href={item.href} className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-[10px] font-semibold ${active ? 'bg-[#edf5ef] text-[#286344]' : 'text-[#758279] hover:bg-[#f5f8f5]'}`}><Icon size={13} />{item.label}</Link>;
    })}
  </nav>
  <aside className="sticky top-0 hidden h-screen w-[258px] shrink-0 flex-col bg-[#142f27] px-4 pb-4 pt-5 text-white lg:flex">
    <Link href="/admin" className="flex h-12 items-center gap-3 px-1">
      <span className="flex h-9 w-9 items-center justify-center rounded-[13px] bg-[#f7df9c] text-[#5d4718]"><ShieldCheck size={20} /></span>
      <span><span className="block text-[15px] font-bold tracking-[-.04em]">AuthGuard</span><span className="mt-0.5 block text-[9px] font-bold uppercase tracking-[.16em] text-[#c8b77e]">Platform console</span></span>
    </Link>

    <div className="mt-9 rounded-xl border border-white/[.08] bg-white/[.04] p-3"><div className="text-[9px] font-bold uppercase tracking-[.14em] text-[#839e90]">Current scope</div><div className="mt-2 flex items-center gap-2 text-[11px] font-semibold text-[#ecf4ee]"><span className="h-1.5 w-1.5 rounded-full bg-[#f2d37c]" />Global administration</div></div>

    <div className="mb-2 mt-8 px-2 text-[9px] font-bold uppercase tracking-[.16em] text-[#769487]">Administration</div>
    <nav aria-label="Platform console navigation" className="space-y-1">
      {available.map((item) => {
        const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
        const Icon = item.icon;
        return <Link key={item.href} href={item.href} className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[11px] font-medium transition ${active ? 'bg-[#35483b] text-white shadow-sm' : 'text-[#afc5b9] hover:bg-white/[.06] hover:text-white'}`}>
          <Icon size={15} className={active ? 'text-[#f0d78e]' : 'text-[#89a899] group-hover:text-[#c8f0d5]'} />{item.label}{active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[#f0d78e]" />}
        </Link>;
      })}
    </nav>

    <div className="mb-2 mt-8 px-2 text-[9px] font-bold uppercase tracking-[.16em] text-[#769487]">Observability</div>
    <div className="space-y-1">{planned.map((item) => { const Icon = item.icon; return <div key={item.label} aria-disabled="true" title="Planned for a later V2 milestone" className="flex cursor-not-allowed items-center gap-3 rounded-xl px-3 py-2.5 text-[11px] font-medium text-[#70897c]"><Icon size={15} />{item.label}<span className="ml-auto rounded-full border border-white/[.08] px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-[#80988a]">Planned</span></div>; })}</div>

    <div className="mt-auto rounded-2xl border border-white/[.08] bg-white/[.045] p-3.5"><div className="text-[10px] font-semibold text-[#d9eee0]">V2 console</div><p className="mt-1.5 text-[9px] leading-[1.65] text-[#91ad9d]">Only actions backed by the V2 platform API are enabled.</p></div>
    <div className="px-2 pt-4 text-[9px] text-[#728d7e]">AuthGuard · Platform operations</div>
  </aside>
  </>;
}
