'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Activity, KeyRound, LayoutDashboard, Menu, ShieldCheck, UsersRound, X } from 'lucide-react';
import { AccountActions } from './AccountActions';

const items = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard, exact: true },
  { href: '/dashboard/team', label: 'Team members', icon: UsersRound },
  { href: '/dashboard/activity', label: 'Activity & audit logs', icon: Activity },
  { href: '/dashboard/security', label: 'Security & sessions', icon: KeyRound },
];

export function Navigation({ workspace, owner }: { workspace: string; owner: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const visibleItems = owner ? items : items.filter((item) => !['/dashboard/team', '/dashboard/activity'].includes(item.href));

  const links = visibleItems.map((item) => {
    const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
    const Icon = item.icon;
    return (
      <Link key={item.href} href={item.href} onClick={() => setOpen(false)} className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[12px] font-medium transition ${active ? 'bg-[#214a3d] text-white shadow-sm' : 'text-[#afc5b9] hover:bg-white/[.06] hover:text-white'}`}>
        <Icon size={16} className={active ? 'text-[#a8edbf]' : 'text-[#89a899] group-hover:text-[#c8f0d5]'} />
        {item.label}
        {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[#a8edbf]" />}
      </Link>
    );
  });

  return <>
    <button className="fixed left-4 top-4 z-40 flex h-10 w-10 items-center justify-center rounded-xl border border-[#e1e9e3] bg-white text-[#244337] shadow-sm lg:hidden" onClick={() => setOpen(true)} aria-label="Open navigation"><Menu size={19} /></button>
    {open && <button className="fixed inset-0 z-40 bg-[#0c1b16]/50 backdrop-blur-[2px] lg:hidden" onClick={() => setOpen(false)} aria-label="Close navigation backdrop" />}
    <aside className={`fixed inset-y-0 left-0 z-50 flex w-[258px] flex-col bg-[#142f27] px-4 pb-4 pt-5 text-white transition-transform duration-200 lg:sticky lg:top-0 lg:z-auto lg:h-screen lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="flex h-12 items-center justify-between px-1">
        <Link href="/dashboard" className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-[13px] bg-[#b9f3cf] text-[#124d3c]"><ShieldCheck size={20} /></span>
          <span><span className="block text-[15px] font-bold tracking-[-.04em]">AuthGuard</span><span className="mt-0.5 block text-[9px] font-bold uppercase tracking-[.16em] text-[#86b29b]">Control room</span></span>
        </Link>
        <button className="rounded-lg p-1.5 text-[#a7c0b3] hover:bg-white/10 lg:hidden" onClick={() => setOpen(false)} aria-label="Close navigation"><X size={17} /></button>
      </div>

      <div className="mt-9 px-2">
        <div className="mb-2 text-[9px] font-bold uppercase tracking-[.16em] text-[#769487]">Workspace</div>
        <div className="flex items-center gap-3 rounded-xl border border-white/[.08] bg-white/[.04] p-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-[#d9f7e3] text-[11px] font-bold text-[#18543f]">{workspace.slice(0, 1).toUpperCase()}</div>
          <div className="min-w-0"><div className="truncate text-[11px] font-semibold text-[#f1f7f2]">{workspace}</div><div className="mt-0.5 text-[9px] text-[#94b2a2]">Tenant workspace</div></div>
        </div>
      </div>

      <nav aria-label="Main navigation" className="mt-8 space-y-1">{links}</nav>

      <AccountActions className="mt-auto h-10 w-full justify-start border-transparent bg-transparent px-3 text-[#afc5b9] hover:border-transparent hover:bg-white/[.06] hover:text-white" />
      <div className="px-2 pt-4 text-[9px] text-[#728d7e]">AuthGuard · Secure access</div>
    </aside>
  </>;
}
