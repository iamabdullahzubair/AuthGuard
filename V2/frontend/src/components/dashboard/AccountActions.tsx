'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut, LoaderCircle } from 'lucide-react';
import { apiRequest } from '@/lib/api';

export function AccountActions() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function logout() {
    setPending(true);
    try { await apiRequest('auth/logout', { method: 'POST', body: '{}' }); }
    catch { /* Expired sessions are cleared by the route proxy after successful logout only. */ }
    router.replace('/login');
    router.refresh();
  }

  return <button onClick={logout} disabled={pending} className="btn-secondary h-9 px-3 text-[11px] disabled:opacity-60">
    {pending ? <LoaderCircle size={14} className="animate-spin" /> : <LogOut size={14} />}
    Sign out
  </button>;
}
