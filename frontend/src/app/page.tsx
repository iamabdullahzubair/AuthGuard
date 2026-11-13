'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getStoredMember, getStoredToken } from '@/lib/api';

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    const token = getStoredToken();
    const member = getStoredMember();

    if (!token || !member) {
      router.push('/login');
    } else if (member.isSuperAdmin) {
      router.push('/super-admin');
    } else {
      router.push('/dashboard');
    }
  }, [router]);

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
