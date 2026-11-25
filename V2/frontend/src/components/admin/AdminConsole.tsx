'use client';

import { FormEvent, useState } from 'react';
import { Building2, CalendarDays, ChevronLeft, ChevronRight, ExternalLink, LoaderCircle, Search, ShieldAlert, UsersRound } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { apiRequest } from '@/lib/api';
import type { TenantSummary } from '@/app/admin/tenants/page';

const PAGE_SIZE = 10;

export function AdminConsole({ initialTenants, initialTotal, initialError }: { initialTenants: TenantSummary[]; initialTotal: number; initialError: string }) {
  const router = useRouter();
  const [tenants, setTenants] = useState(initialTenants);
  const [total, setTotal] = useState(initialTotal);
  const [query, setQuery] = useState('');
  const [activeQuery, setActiveQuery] = useState('');
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState(initialError);
  const [loading, setLoading] = useState(false);
  const [impersonating, setImpersonating] = useState<string | null>(null);

  async function loadTenants(search: string, nextOffset: number) {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(nextOffset) });
      if (search.trim()) params.set('search', search.trim());
      const data = await apiRequest<{ tenants: TenantSummary[]; pagination: { total: number } }>(`super-admin/tenants?${params}`);
      setTenants(data.tenants);
      setTotal(data.pagination.total);
      setActiveQuery(search.trim());
      setOffset(nextOffset);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load tenant workspaces.');
    } finally { setLoading(false); }
  }

  function search(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void loadTenants(query, 0); }

  async function impersonate(tenant: TenantSummary) {
    setError('');
    setImpersonating(tenant.id);
    try {
      await apiRequest(`auth/impersonate/${encodeURIComponent(tenant.id)}`, { method: 'POST', body: '{}' });
      router.replace('/dashboard');
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not open this tenant workspace.');
      setImpersonating(null);
    }
  }

  const first = total === 0 ? 0 : offset + 1;
  const last = Math.min(offset + tenants.length, total);

  return <div className="space-y-6">
    <section className="flex flex-wrap items-end justify-between gap-4"><div><div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.14em] text-[#438267]"><Building2 size={14} /> Platform workspaces</div><h1 className="text-[27px] font-semibold tracking-[-.05em] text-[#1d3027]">Tenant directory</h1><p className="mt-1.5 max-w-2xl text-[12px] leading-5 text-[#849088]">Find a tenant and open its workspace in a scoped support session. Lifecycle management will be enabled when its V2 API is ready.</p></div><div className="rounded-xl border border-[#e5ebe7] bg-white px-4 py-2.5"><div className="text-[9px] font-semibold uppercase tracking-wide text-[#89968e]">Total workspaces</div><div className="mt-1 text-[18px] font-semibold text-[#263930]">{total}</div></div></section>

    {error && <div role="alert" className="flex items-start gap-2.5 rounded-xl border border-[#f0d2cb] bg-[#fff6f3] px-4 py-3 text-[11px] leading-5 text-[#9b4b3c]"><ShieldAlert size={15} className="mt-0.5 shrink-0" />{error}</div>}

    <section className="overflow-hidden rounded-[18px] border border-[#e5ebe7] bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#edf1ee] px-5 py-4 sm:px-6"><div><h2 className="text-[12px] font-semibold text-[#34443b]">All tenant workspaces</h2><p className="mt-1 text-[10px] text-[#98a39c]">Search by tenant name, slug, or owner email.</p></div><form onSubmit={search} className="flex w-full gap-2 sm:w-auto"><label className="relative min-w-0 flex-1 sm:w-[280px]"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#98a39c]" /><input value={query} onChange={(event) => setQuery(event.target.value)} className="field h-10 pl-9 text-[11px]" placeholder="Search tenants" /></label><button disabled={loading} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#24392d] px-3.5 text-[10px] font-semibold text-white hover:bg-[#31523f] disabled:opacity-60">{loading ? <LoaderCircle size={13} className="animate-spin" /> : <Search size={13} />} Search</button></form></div>
      {tenants.length === 0 ? <div className="px-6 py-16 text-center"><Building2 size={24} className="mx-auto text-[#a8b4ac]" /><p className="mt-3 text-[11px] font-semibold text-[#4d5c53]">{activeQuery ? 'No matching tenants' : 'No tenant workspaces yet'}</p><p className="mt-1 text-[9px] text-[#909c94]">{activeQuery ? 'Try another name, slug, or owner email.' : 'Registered workspaces will appear here.'}</p></div> : <>
        <div className="hidden grid-cols-[minmax(220px,1.5fr)_minmax(160px,1fr)_100px_100px_150px] gap-4 border-b border-[#edf1ee] bg-[#fafcfb] px-6 py-3 text-[9px] font-bold uppercase tracking-[.1em] text-[#98a39c] md:grid"><span>Workspace</span><span>Owner</span><span>Members</span><span>Status</span><span className="text-right">Support</span></div>
        <div className="divide-y divide-[#eff2f0]">{tenants.map((tenant) => <div key={tenant.id} className="grid gap-3 px-5 py-4 md:grid-cols-[minmax(220px,1.5fr)_minmax(160px,1fr)_100px_100px_150px] md:items-center md:gap-4 md:px-6"><div className="flex min-w-0 items-center gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-[#fbf3dc] text-[#987733]"><Building2 size={15} /></span><div className="min-w-0"><div className="truncate text-[11px] font-semibold text-[#34443b]">{tenant.name}</div><div className="mt-1 truncate text-[9px] text-[#929e96]">{tenant.slug} · {tenant.tier || 'Standard'}</div></div></div><div className="min-w-0 text-[10px] text-[#68766d]"><span className="mr-2 text-[8px] font-bold uppercase tracking-wide text-[#a0aaa3] md:hidden">Owner</span><span className="truncate">{tenant.ownerEmail || 'No owner listed'}</span></div><div className="text-[10px] text-[#68766d]"><span className="mr-2 text-[8px] font-bold uppercase tracking-wide text-[#a0aaa3] md:hidden">Members</span><span className="inline-flex items-center gap-1.5"><UsersRound size={12} />{tenant.memberCount}</span></div><div><span className={`status-pill px-2 py-1 text-[8px] ${tenant.status === 'active' ? 'bg-[#edf7f0] text-[#397a58]' : 'bg-[#fff3e8] text-[#a0602b]'}`}>{tenant.status}</span></div><div className="flex items-center justify-between gap-2 md:justify-end"><span className="inline-flex items-center gap-1 text-[9px] text-[#929e96]"><CalendarDays size={11} />{new Date(tenant.createdAt).toLocaleDateString()}</span><button onClick={() => void impersonate(tenant)} disabled={impersonating !== null || tenant.status !== 'active'} className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-[#dce7df] bg-white px-2.5 text-[9px] font-semibold text-[#3e7654] hover:bg-[#f2f8f3] disabled:cursor-not-allowed disabled:opacity-50">{impersonating === tenant.id ? <LoaderCircle size={12} className="animate-spin" /> : <ExternalLink size={12} />}Open</button></div></div>)}</div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#edf1ee] bg-[#fcfdfc] px-5 py-3.5 sm:px-6"><span className="text-[9px] text-[#929e96]">Showing {first}–{last} of {total}</span><div className="flex gap-2"><button onClick={() => void loadTenants(activeQuery, Math.max(0, offset - PAGE_SIZE))} disabled={loading || offset === 0} className="inline-flex h-8 items-center gap-1 rounded-lg border border-[#e4eae5] bg-white px-2.5 text-[9px] font-semibold text-[#58685e] disabled:opacity-40"><ChevronLeft size={13} /> Previous</button><button onClick={() => void loadTenants(activeQuery, offset + PAGE_SIZE)} disabled={loading || last >= total} className="inline-flex h-8 items-center gap-1 rounded-lg border border-[#e4eae5] bg-white px-2.5 text-[9px] font-semibold text-[#58685e] disabled:opacity-40">Next <ChevronRight size={13} /></button></div></div>
      </>}
    </section>
    <div className="rounded-xl border border-[#e9e4d4] bg-[#fffdf7] px-4 py-3 text-[10px] leading-5 text-[#83734d]">Tenant onboarding, tier updates, suspension/reactivation, and tenant owner password recovery are planned. They will appear here after their V2 APIs and audit controls are implemented.</div>
  </div>;
}
