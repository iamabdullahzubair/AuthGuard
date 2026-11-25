'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Eye, EyeOff, KeyRound, LoaderCircle, LogOut, ShieldCheck } from 'lucide-react';
import { apiRequest } from '@/lib/api';

export function ForcedPasswordForm({ isSuperAdmin, hasTenant }: { isSuperAdmin: boolean; hasTenant: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const values = new FormData(event.currentTarget);
    const currentPassword = String(values.get('currentPassword') || '');
    const newPassword = String(values.get('newPassword') || '');
    const confirmPassword = String(values.get('confirmPassword') || '');
    if (newPassword !== confirmPassword) { setError('The new passwords do not match.'); return; }
    if (currentPassword === newPassword) { setError('Choose a password different from the temporary password.'); return; }

    setPending(true);
    try {
      await apiRequest('auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      router.replace(isSuperAdmin && !hasTenant ? '/admin' : '/dashboard');
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Your password could not be changed. Please try again.');
    } finally { setPending(false); }
  }

  async function signOut() {
    setSigningOut(true);
    try { await apiRequest('auth/logout', { method: 'POST', body: '{}' }); }
    catch { /* The route proxy clears the cookie when the session is expired or the API is unavailable. */ }
    router.replace('/login');
    router.refresh();
  }

  return <div>
    <div className="mb-7">
      <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[.16em] text-[#b1842e]"><KeyRound size={13} /> One-time setup</p>
      <h2 className="text-[30px] font-semibold tracking-[-.05em] text-[#17251f]">Set your password</h2>
      <p className="mt-2 text-[13px] leading-6 text-[#748078]">Your workspace owner created your account with a temporary password. Choose your own password to continue.</p>
    </div>

    <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-[#f0e3c2] bg-[#fff9eb] px-3.5 py-3 text-[10px] leading-5 text-[#806421]"><ShieldCheck size={15} className="mt-0.5 shrink-0" /><span>This step is required before you can use the workspace. Your other signed-in sessions will be revoked.</span></div>
    {error && <div role="alert" className="mb-5 rounded-xl border border-[#f1cbc3] bg-[#fff5f2] px-4 py-3 text-[12px] leading-5 text-[#a44131]">{error}</div>}

    <form onSubmit={submit} className="space-y-4">
      <div><label className="label" htmlFor="current-password">Temporary password</label><input className="field text-[12px]" id="current-password" name="currentPassword" type="password" autoComplete="current-password" required maxLength={1024} /></div>
      <div><label className="label" htmlFor="new-password">New password</label><div className="relative"><input className="field pr-11 text-[12px]" id="new-password" name="newPassword" type={visible ? 'text' : 'password'} autoComplete="new-password" required minLength={8} maxLength={128} /><button type="button" onClick={() => setVisible((value) => !value)} aria-label={visible ? 'Hide password' : 'Show password'} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-[#89968e]">{visible ? <EyeOff size={15} /> : <Eye size={15} />}</button></div><p className="mt-1.5 text-[10px] text-[#9aa69f]">Use 8–128 characters.</p></div>
      <div><label className="label" htmlFor="confirm-password">Confirm new password</label><input className="field text-[12px]" id="confirm-password" name="confirmPassword" type={visible ? 'text' : 'password'} autoComplete="new-password" required minLength={8} maxLength={128} /></div>
      <button type="submit" disabled={pending} className="btn-primary mt-2 h-[46px] w-full text-[12px]">{pending ? <LoaderCircle size={16} className="animate-spin" /> : <>Save password and continue <Check size={15} /></>}</button>
    </form>
    <button type="button" disabled={signingOut || pending} onClick={signOut} className="mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-xl text-[11px] font-semibold text-[#7c8981] hover:bg-[#f5f8f5] hover:text-[#405047] disabled:opacity-50">{signingOut ? <LoaderCircle size={14} className="animate-spin" /> : <LogOut size={14} />}Sign out instead</button>
  </div>;
}
