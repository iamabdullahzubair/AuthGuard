'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getStoredMember, getStoredTenant, getStoredToken } from '@/lib/api';

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    const token = getStoredToken();
    const member = getStoredMember();
    const tenant = getStoredTenant();

    if (!token || !member) {
      router.replace('/login');
    } else if (member.isSuperAdmin && !tenant) {
      router.replace('/super-admin');
    } else {
      router.replace('/dashboard');
    }
  }, [router]);

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
