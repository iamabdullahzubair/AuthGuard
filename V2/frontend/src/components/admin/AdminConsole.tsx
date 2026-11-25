'use client';

import { FormEvent, useState } from 'react';
import { Building2, CalendarDays, ChevronLeft, ChevronRight, Copy, ExternalLink, KeyRound, LoaderCircle, Plus, Search, ShieldAlert, UsersRound } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { apiRequest } from '@/lib/api';
import type { TenantSummary } from '@/app/admin/tenants/page';

const PAGE_SIZE = 10;
type Tier = 'developer' | 'pro' | 'enterprise';
type TenantDraft = { name: string; slug: string; ownerEmail: string; initialPassword: string; tier: Tier };
const emptyDraft: TenantDraft = { name: '', slug: '', ownerEmail: '', initialPassword: '', tier: 'enterprise' };

function makePassword() {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%&*';
  const bytes = new Uint8Array(20);
  window.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
}

export function AdminConsole({ initialTenants, initialTotal, initialError }: { initialTenants: TenantSummary[]; initialTotal: number; initialError: string }) {
  const router = useRouter();
  const [tenants, setTenants] = useState(initialTenants);
  const [total, setTotal] = useState(initialTotal);
  const [query, setQuery] = useState('');
  const [activeQuery, setActiveQuery] = useState('');
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState(initialError);
  const [loading, setLoading] = useState(false);
  const [busyTenant, setBusyTenant] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [draft, setDraft] = useState<TenantDraft>(emptyDraft);
  const [slugEdited, setSlugEdited] = useState(false);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<{ name: string; slug: string; ownerEmail: string; tier: string; initialPassword: string } | null>(null);
  const [formError, setFormError] = useState('');
  const [resetTarget, setResetTarget] = useState<TenantSummary | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetting, setResetting] = useState(false);
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);

  async function loadTenants(search: string, nextOffset: number) {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(nextOffset) });
      if (search.trim()) params.set('search', search.trim());
      const data = await apiRequest<{ tenants: TenantSummary[]; pagination: { total: number } }>(`super-admin/tenants?${params}`);
      setTenants(data.tenants); setTotal(data.pagination.total); setActiveQuery(search.trim()); setOffset(nextOffset);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load tenant workspaces.'); }
    finally { setLoading(false); }
  }

  function search(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void loadTenants(query, 0); }

  async function impersonate(tenant: TenantSummary) {
    setError(''); setBusyTenant(tenant.id);
    try { await apiRequest(`auth/impersonate/${encodeURIComponent(tenant.id)}`, { method: 'POST', body: '{}' }); router.replace('/dashboard'); router.refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not open this tenant workspace.'); setBusyTenant(null); }
  }

  async function updateTenant(tenant: TenantSummary, changes: { status?: string; tier?: string }) {
    if (changes.status && !window.confirm(`${changes.status === 'suspended' ? 'Suspend' : 'Reactivate'} “${tenant.name}”? ${changes.status === 'suspended' ? 'Tenant members and tenant API access will be blocked.' : 'Tenant members can sign in again.'}`)) return;
    setError(''); setBusyTenant(tenant.id);
    try { await apiRequest(`super-admin/tenants/${encodeURIComponent(tenant.id)}`, { method: 'PATCH', body: JSON.stringify(changes) }); await loadTenants(activeQuery, offset); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not update tenant.'); }
    finally { setBusyTenant(null); }
  }

  function setName(value: string) {
    setDraft((current) => ({ ...current, name: value, slug: slugEdited ? current.slug : value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) }));
  }

  async function createTenant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setCreating(true); setFormError('');
    try {
      await apiRequest('super-admin/tenants', { method: 'POST', body: JSON.stringify(draft) });
      setCreated({ name: draft.name.trim(), slug: draft.slug, ownerEmail: draft.ownerEmail.trim(), tier: draft.tier, initialPassword: draft.initialPassword });
      setDraft(emptyDraft); setSlugEdited(false); await loadTenants(activeQuery, 0);
    } catch (cause) { setFormError(cause instanceof Error ? cause.message : 'Could not onboard tenant.'); }
    finally { setCreating(false); }
  }

  async function resetOwnerPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!resetTarget) return;
    setResetting(true); setFormError('');
    try {
      const result = await apiRequest<{ ownerEmail: string }>(`super-admin/tenants/${encodeURIComponent(resetTarget.id)}/reset-owner-password`, { method: 'POST', body: JSON.stringify({ newPassword: resetPassword }) });
      setResetTarget({ ...resetTarget, ownerEmail: result.ownerEmail }); setCreated({ name: resetTarget.name, slug: resetTarget.slug, ownerEmail: result.ownerEmail, tier: resetTarget.tier || 'developer', initialPassword: resetPassword });
      setResetTarget(null); setResetPassword(''); setShowCreate(true);
    } catch (cause) { setFormError(cause instanceof Error ? cause.message : 'Could not reset tenant owner password.'); }
    finally { setResetting(false); }
  }

  async function copyLoginLink(slug: string) {
    await navigator.clipboard.writeText(`${window.location.origin}/login?tenant=${encodeURIComponent(slug)}`);
    setCopiedSlug(slug); window.setTimeout(() => setCopiedSlug(null), 1800);
  }

  const first = total === 0 ? 0 : offset + 1;
  const last = Math.min(offset + tenants.length, total);

  return <div className="space-y-6">
    <section className="flex flex-wrap items-end justify-between gap-4"><div><div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.14em] text-[#438267]"><Building2 size={14} /> Platform workspaces</div><h1 className="text-[27px] font-semibold tracking-[-.05em] text-[#1d3027]">Tenant directory</h1><p className="mt-1.5 max-w-2xl text-[12px] leading-5 text-[#849088]">Onboard tenants, manage service tier and access, recover owner accounts, or open a scoped support session.</p></div><div className="flex items-center gap-3"><div className="rounded-xl border border-[#e5ebe7] bg-white px-4 py-2.5"><div className="text-[9px] font-semibold uppercase tracking-wide text-[#89968e]">Total workspaces</div><div className="mt-1 text-[18px] font-semibold text-[#263930]">{total}</div></div><button onClick={() => { setCreated(null); setFormError(''); setDraft({ ...emptyDraft, initialPassword: makePassword() }); setShowCreate(true); }} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#24392d] px-4 text-[10px] font-semibold text-white hover:bg-[#31523f]"><Plus size={14} /> Onboard tenant</button></div></section>

    {error && <div role="alert" className="flex items-start gap-2.5 rounded-xl border border-[#f0d2cb] bg-[#fff6f3] px-4 py-3 text-[11px] leading-5 text-[#9b4b3c]"><ShieldAlert size={15} className="mt-0.5 shrink-0" />{error}</div>}

    <section className="overflow-hidden rounded-[18px] border border-[#e5ebe7] bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#edf1ee] px-5 py-4 sm:px-6"><div><h2 className="text-[12px] font-semibold text-[#34443b]">All tenant workspaces</h2><p className="mt-1 text-[10px] text-[#98a39c]">Search by tenant name, slug, or owner email.</p></div><form onSubmit={search} className="flex w-full gap-2 sm:w-auto"><label className="relative min-w-0 flex-1 sm:w-[280px]"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#98a39c]" /><input value={query} onChange={(event) => setQuery(event.target.value)} className="field h-10 pl-9 text-[11px]" placeholder="Search tenants" /></label><button disabled={loading} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#24392d] px-3.5 text-[10px] font-semibold text-white hover:bg-[#31523f] disabled:opacity-60">{loading ? <LoaderCircle size={13} className="animate-spin" /> : <Search size={13} />} Search</button></form></div>
      {tenants.length === 0 ? <div className="px-6 py-16 text-center"><Building2 size={24} className="mx-auto text-[#a8b4ac]" /><p className="mt-3 text-[11px] font-semibold text-[#4d5c53]">{activeQuery ? 'No matching tenants' : 'No tenant workspaces yet'}</p><p className="mt-1 text-[9px] text-[#909c94]">{activeQuery ? 'Try another name, slug, or owner email.' : 'Onboard a tenant to get started.'}</p></div> : <>
      <div className="hidden grid-cols-[minmax(190px,1.3fr)_minmax(150px,1fr)_70px_105px_130px_minmax(300px,1.5fr)] gap-3 border-b border-[#edf1ee] bg-[#fafcfb] px-6 py-3 text-[9px] font-bold uppercase tracking-[.1em] text-[#98a39c] xl:grid"><span>Workspace</span><span>Owner</span><span>Team</span><span>Status</span><span>Tier</span><span className="text-right">Management</span></div>
        <div className="divide-y divide-[#eff2f0]">{tenants.map((tenant) => <div key={tenant.id} className="grid gap-3 px-5 py-4 xl:grid-cols-[minmax(190px,1.3fr)_minmax(150px,1fr)_70px_105px_130px_minmax(300px,1.5fr)] xl:items-center xl:gap-3 xl:px-6"><div className="flex min-w-0 items-center gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-[#fbf3dc] text-[#987733]"><Building2 size={15} /></span><div className="min-w-0"><div className="truncate text-[11px] font-semibold text-[#34443b]">{tenant.name}</div><button title="Copy workspace login link" onClick={() => void copyLoginLink(tenant.slug)} className="mt-1 inline-flex max-w-full items-center gap-1 truncate text-[9px] text-[#929e96] hover:text-[#3e7654]">{tenant.slug} {copiedSlug === tenant.slug ? <span>Copied</span> : <Copy size={10} />}</button></div></div><div className="min-w-0 text-[10px] text-[#68766d]"><span className="mr-2 text-[8px] font-bold uppercase tracking-wide text-[#a0aaa3] xl:hidden">Owner</span>{tenant.ownerEmail || 'No owner listed'}</div><div className="text-[10px] text-[#68766d]"><span className="mr-2 text-[8px] font-bold uppercase tracking-wide text-[#a0aaa3] xl:hidden">Members</span><span className="inline-flex items-center gap-1.5"><UsersRound size={12} />{tenant.memberCount}</span></div><div><span className={`status-pill px-2 py-1 text-[8px] ${tenant.status === 'active' ? 'bg-[#edf7f0] text-[#397a58]' : 'bg-[#fff3e8] text-[#a0602b]'}`}>{tenant.status}</span></div><div><label className="sr-only" htmlFor={`tier-${tenant.id}`}>Service tier for {tenant.name}</label><select id={`tier-${tenant.id}`} value={(tenant.tier || 'developer') as Tier} disabled={busyTenant === tenant.id} onChange={(event) => void updateTenant(tenant, { tier: event.target.value })} className="field h-8 px-2 text-[9px] capitalize"><option value="developer">Developer</option><option value="pro">Pro</option><option value="enterprise">Enterprise</option></select></div><div className="flex flex-wrap items-center justify-start gap-1.5 xl:justify-end"><span className="mr-1 inline-flex items-center gap-1 text-[9px] text-[#929e96]"><CalendarDays size={11} />{new Date(tenant.createdAt).toLocaleDateString()}</span><button onClick={() => void impersonate(tenant)} disabled={busyTenant !== null || tenant.status !== 'active'} className="inline-flex h-8 items-center gap-1 rounded-lg border border-[#dce7df] bg-white px-2 text-[9px] font-semibold text-[#3e7654] hover:bg-[#f2f8f3] disabled:opacity-50">{busyTenant === tenant.id ? <LoaderCircle size={11} className="animate-spin" /> : <ExternalLink size={11} />}Open</button><button onClick={() => { setFormError(''); setResetTarget(tenant); setResetPassword(makePassword()); }} disabled={busyTenant !== null || !tenant.ownerEmail} className="inline-flex h-8 items-center gap-1 rounded-lg border border-[#e4eae5] bg-white px-2 text-[9px] font-semibold text-[#58685e] hover:bg-[#f7faf8] disabled:opacity-50"><KeyRound size={11} />Reset owner</button><button onClick={() => void updateTenant(tenant, { status: tenant.status === 'active' ? 'suspended' : 'active' })} disabled={busyTenant !== null} className={`inline-flex h-8 items-center rounded-lg border px-2 text-[9px] font-semibold disabled:opacity-50 ${tenant.status === 'active' ? 'border-[#efd7cf] text-[#a45a48] hover:bg-[#fff6f3]' : 'border-[#dce7df] text-[#3e7654] hover:bg-[#f2f8f3]'}`}>{tenant.status === 'active' ? 'Suspend' : 'Reactivate'}</button></div></div>)}</div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#edf1ee] bg-[#fcfdfc] px-5 py-3.5 sm:px-6"><span className="text-[9px] text-[#929e96]">Showing {first}–{last} of {total}</span><div className="flex gap-2"><button onClick={() => void loadTenants(activeQuery, Math.max(0, offset - PAGE_SIZE))} disabled={loading || offset === 0} className="inline-flex h-8 items-center gap-1 rounded-lg border border-[#e4eae5] bg-white px-2.5 text-[9px] font-semibold text-[#58685e] disabled:opacity-40"><ChevronLeft size={13} /> Previous</button><button onClick={() => void loadTenants(activeQuery, offset + PAGE_SIZE)} disabled={loading || last >= total} className="inline-flex h-8 items-center gap-1 rounded-lg border border-[#e4eae5] bg-white px-2.5 text-[9px] font-semibold text-[#58685e] disabled:opacity-40">Next <ChevronRight size={13} /></button></div></div>
      </>}
    </section>

    {showCreate && <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[#15231b]/45 p-4"><section role="dialog" aria-modal="true" aria-labelledby="tenant-dialog-title" className="my-auto w-full max-w-lg rounded-2xl border border-[#e5ebe7] bg-white p-6 shadow-2xl"><div className="flex items-start justify-between"><div><h2 id="tenant-dialog-title" className="text-[17px] font-semibold text-[#24392d]">{created ? 'Tenant credentials' : 'Onboard tenant'}</h2><p className="mt-1 text-[11px] text-[#849088]">{created ? 'Share these one time with the tenant owner.' : 'Create a workspace and owner account.'}</p></div><button onClick={() => { setShowCreate(false); setCreated(null); }} className="rounded-lg px-2 py-1 text-sm text-[#849088] hover:bg-[#f5f8f6]">Close</button></div>
      {created ? <div className="mt-5 space-y-3"><div className="rounded-xl border border-[#dce7df] bg-[#f6faf7] p-4 text-[11px] leading-6 text-[#34443b]"><div><b>Workspace:</b> {created.name} ({created.tier})</div><div><b>Owner:</b> {created.ownerEmail}</div><div className="break-all"><b>Temporary password:</b> <code className="select-all">{created.initialPassword}</code></div><div><b>Login:</b> {typeof window !== 'undefined' ? `${window.location.origin}/login?tenant=${created.slug}` : `/login?tenant=${created.slug}`}</div><p className="mt-2 text-[10px] text-[#63766a]">The owner must choose a new password at first sign in. A password reset also signs out all of the owner’s existing sessions.</p></div><div className="flex justify-end"><button onClick={() => { setShowCreate(false); setCreated(null); }} className="h-9 rounded-lg bg-[#24392d] px-4 text-[10px] font-semibold text-white">Done</button></div></div> : <form onSubmit={createTenant} className="mt-5 space-y-3">
        {formError && <div role="alert" className="rounded-lg bg-[#fff6f3] px-3 py-2 text-[10px] text-[#9b4b3c]">{formError}</div>}
        <label className="block text-[10px] font-semibold text-[#58685e]">Company name<input required minLength={2} maxLength={120} value={draft.name} onChange={(event) => setName(event.target.value)} className="field mt-1 h-10 text-[11px]" /></label>
        <label className="block text-[10px] font-semibold text-[#58685e]">Tenant slug<input required minLength={1} maxLength={48} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value={draft.slug} onChange={(event) => { setSlugEdited(true); setDraft({ ...draft, slug: event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }); }} className="field mt-1 h-10 font-mono text-[11px]" /></label>
        <label className="block text-[10px] font-semibold text-[#58685e]">Owner email<input required type="email" maxLength={254} value={draft.ownerEmail} onChange={(event) => setDraft({ ...draft, ownerEmail: event.target.value })} className="field mt-1 h-10 text-[11px]" /></label>
        <label className="block text-[10px] font-semibold text-[#58685e]">Initial tier<select value={draft.tier} onChange={(event) => setDraft({ ...draft, tier: event.target.value as Tier })} className="field mt-1 h-10 text-[11px]"><option value="developer">Developer</option><option value="pro">Pro</option><option value="enterprise">Enterprise</option></select></label>
        <label className="block text-[10px] font-semibold text-[#58685e]">Temporary owner password<input required minLength={12} maxLength={128} value={draft.initialPassword} onChange={(event) => setDraft({ ...draft, initialPassword: event.target.value })} className="field mt-1 h-10 font-mono text-[11px]" /><button type="button" onClick={() => setDraft({ ...draft, initialPassword: makePassword() })} className="mt-1 text-[9px] font-semibold text-[#3e7654]">Generate strong password</button></label>
        <p className="text-[10px] leading-5 text-[#849088]">The owner will be required to change this password at first sign in. Credentials are shown once after creation.</p>
        <div className="flex justify-end gap-2 border-t border-[#edf1ee] pt-3"><button type="button" onClick={() => setShowCreate(false)} className="h-9 rounded-lg px-3 text-[10px] font-semibold text-[#68766d]">Cancel</button><button disabled={creating} className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#24392d] px-4 text-[10px] font-semibold text-white disabled:opacity-60">{creating && <LoaderCircle size={12} className="animate-spin" />}Create tenant</button></div>
      </form>}</section></div>}

    {resetTarget && <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#15231b]/45 p-4"><section role="dialog" aria-modal="true" aria-labelledby="reset-dialog-title" className="w-full max-w-md rounded-2xl border border-[#e5ebe7] bg-white p-6 shadow-2xl"><h2 id="reset-dialog-title" className="text-[17px] font-semibold text-[#24392d]">Reset owner password</h2><p className="mt-1 text-[11px] leading-5 text-[#849088]">Set a temporary password for {resetTarget.ownerEmail}. Their current sessions will end, and the owner must change the password at next sign in.</p><form onSubmit={resetOwnerPassword} className="mt-5 space-y-3">{formError && <div role="alert" className="rounded-lg bg-[#fff6f3] px-3 py-2 text-[10px] text-[#9b4b3c]">{formError}</div>}<label className="block text-[10px] font-semibold text-[#58685e]">Temporary password<input required minLength={12} maxLength={128} value={resetPassword} onChange={(event) => setResetPassword(event.target.value)} className="field mt-1 h-10 font-mono text-[11px]" /><button type="button" onClick={() => setResetPassword(makePassword())} className="mt-1 text-[9px] font-semibold text-[#3e7654]">Generate strong password</button></label><div className="flex justify-end gap-2 border-t border-[#edf1ee] pt-3"><button type="button" onClick={() => setResetTarget(null)} className="h-9 rounded-lg px-3 text-[10px] font-semibold text-[#68766d]">Cancel</button><button disabled={resetting} className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#24392d] px-4 text-[10px] font-semibold text-white disabled:opacity-60">{resetting && <LoaderCircle size={12} className="animate-spin" />}Set password</button></div></form></section></div>}
  </div>;
}
