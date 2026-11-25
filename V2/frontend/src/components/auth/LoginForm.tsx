'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Eye, EyeOff, LoaderCircle, LockKeyhole, Mail } from 'lucide-react';
import { apiRequest, AuthProfile } from '@/lib/api';

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError('');
    try {
      const data = await apiRequest<AuthProfile & { token?: string; expiresAt?: string }>('auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password, deviceName: 'Web browser', deviceType: 'web' }),
      });
      router.replace(data.member.isSuperAdmin && !data.tenant ? '/admin' : '/dashboard');
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Sign-in failed. Please try again.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <div className="mb-8">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-[.16em] text-[#378467]">Welcome back</p>
        <h2 className="text-[30px] font-semibold tracking-[-.05em] text-[#17251f]">Sign in to your account</h2>
        <p className="mt-2 text-[13px] leading-6 text-[#748078]">Use your workspace member credentials to continue.</p>
      </div>

      {error && <div role="alert" className="mb-5 rounded-xl border border-[#f1cbc3] bg-[#fff5f2] px-4 py-3 text-[12px] leading-5 text-[#a44131]">{error}</div>}

      <form onSubmit={submit} className="space-y-5">
        <div>
          <label className="label" htmlFor="email">Work email</label>
          <div className="relative">
            <Mail size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#94a198]" />
            <input id="email" className="field pl-10" type="email" autoComplete="email" placeholder="you@company.com" required value={email} onChange={(event) => setEmail(event.target.value)} />
          </div>
        </div>

        <div>
          <div className="mb-[7px] flex items-center justify-between">
            <label className="label mb-0" htmlFor="password">Password</label>
            <span className="text-[10px] text-[#9aa69f]">Forgot password? Contact your workspace owner.</span>
          </div>
          <div className="relative">
            <LockKeyhole size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#94a198]" />
            <input id="password" className="field pl-10 pr-12" type={visible ? 'text' : 'password'} autoComplete="current-password" placeholder="Enter your password" required value={password} onChange={(event) => setPassword(event.target.value)} />
            <button type="button" onClick={() => setVisible((value) => !value)} className="absolute right-3.5 top-1/2 -translate-y-1/2 rounded p-1 text-[#8c9991] hover:text-[#263a31]" aria-label={visible ? 'Hide password' : 'Show password'}>
              {visible ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        <button className="btn-primary mt-2 h-[46px] w-full text-[13px]" disabled={pending} type="submit">
          {pending ? <LoaderCircle className="animate-spin" size={17} /> : <>Continue securely <ArrowRight size={16} /></>}
        </button>
      </form>

      <div className="my-7 flex items-center gap-4 text-[10px] font-semibold uppercase tracking-[.12em] text-[#a0aaa4]">
        <span className="h-px flex-1 bg-[#e8ede9]" />
        Secure workspace access
        <span className="h-px flex-1 bg-[#e8ede9]" />
      </div>
      <p className="text-center text-[12px] text-[#77837b]">New to AuthGuard? <Link href="/register" className="font-semibold text-[#176b52] hover:text-[#104c3a]">Create a workspace</Link></p>
    </div>
  );
}
