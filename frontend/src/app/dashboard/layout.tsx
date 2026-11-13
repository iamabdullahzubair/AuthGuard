'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldAlert, ArrowLeft, Loader2 } from 'lucide-react';
import Sidebar from '@/components/Sidebar';
import { getStoredToken, getStoredMember, getStoredTenant, setStoredAuth, apiClient, Member, Tenant } from '@/lib/api';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [member, setMember] = useState<Member | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      router.push('/login');
    } else {
      setMember(getStoredMember());
      setTenant(getStoredTenant());
      setAuthorized(true);
    }
  }, [router]);

  const handleReturnToSuperAdmin = async () => {
    setExiting(true);
    try {
      const res = await apiClient('/api/tenant/exit-impersonation', { method: 'POST' });
      setStoredAuth(res.token, res.member, null);
      router.push('/super-admin');
    } catch {
      router.push('/super-admin');
    } finally {
      setExiting(false);
    }
  };

  if (!authorized) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {member?.isSuperAdmin && (
        <div className="bg-amber-950/90 border-b border-amber-800/80 px-6 py-2.5 flex items-center justify-between text-xs text-amber-200 sticky top-0 z-40 backdrop-blur-md">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-amber-400 shrink-0" />
            <span>
              Super Admin Impersonation Mode: Currently managing tenant <strong className="text-white font-semibold">{tenant?.name || 'Workspace'}</strong>
            </span>
          </div>
          <button
            onClick={handleReturnToSuperAdmin}
            disabled={exiting}
            className="bg-amber-600 hover:bg-amber-500 text-white font-semibold px-3 py-1 rounded-lg text-xs flex items-center gap-1.5 transition-colors shadow-sm"
          >
            {exiting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowLeft className="h-3.5 w-3.5" />}
            <span>Return to Super Admin</span>
          </button>
        </div>
      )}
      <div className="flex-1 flex min-h-0">
        <Sidebar />
        <main className="flex-1 flex flex-col min-w-0 overflow-y-auto">
          <div className="p-8 max-w-7xl w-full mx-auto">{children}</div>
        </main>
      </div>
    </div>
  );
}
