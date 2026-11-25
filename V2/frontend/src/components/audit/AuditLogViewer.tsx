'use client';

import { FormEvent, useState } from 'react';
import {
  Activity, ArrowLeftRight, Building2, CalendarDays, Check, ChevronDown, ChevronLeft,
  ChevronRight, Eye, KeyRound, LoaderCircle, LogIn, LogOut,
  RotateCcw, Search, Shield, ShieldAlert, UserRoundPlus, UserRoundX,
} from 'lucide-react';
import { ClientDateTime } from '@/components/ClientDateTime';
import { apiRequest } from '@/lib/api';

const PAGE_SIZE = 25;
type AuditLog = {
  id: string;
  tenantId: string | null;
  tenantName: string | null;
  tenantSlug: string | null;
  actorId: string | null;
  actorEmail: string | null;
  actorRole: string | null;
  actorIsSuperAdmin: boolean;
  event: string;
  targetMemberId: string | null;
  targetEmail: string | null;
  sessionId: string | null;
  requestId: string | null;
  impersonatedTenantId: string | null;
  outcome: string;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type AuditLogResult = {
  logs: AuditLog[];
  pagination: { total: number; limit: number; offset: number; hasMore: boolean };
};

type Filters = { search: string; event: string; startDate: string; endDate: string };

const eventOptions = [
  ['AUTH_LOGIN_SUCCEEDED', 'Sign in succeeded'],
  ['AUTH_LOGIN_FAILED', 'Sign in failed'],
  ['AUTH_LOGIN_BLOCKED', 'Sign in blocked'],
  ['AUTH_LOGOUT', 'Signed out'],
  ['AUTH_LOGOUT_ALL', 'Signed out all devices'],
  ['AUTH_PASSWORD_CHANGED', 'Password changed'],
  ['AUTH_SESSION_REVOKED', 'Session revoked'],
  ['TENANT_OWNER_REGISTERED', 'Workspace registered'],
  ['TENANT_MEMBER_CREATED', 'Member added'],
  ['TENANT_MEMBER_ROLE_CHANGED', 'Member role changed'],
  ['TENANT_MEMBER_REMOVED', 'Member removed'],
  ['SUPER_ADMIN_TENANT_CREATED', 'Tenant onboarded'],
  ['SUPER_ADMIN_TENANT_UPDATED', 'Tenant settings changed'],
  ['SUPER_ADMIN_TENANT_OWNER_PASSWORD_RESET', 'Owner password reset'],
  ['SUPER_ADMIN_IMPERSONATION_STARTED', 'Impersonation started'],
  ['SUPER_ADMIN_IMPERSONATION_ENDED', 'Impersonation ended'],
] as const;

function labelFor(event: string) {
  return eventOptions.find(([key]) => key === event)?.[1] || event.toLowerCase().replaceAll('_', ' ');
}

function iconFor(event: string) {
  if (event.includes('LOGIN_SUCCEEDED')) return LogIn;
  if (event.includes('LOGIN_FAILED') || event.includes('BLOCKED')) return ShieldAlert;
  if (event.includes('LOGOUT')) return LogOut;
  if (event.includes('PASSWORD') || event.includes('SESSION')) return KeyRound;
  if (event.includes('IMPERSONATION')) return ArrowLeftRight;
  if (event.includes('MEMBER_CREATED') || event.includes('OWNER_REGISTERED')) return UserRoundPlus;
  if (event.includes('MEMBER_REMOVED')) return UserRoundX;
  if (event.includes('TENANT')) return Building2;
  return Shield;
}

function eventTone(log: AuditLog) {
  if (log.outcome === 'failure') return 'border-[#f3ddd7] bg-[#fff5f2] text-[#a95442]';
  if (log.event.includes('IMPERSONATION')) return 'border-[#f0e5c9] bg-[#fffaf0] text-[#97732c]';
  if (log.event.includes('MEMBER')) return 'border-[#dce8f0] bg-[#f3f8fb] text-[#55778e]';
  return 'border-[#dce9e0] bg-[#f2f8f4] text-[#397253]';
}

function initials(email: string | null, fallback: string | null) {
  const source = email || fallback || '?';
  return source.slice(0, 1).toUpperCase();
}

export function AuditLogViewer({
  scope,
  initialData,
  initialError = '',
}: {
  scope: 'platform' | 'tenant';
  initialData: AuditLogResult | null;
  initialError?: string;
}) {
  const [data, setData] = useState<AuditLogResult | null>(initialData);
  const [filters, setFilters] = useState<Filters>({ search: '', event: '', startDate: '', endDate: '' });
  const [activeFilters, setActiveFilters] = useState<Filters>({ search: '', event: '', startDate: '', endDate: '' });
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(initialError);
  const [expandedLog, setExpandedLog] = useState<string | null>(null);

  async function load(nextFilters: Filters, nextOffset: number) {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(nextOffset) });
      for (const [key, value] of Object.entries(nextFilters)) {
        if (value) params.set(key, value);
      }
      const result = await apiRequest<AuditLogResult>(`audit-logs/${scope}?${params.toString()}`);
      setData(result);
      setOffset(nextOffset);
      setActiveFilters(nextFilters);
      setExpandedLog(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load audit history.');
    } finally {
      setLoading(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void load(filters, 0);
  }

  function clearFilters() {
    const cleared = { search: '', event: '', startDate: '', endDate: '' };
    setFilters(cleared);
    void load(cleared, 0);
  }

  const logs = data?.logs ?? [];
  const total = data?.pagination.total ?? 0;
  const first = total ? offset + 1 : 0;
  const last = Math.min(offset + logs.length, total);
  const hasFilters = Object.values(filters).some(Boolean);

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.14em] text-[#438267]">
            <Activity size={14} /> {scope === 'platform' ? 'Platform observability' : 'Workspace security'}
          </div>
          <h1 className="text-[27px] font-semibold tracking-[-.05em] text-[#1d3027]">Activity &amp; audit logs</h1>
          <p className="mt-1.5 max-w-2xl text-[12px] leading-5 text-[#849088]">
            {scope === 'platform'
              ? 'Review administrator actions, tenant changes, impersonation, and account activity across the platform.'
              : 'Review workspace sign-ins, security changes, and owner-managed team activity.'}
          </p>
        </div>
        <div className="flex items-center gap-3 rounded-2xl border border-[#e5ebe7] bg-white px-4 py-3 shadow-[0_3px_12px_rgba(30,50,42,.025)]">
          <span className="rounded-xl bg-[#edf6f0] p-2.5 text-[#438267]"><Activity size={16} /></span>
          <div><div className="text-[9px] font-semibold uppercase tracking-[.1em] text-[#89968e]">Matching events</div><div className="mt-0.5 text-[18px] font-semibold leading-5 text-[#263930]">{total.toLocaleString('en-IN')}</div></div>
        </div>
      </section>

      {error && <div role="alert" className="flex items-start gap-2.5 rounded-xl border border-[#f0d2cb] bg-[#fff6f3] px-4 py-3 text-[11px] leading-5 text-[#9b4b3c]"><ShieldAlert size={15} className="mt-0.5 shrink-0" />{error}</div>}

      <section className="overflow-hidden rounded-[20px] border border-[#e3eae5] bg-white shadow-[0_8px_28px_rgba(31,53,43,.035)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#edf1ee] px-5 py-4 sm:px-6">
          <div><h2 className="text-[12px] font-semibold text-[#34443b]">Event history</h2><p className="mt-1 text-[10px] text-[#98a39c]">Newest activity appears first.</p></div>
          <span className="rounded-full border border-[#e5ebe7] bg-[#fafcfb] px-2.5 py-1 text-[9px] font-semibold text-[#79877f]">{scope === 'platform' ? 'All workspaces' : 'This workspace only'}</span>
        </div>

        <form onSubmit={submit} className="grid gap-3 border-b border-[#edf1ee] bg-[#fafcfb] p-4 sm:grid-cols-2 xl:grid-cols-[minmax(220px,1fr)_minmax(190px,.85fr)_155px_155px_auto] xl:items-end xl:px-6">
          <label className="text-[9px] font-bold uppercase tracking-[.1em] text-[#89968e]">Search activity
            <span className="relative mt-1 block"><Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9ba79f]" /><input value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} placeholder="Actor, tenant, or target" className="field h-10 pl-9 text-[10px] normal-case tracking-normal" /></span>
          </label>
          <label className="text-[9px] font-bold uppercase tracking-[.1em] text-[#89968e]">Activity type
            <select value={filters.event} onChange={(event) => setFilters({ ...filters, event: event.target.value })} className="field select-field mt-1 h-10 px-3 pr-9 text-[10px] normal-case tracking-normal"><option value="">All activity</option>{eventOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          </label>
          <label className="text-[9px] font-bold uppercase tracking-[.1em] text-[#89968e]">From date<input type="date" value={filters.startDate} onChange={(event) => setFilters({ ...filters, startDate: event.target.value })} className="field mt-1 h-10 text-[10px] normal-case tracking-normal" /></label>
          <label className="text-[9px] font-bold uppercase tracking-[.1em] text-[#89968e]">To date<input type="date" value={filters.endDate} onChange={(event) => setFilters({ ...filters, endDate: event.target.value })} className="field mt-1 h-10 text-[10px] normal-case tracking-normal" /></label>
          <div className="flex items-center gap-2">
            <button disabled={loading} className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-[#24392d] px-4 text-[10px] font-semibold text-white transition hover:bg-[#31523f] disabled:opacity-60 xl:flex-none">{loading ? <LoaderCircle size={13} className="animate-spin" /> : <Search size={13} />}Apply</button>
            {hasFilters && <button type="button" onClick={clearFilters} title="Clear filters" className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[#e1e8e3] bg-white text-[#708077] hover:bg-[#f3f7f4]"><RotateCcw size={14} /></button>}
          </div>
        </form>

        {!data && !loading ? (
          <EmptyState title="Audit history unavailable" detail="Check the API connection and database migration, then reload." />
        ) : logs.length === 0 ? (
          <EmptyState title="No matching activity" detail="Try another search or date range." />
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[960px] border-collapse text-left">
                <thead><tr className="border-b border-[#edf1ee] bg-white text-[9px] font-bold uppercase tracking-[.11em] text-[#9aa69f]"><th className="w-[205px] px-6 py-3.5">Date &amp; time</th><th className="w-[225px] px-4 py-3.5">Activity</th><th className="min-w-[200px] px-4 py-3.5">Performed by</th><th className="min-w-[190px] px-4 py-3.5">Target</th>{scope === 'platform' && <th className="min-w-[170px] px-4 py-3.5">Workspace</th>}<th className="w-[110px] px-5 py-3.5 text-right">Details</th></tr></thead>
                <tbody className="divide-y divide-[#eff2f0]">
                  {logs.map((log) => {
                    const Icon = iconFor(log.event);
                    const expanded = expandedLog === log.id;
                    return <AuditRow key={log.id} log={log} scope={scope} Icon={Icon} expanded={expanded} onToggle={() => setExpandedLog(expanded ? null : log.id)} />;
                  })}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-[#edf1ee] md:hidden">
              {logs.map((log) => {
                const Icon = iconFor(log.event);
                const expanded = expandedLog === log.id;
                return <article key={log.id} className="px-4 py-4">
                  <div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-start gap-3"><span className={`mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${eventTone(log)}`}><Icon size={15} /></span><div className="min-w-0"><div className="text-[11px] font-semibold capitalize text-[#34443b]">{labelFor(log.event)}</div><div className="mt-1 truncate text-[9px] text-[#89968e]">{log.actorEmail || log.actorId || 'Unknown actor'}</div></div></div><OutcomeBadge outcome={log.outcome} /></div>
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 pl-12 text-[9px] text-[#839087]"><span className="inline-flex items-center gap-1"><CalendarDays size={11} /><ClientDateTime value={log.createdAt} /></span>{scope === 'platform' && <span className="inline-flex items-center gap-1"><Building2 size={11} />{log.tenantName || 'Platform'}</span>}</div>
                  {(log.targetEmail || log.impersonatedTenantId) && <div className="mt-2 pl-12 text-[9px] text-[#718077]">{log.targetEmail && <span>Target: {log.targetEmail}</span>}{log.targetEmail && log.impersonatedTenantId && <span> · </span>}{log.impersonatedTenantId && <span>Impersonation session</span>}</div>}
                  <div className="mt-3 pl-12"><DetailsButton expanded={expanded} onClick={() => setExpandedLog(expanded ? null : log.id)} /></div>
                  {expanded && <EventDetails log={log} />}
                </article>;
              })}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#edf1ee] bg-[#fafcfb] px-5 py-3.5 sm:px-6"><span className="text-[10px] text-[#849088]">Showing <strong className="font-semibold text-[#56665c]">{first}–{last}</strong> of {total.toLocaleString('en-IN')} events</span><div className="flex gap-2"><button onClick={() => void load(activeFilters, Math.max(0, offset - PAGE_SIZE))} disabled={loading || offset === 0} className="inline-flex h-9 items-center gap-1 rounded-lg border border-[#e1e8e3] bg-white px-3 text-[9px] font-semibold text-[#58685e] transition hover:bg-[#f5f8f6] disabled:opacity-40"><ChevronLeft size={13} />Previous</button><button onClick={() => void load(activeFilters, offset + PAGE_SIZE)} disabled={loading || !data?.pagination.hasMore} className="inline-flex h-9 items-center gap-1 rounded-lg border border-[#e1e8e3] bg-white px-3 text-[9px] font-semibold text-[#58685e] transition hover:bg-[#f5f8f6] disabled:opacity-40">Next<ChevronRight size={13} /></button></div></div>
          </>
        )}
      </section>

      <p className="text-[9px] leading-5 text-[#929e96]">Audit events capture completed account and management actions. Passwords and authentication tokens are never included in event details.</p>
    </div>
  );
}

function AuditRow({ log, scope, Icon, expanded, onToggle }: { log: AuditLog; scope: 'platform' | 'tenant'; Icon: typeof Shield; expanded: boolean; onToggle: () => void }) {
  return <>
    <tr className="group transition-colors hover:bg-[#fbfdfb]">
      <td className="whitespace-nowrap px-6 py-4 align-top text-[10px] text-[#64736a]"><ClientDateTime value={log.createdAt} /></td>
      <td className="px-4 py-4 align-top"><div className="flex items-center gap-2.5"><span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border ${eventTone(log)}`}><Icon size={14} /></span><div className="min-w-0"><div className="text-[10px] font-semibold capitalize leading-4 text-[#34443b]">{labelFor(log.event)}</div><div className="mt-0.5 max-w-[150px] truncate font-mono text-[8px] text-[#a0aaa4]" title={log.event}>{log.event}</div></div></div></td>
      <td className="px-4 py-4 align-top"><ActorIdentity email={log.actorEmail} id={log.actorId} role={log.actorRole} superAdmin={log.actorIsSuperAdmin} /></td>
      <td className="px-4 py-4 align-top">{log.targetEmail ? <ActorIdentity email={log.targetEmail} id={log.targetMemberId} role={null} superAdmin={false} target /> : <span className="text-[9px] text-[#b0b9b3]">—</span>}</td>
      {scope === 'platform' && <td className="px-4 py-4 align-top">{log.tenantName ? <div className="flex items-start gap-2"><span className="mt-0.5 rounded-lg bg-[#f7f4e9] p-1.5 text-[#987733]"><Building2 size={12} /></span><div className="min-w-0"><div className="max-w-[145px] truncate text-[10px] font-semibold text-[#506057]">{log.tenantName}</div><div className="mt-0.5 truncate text-[9px] text-[#9aa69f]">{log.tenantSlug}</div>{log.impersonatedTenantId && <div className="mt-1 inline-flex rounded-full bg-[#fff8e7] px-1.5 py-0.5 text-[8px] font-semibold text-[#92712f]">Impersonated</div>}</div></div> : <span className="rounded-full bg-[#f3f5f3] px-2 py-1 text-[8px] font-semibold text-[#839087]">Platform</span>}</td>}
      <td className="px-5 py-4 align-top text-right"><div className="inline-flex flex-col items-end gap-2"><OutcomeBadge outcome={log.outcome} /><DetailsButton expanded={expanded} onClick={onToggle} /></div></td>
    </tr>
    {expanded && <tr className="bg-[#fafcfb]"><td colSpan={scope === 'platform' ? 6 : 5} className="px-6 pb-4 pt-0"><EventDetails log={log} /></td></tr>}
  </>;
}

function ActorIdentity({ email, id, role, superAdmin, target = false }: { email: string | null; id: string | null; role: string | null; superAdmin: boolean; target?: boolean }) {
  return <div className="flex min-w-0 items-center gap-2.5"><span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${target ? 'bg-[#f0f2f0] text-[#7c8981]' : superAdmin ? 'bg-[#f8f0d9] text-[#8a6c26]' : 'bg-[#e8f3eb] text-[#347653]'}`}><span>{superAdmin ? <Shield size={12} /> : target ? <Eye size={12} /> : initials(email, id)}</span></span><div className="min-w-0"><div className="max-w-[175px] truncate text-[10px] font-semibold text-[#435249]" title={email || id || 'Unknown actor'}>{email || id || 'Unknown actor'}</div><div className="mt-0.5 text-[8px] capitalize text-[#9aa69f]">{target ? 'Affected account' : superAdmin ? 'Super Admin' : role || 'Member'}</div></div></div>;
}

function OutcomeBadge({ outcome }: { outcome: string }) {
  const failed = outcome === 'failure';
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[8px] font-bold uppercase tracking-[.06em] ${failed ? 'bg-[#fff0ec] text-[#a75341]' : 'bg-[#eef7f0] text-[#397452]'}`}>{failed ? <ShieldAlert size={10} /> : <Check size={10} />}{failed ? 'Failed' : 'Success'}</span>;
}

function DetailsButton({ expanded, onClick }: { expanded: boolean; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[8px] font-semibold text-[#678171] transition hover:bg-[#edf5ef] hover:text-[#286344]" aria-expanded={expanded}><span>{expanded ? 'Hide' : 'Details'}</span><ChevronDown size={11} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} /></button>;
}

function EventDetails({ log }: { log: AuditLog }) {
  return <div className="mt-3 rounded-xl border border-[#e8eeea] bg-white p-3 sm:p-4"><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><DetailItem label="IP address" value={log.ipAddress || 'Not recorded'} /><DetailItem label="Session" value={log.sessionId || 'Not recorded'} mono /><DetailItem label="Request ID" value={log.requestId || 'Not recorded'} mono /><DetailItem label="Tenant ID" value={log.tenantId || 'Platform event'} mono /></div>{Object.keys(log.metadata || {}).length > 0 && <div className="mt-4 border-t border-[#edf1ee] pt-3"><div className="mb-2 text-[8px] font-bold uppercase tracking-[.1em] text-[#9aa69f]">Event data</div><pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-[#f8faf8] p-3 text-[9px] leading-5 text-[#64736a]">{JSON.stringify(log.metadata, null, 2)}</pre></div>}</div>;
}

function DetailItem({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div className="min-w-0"><div className="text-[8px] font-bold uppercase tracking-[.09em] text-[#a0aaa4]">{label}</div><div className={`mt-1 truncate text-[9px] text-[#64736a] ${mono ? 'font-mono' : ''}`} title={value}>{value}</div></div>;
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return <div className="px-6 py-16 text-center"><span className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-[#edf6f0] text-[#438267]"><Activity size={20} /></span><p className="mt-3 text-[11px] font-semibold text-[#4d5c53]">{title}</p><p className="mt-1 text-[9px] text-[#909c94]">{detail}</p></div>;
}
