'use client';

import { FormEvent, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Building2, Eye, EyeOff, Globe2, LoaderCircle, LockKeyhole, Mail } from 'lucide-react';
import { apiRequest, AuthProfile } from '@/lib/api';

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
}

export function RegisterForm() {
  const router = useRouter();
  const [companyName, setCompanyName] = useState('');
  const [slug, setSlug] = useState('');
  const [customSlug, setCustomSlug] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const suggestedSlug = useMemo(() => slugify(companyName), [companyName]);

  function updateCompany(value: string) {
    setCompanyName(value);
    if (!customSlug) setSlug(slugify(value));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError('');
    try {
      const data = await apiRequest<AuthProfile & { token?: string; expiresAt?: string }>('auth/register', {
        method: 'POST',
        body: JSON.stringify({ companyName, ...(customSlug && slug.trim() ? { slug: slug.trim() } : {}), email, password, deviceName: 'Web browser', deviceType: 'web' }),
      });
      router.replace('/dashboard');
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Workspace could not be created. Please try again.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <div className="mb-7">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-[.16em] text-[#378467]">Start your workspace</p>
        <h2 className="text-[30px] font-semibold tracking-[-.05em] text-[#17251f]">Create your account</h2>
        <p className="mt-2 text-[13px] leading-6 text-[#748078]">Your account becomes the owner of this tenant workspace.</p>
      </div>

      {error && <div role="alert" className="mb-5 rounded-xl border border-[#f1cbc3] bg-[#fff5f2] px-4 py-3 text-[12px] leading-5 text-[#a44131]">{error}</div>}

      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label" htmlFor="company">Workspace name</label>
          <div className="relative"><Building2 size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#94a198]" /><input id="company" className="field pl-10" autoComplete="organization" placeholder="Acme Studio" required minLength={2} maxLength={120} value={companyName} onChange={(event) => updateCompany(event.target.value)} /></div>
        </div>

        <div>
          <label className="label" htmlFor="slug">Workspace address <span className="font-normal text-[#9aa69f]">· optional</span></label>
          <div className="flex overflow-hidden rounded-xl border border-[#dce5df] bg-white focus-within:border-[#55a27c] focus-within:ring-4 focus-within:ring-[#399163]/[.12]">
            <span className="flex items-center border-r border-[#e7ece8] bg-[#f8faf8] px-3 text-[11px] text-[#89958d]">/w/</span>
            <div className="relative min-w-0 flex-1"><Globe2 size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#94a198]" /><input id="slug" className="w-full bg-transparent py-3 pl-9 pr-3 font-mono text-[12px] text-[#25372e] outline-none" placeholder={suggestedSlug || 'your-workspace'} maxLength={48} value={slug} onChange={(event) => { const value = event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 48); setSlug(value); setCustomSlug(value !== slugify(companyName)); }} /></div>
          </div>
          <p className="mt-1.5 text-[10px] text-[#9aa69f]">Leave blank to generate a unique address automatically.</p>
        </div>

        <div>
          <label className="label" htmlFor="email">Owner email</label>
          <div className="relative"><Mail size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#94a198]" /><input id="email" className="field pl-10" type="email" autoComplete="email" placeholder="you@company.com" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} /></div>
        </div>

        <div>
          <label className="label" htmlFor="password">Create password</label>
          <div className="relative"><LockKeyhole size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#94a198]" /><input id="password" className="field pl-10 pr-12" type={visible ? 'text' : 'password'} autoComplete="new-password" placeholder="At least 8 characters" minLength={8} maxLength={128} required value={password} onChange={(event) => setPassword(event.target.value)} /><button type="button" onClick={() => setVisible((value) => !value)} className="absolute right-3.5 top-1/2 -translate-y-1/2 rounded p-1 text-[#8c9991] hover:text-[#263a31]" aria-label={visible ? 'Hide password' : 'Show password'}>{visible ? <EyeOff size={16} /> : <Eye size={16} />}</button></div>
          <p className="mt-1.5 text-[10px] text-[#9aa69f]">Use 8–128 characters. You can change it later.</p>
        </div>

        <button className="btn-primary mt-2 h-[46px] w-full text-[13px]" disabled={pending} type="submit">
          {pending ? <LoaderCircle className="animate-spin" size={17} /> : <>Create workspace <ArrowRight size={16} /></>}
        </button>
      </form>

      <p className="mt-6 text-center text-[12px] text-[#77837b]">Already have a workspace? <Link href="/login" className="font-semibold text-[#176b52] hover:text-[#104c3a]">Sign in</Link></p>
    </div>
  );
}
