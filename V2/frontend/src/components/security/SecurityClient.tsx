'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Activity, AlertTriangle, Check, Clock3, Eye, EyeOff, Fingerprint, Globe2, KeyRound, Laptop2, LoaderCircle, LogOut, MonitorSmartphone, ShieldCheck, Smartphone, Trash2 } from 'lucide-react';
import { apiRequest } from '@/lib/api';
import type { ActiveSession } from '@/lib/api';
import { ClientDateTime } from '@/components/ClientDateTime';

export function SecurityClient({ email, sessions: initialSessions, initialError }: { email: string; sessions: ActiveSession[]; initialError: string }) {
  const router = useRouter();
  const [sessions, setSessions] = useState(initialSessions);
  const [notice, setNotice] = useState(initialError);
  const [savingPassword, setSavingPassword] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState('');

  async function updatePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice('');
    setPasswordSuccess('');
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const currentPassword = String(form.get('currentPassword') || '');
    const newPassword = String(form.get('newPassword') || '');
    const confirmPassword = String(form.get('confirmPassword') || '');
    if (newPassword !== confirmPassword) { setNotice('The new passwords do not match.'); return; }
    if (currentPassword === newPassword) { setNotice('Choose a new password different from your current one.'); return; }

    setSavingPassword(true);
    try {
      await apiRequest('auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) });
      formElement.reset();
      setPasswordSuccess('Password updated. Other active sessions have been signed out.');
      setSessions((current) => current.filter((session) => session.current));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not update your password.');
    } finally { setSavingPassword(false); }
  }

  async function revokeSession(session: ActiveSession) {
    setNotice('');
    try {
      await apiRequest(`auth/sessions/${encodeURIComponent(session.id)}`, { method: 'DELETE' });
      setSessions((current) => current.filter((item) => item.id !== session.id));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not revoke this session.');
    }
  }

  async function signOutEverywhere() {
    setSigningOut(true);
    try {
      await apiRequest('auth/logout-all', { method: 'POST', body: '{}' });
      router.replace('/login');
      router.refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not sign out all devices.');
      setSigningOut(false);
    }
  }

  return <div className="space-y-6">
    <div><div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.14em] text-[#438267]"><ShieldCheck size={14} /> Account protection</div><h1 className="text-[27px] font-semibold tracking-[-.05em] text-[#1d3027]">Security & sessions</h1><p className="mt-1.5 text-[12px] text-[#849088]">Control your password and the devices connected to {email}.</p></div>

    {notice && <div role="alert" className="flex items-start gap-2.5 rounded-xl border border-[#f0d2cb] bg-[#fff6f3] px-4 py-3 text-[11px] leading-5 text-[#9b4b3c]"><AlertTriangle size={15} className="mt-0.5 shrink-0" />{notice}</div>}
    {passwordSuccess && <div role="status" className="flex items-center gap-2.5 rounded-xl border border-[#d3eadb] bg-[#f0faf3] px-4 py-3 text-[11px] text-[#286344]"><Check size={15} />{passwordSuccess}</div>}

    <div className="grid gap-5 xl:grid-cols-[.84fr_1.16fr]">
      <section className="card p-5 sm:p-6">
        <div className="flex items-start gap-3"><span className="rounded-[11px] bg-[#edf6f0] p-2.5 text-[#438267]"><KeyRound size={17} /></span><div><h2 className="text-[13px] font-semibold text-[#304037]">Change password</h2><p className="mt-1 text-[10px] leading-5 text-[#8b9890]">Use a unique password you do not use elsewhere.</p></div></div>
        <form className="mt-5 space-y-4" onSubmit={updatePassword}>
          <div><label className="label" htmlFor="current-password">Current password</label><input id="current-password" name="currentPassword" className="field text-[11px]" type="password" autoComplete="current-password" required maxLength={1024} /></div>
          <div><label className="label" htmlFor="new-password">New password</label><div className="relative"><input id="new-password" name="newPassword" className="field pr-11 text-[11px]" type={passwordVisible ? 'text' : 'password'} autoComplete="new-password" required minLength={8} maxLength={128} /><button type="button" onClick={() => setPasswordVisible((value) => !value)} aria-label={passwordVisible ? 'Hide new password' : 'Show new password'} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-[#89968e]">{passwordVisible ? <EyeOff size={15} /> : <Eye size={15} />}</button></div></div>
          <div><label className="label" htmlFor="confirm-password">Confirm new password</label><input id="confirm-password" name="confirmPassword" className="field text-[11px]" type={passwordVisible ? 'text' : 'password'} autoComplete="new-password" required minLength={8} maxLength={128} /></div>
          <div className="rounded-xl border border-[#edf1ee] bg-[#f9fbf9] px-3.5 py-3 text-[9px] leading-5 text-[#849188]">Changing your password signs out your other devices. This session stays active.</div>
          <button type="submit" disabled={savingPassword} className="btn-primary h-10 w-full text-[11px]">{savingPassword ? <LoaderCircle size={15} className="animate-spin" /> : <><KeyRound size={14} /> Update password</>}</button>
        </form>
      </section>

      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#edf1ee] px-5 py-5 sm:px-6"><div className="flex items-start gap-3"><span className="rounded-[11px] bg-[#edf2f8] p-2.5 text-[#587796]"><Fingerprint size={17} /></span><div><h2 className="text-[13px] font-semibold text-[#304037]">Active devices</h2><p className="mt-1 text-[10px] text-[#8b9890]">Sessions currently signed in to your account.</p></div></div><span className="status-pill bg-[#edf7f0] text-[#397a58]"><span className="h-1.5 w-1.5 rounded-full bg-[#56a878]" />{sessions.length} active</span></div>
        {sessions.length === 0 ? <div className="px-5 py-14 text-center"><MonitorSmartphone size={24} className="mx-auto text-[#a7b3ab]" /><p className="mt-3 text-[11px] font-semibold text-[#526158]">No active sessions found</p></div> : <div className="divide-y divide-[#eff2f0]">{sessions.map((session) => <SessionRow key={session.id} session={session} onRevoke={revokeSession} />)}</div>}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#edf1ee] bg-[#fcfdfc] px-5 py-4 sm:px-6"><span className="max-w-sm text-[9px] leading-4 text-[#929e96]">Signing out all devices revokes every session, including this one.</span><button onClick={signOutEverywhere} disabled={signingOut || sessions.length === 0} className="inline-flex h-9 items-center gap-2 rounded-[10px] border border-[#efd8d3] bg-white px-3 text-[10px] font-semibold text-[#a54d3c] hover:bg-[#fff7f5] disabled:cursor-not-allowed disabled:opacity-50">{signingOut ? <LoaderCircle size={13} className="animate-spin" /> : <LogOut size={13} />}Sign out all devices</button></div>
      </section>
    </div>

    <section className="grid gap-3 sm:grid-cols-3"><SecurityFact icon={Activity} title="Server verified" detail="Sessions are checked against the V2 database." /><SecurityFact icon={Clock3} title="Time limited" detail="Every session has a server-enforced expiry." /><SecurityFact icon={Globe2} title="Easy to revoke" detail="Remove a device without affecting the others." /></section>
  </div>;
}

function SessionRow({ session, onRevoke }: { session: ActiveSession; onRevoke: (session: ActiveSession) => void }) {
  const DeviceIcon = session.deviceType === 'mobile' || session.deviceType === 'pwa' ? Smartphone : Laptop2;
  const lastSeen = new Date(session.lastSeenAt);
  const expires = new Date(session.expiresAt);
  return <div className="flex flex-wrap items-start gap-3 px-5 py-4 sm:px-6"><span className={`mt-0.5 rounded-xl p-2.5 ${session.current ? 'bg-[#e8f5ed] text-[#357856]' : 'bg-[#f0f3f5] text-[#647684]'}`}><DeviceIcon size={17} /></span><div className="min-w-[180px] flex-1"><div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold text-[#34443b]">{session.deviceName || 'Unknown device'}{session.current && <span className="status-pill bg-[#eaf6ee] px-2 py-1 text-[8px] text-[#347555]">This device</span>}</div><div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[9px] text-[#8a978f]"><span className="flex items-center gap-1"><Globe2 size={11} />{session.ipAddress || 'IP unavailable'}</span><span className="flex items-center gap-1"><Clock3 size={11} />Seen {Number.isNaN(lastSeen.getTime()) ? 'recently' : <ClientDateTime value={session.lastSeenAt} />}</span></div><div className="mt-1.5 text-[9px] text-[#a1aaa4]">Expires {Number.isNaN(expires.getTime()) ? 'as configured' : <ClientDateTime value={session.expiresAt} />}</div></div>{!session.current && <button onClick={() => onRevoke(session)} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[9px] font-semibold text-[#a45344] hover:bg-[#fff3f0]"><Trash2 size={12} /> Revoke</button>}</div>;
}

function SecurityFact({ icon: Icon, title, detail }: { icon: typeof Activity; title: string; detail: string }) {
  return <div className="card flex items-start gap-3 p-4"><span className="rounded-[10px] bg-[#edf6f0] p-2 text-[#438267]"><Icon size={15} /></span><div><div className="text-[10px] font-semibold text-[#405047]">{title}</div><div className="mt-1 text-[9px] leading-4 text-[#8b9890]">{detail}</div></div></div>;
}
