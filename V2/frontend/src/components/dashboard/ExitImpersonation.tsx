'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, LoaderCircle } from 'lucide-react';
import { apiRequest } from '@/lib/api';

export function ExitImpersonation() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function exit() {
    setPending(true);
    try {
      await apiRequest('auth/exit-impersonation', { method: 'POST', body: '{}' });
      router.replace('/admin');
      router.refresh();
    } catch {
      router.replace('/login');
    } finally { setPending(false); }
  }

  return <button onClick={exit} disabled={pending} className="inline-flex items-center gap-2 rounded-lg border border-[#f1d99a] bg-white/70 px-3 py-1.5 text-[10px] font-semibold text-[#714d13] hover:bg-white disabled:opacity-60">
    {pending ? <LoaderCircle size={13} className="animate-spin" /> : <ArrowLeft size={13} />}
    Return to platform
  </button>;
}
