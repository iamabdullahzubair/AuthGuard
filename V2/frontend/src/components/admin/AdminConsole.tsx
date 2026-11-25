'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Building2, Fingerprint, LoaderCircle, ShieldCheck, TriangleAlert } from 'lucide-react';
import { apiRequest, Tenant } from '@/lib/api';

export function AdminConsole({ email }: { email: string }) {
  const router = useRouter();
  const [tenantId, setTenantId] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  async function enterTenant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError('');
    try {
      await apiRequest<{ tenant: Tenant }>(`auth/impersonate/${encodeURIComponent(tenantId.trim())}`, { method: 'POST', body: '{}' });
      router.replace('/dashboard');
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not open this tenant workspace.');
    } finally { setPending(false); }
  }

  return <main className="min-h-screen bg-[#f5f7f4]">
    <header className="flex h-[72px] items-center justify-between border-b border-[#e5ebe7] bg-white px-5 sm:px-10"><div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-[12px] bg-[#dff4e6] text-[#226347]"><ShieldCheck size={19} /></span><div><div className="text-[14px] font-bold tracking-[-.04em] text-[#1a3429]">AuthGuard</div><div className="text-[9px] font-bold uppercase tracking-[.13em] text-[#879a8e]">Platform console</div></div></div><div className="text-right"><div className="text-[10px] font-semibold text-[#35463c]">{email}</div><div className="mt-1 text-[9px] text-[#9aa59e]">Super Admin</div></div></header>

    <div className="mx-auto grid min-h-[calc(100vh-72px)] max-w-[1180px] items-center gap-10 px-5 py-10 lg:grid-cols-[1fr_.85fr] lg:px-10">
      <section><div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#d5e9dc] bg-[#edf7f0] px-3 py-1.5 text-[9px] font-bold uppercase tracking-[.13em] text-[#347555]"><span className="h-1.5 w-1.5 rounded-full bg-[#57a878]" />Restricted platform access</div><h1 className="max-w-[560px] text-[38px] font-semibold leading-[1.1] tracking-[-.055em] text-[#193127] sm:text-[52px]">A clear view across your platform.</h1><p className="mt-5 max-w-[500px] text-[13px] leading-6 text-[#78867e]">Use your administrator access to securely enter a tenant workspace. Leaving the workspace restores your platform session.</p>
        <div className="mt-9 grid gap-3 sm:grid-cols-2"><Feature icon={Fingerprint} title="Scoped sessions" text="Tenant access is tied to this administrator session." /><Feature icon={Building2} title="Tenant isolated" text="Enter a single workspace by its tenant ID." /></div>
        <div className="mt-8 flex items-start gap-2.5 rounded-xl border border-[#f1e2ba] bg-[#fff9e9] p-3.5 text-[10px] leading-5 text-[#795d20]"><TriangleAlert size={15} className="mt-0.5 shrink-0" /><span>All actions inside an impersonated workspace are performed with platform administrator access. Use this only when operationally necessary.</span></div>
      </section>

      <section className="surface-shadow rounded-[24px] border border-white bg-white p-6 sm:p-8">
        <span className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-[#edf6f0] text-[#438267]"><Building2 size={19} /></span><h2 className="mt-5 text-[19px] font-semibold tracking-[-.04em] text-[#21342a]">Open a tenant workspace</h2><p className="mt-2 text-[11px] leading-5 text-[#839087]">Enter the tenant ID you need to inspect. You will see an impersonation banner with a return action.</p>
        {error && <div role="alert" className="mt-5 rounded-xl border border-[#f0d2cb] bg-[#fff6f3] px-3.5 py-3 text-[10px] text-[#9b4b3c]">{error}</div>}
        <form className="mt-6 space-y-4" onSubmit={enterTenant}><div><label className="label" htmlFor="tenant-id">Tenant ID</label><input id="tenant-id" className="field font-mono text-[11px]" value={tenantId} onChange={(event) => setTenantId(event.target.value)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" required /></div><button className="btn-primary h-11 w-full text-[11px]" type="submit" disabled={pending}>{pending ? <LoaderCircle size={15} className="animate-spin" /> : <>Continue to workspace <ArrowRight size={15} /></>}</button></form>
        <p className="mt-4 text-center text-[9px] leading-4 text-[#9aa59e]">The V2 platform API currently supports tenant access by ID. Tenant directory and audit screens will be added when those APIs are available.</p>
      </section>
    </div>
  </main>;
}

function Feature({ icon: Icon, title, text }: { icon: typeof Fingerprint; title: string; text: string }) {
  return <div className="rounded-2xl border border-[#e8eeea] bg-white p-4"><span className="inline-flex rounded-[10px] bg-[#edf6f0] p-2 text-[#438267]"><Icon size={15} /></span><div className="mt-3 text-[11px] font-semibold text-[#39493f]">{title}</div><div className="mt-1 text-[9px] leading-4 text-[#8b9890]">{text}</div></div>;
}
