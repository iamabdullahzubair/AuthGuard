'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Shield,
  Key,
  Webhook,
  Users,
  Palette,
  FileCode,
  LayoutDashboard,
  Crown,
  LogOut,
  Building,
  Terminal,
  Lock,
  KeyRound,
} from 'lucide-react';
import { getStoredMember, getStoredTenant, clearStoredAuth, Member, Tenant } from '@/lib/api';
import ChangePasswordModal from '@/components/ChangePasswordModal';

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [member, setMember] = useState<Member | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [showPasswordModal, setShowPasswordModal] = useState(false);

  useEffect(() => {
    setMember(getStoredMember());
    setTenant(getStoredTenant());
  }, []);

  const handleLogout = () => {
    clearStoredAuth();
    router.push('/login');
  };

  const isSuperAdminView = pathname.startsWith('/super-admin');

  const tenantNav = [
    { name: 'Overview', href: '/dashboard', icon: LayoutDashboard },
    { name: 'API Keys', href: '/dashboard/api-keys', icon: Key },
    { name: 'Webhooks', href: '/dashboard/webhooks', icon: Webhook },
    { name: 'Enrolled Users', href: '/dashboard/users', icon: Users },
    { name: 'Branding', href: '/dashboard/branding', icon: Palette },
    { name: 'Security & Password', href: '/dashboard/security', icon: Lock },
    { name: 'SDK & Docs', href: '/dashboard/docs', icon: FileCode },
  ];

  const superAdminNav = [
    { name: 'Platform Overview', href: '/super-admin', icon: Crown },
    { name: 'All Tenants', href: '/super-admin/tenants', icon: Building },
    { name: 'Live Logs', href: '/super-admin/logs', icon: Terminal },
    { name: 'Security & Password', href: '/super-admin/security', icon: Lock },
  ];

  const currentNav = isSuperAdminView ? superAdminNav : tenantNav;

  return (
    <aside className="w-64 bg-slate-950 border-r border-slate-800 flex flex-col justify-between shrink-0 text-slate-200">
      <div>
        {/* Brand */}
        <div className="h-16 px-6 flex items-center gap-3 border-b border-slate-800">
          <div className="h-9 w-9 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
            <Shield className="h-5 w-5" />
          </div>
          <div>
            <div className="font-bold text-sm tracking-wide text-white">AuthGuard</div>
            <div className="text-[11px] font-medium text-blue-400 uppercase tracking-wider">
              {isSuperAdminView ? 'Super Admin' : tenant?.name || 'Enterprise 2FA'}
            </div>
          </div>
        </div>

        {/* Workspace Switcher Pill for Super Admin */}
        {member?.isSuperAdmin && (
          <div className="p-3">
            <Link
              href={isSuperAdminView ? '/dashboard' : '/super-admin'}
              className="w-full flex items-center justify-between px-3 py-2 text-xs rounded-lg font-medium transition-colors bg-slate-900 hover:bg-slate-800 border border-slate-700/60 text-slate-300"
            >
              <span className="flex items-center gap-2">
                <Crown className="h-3.5 w-3.5 text-amber-400" />
                {isSuperAdminView ? 'Switch to Tenant View' : 'Switch to Super Admin'}
              </span>
              <span className="text-[10px] bg-slate-800 px-1.5 py-0.5 rounded text-slate-400">⌘S</span>
            </Link>
          </div>
        )}

        {/* Navigation */}
        <nav className="p-3 space-y-1">
          {currentNav.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                    : 'text-slate-400 hover:text-white hover:bg-slate-900'
                }`}
              >
                <Icon className={`h-4 w-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                {item.name}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* User Footer */}
      <div className="p-3 border-t border-slate-800/80 bg-slate-950/60">
        <div className="flex items-center justify-between p-2 rounded-lg bg-slate-900/80 border border-slate-800">
          <div className="truncate mr-2">
            <div className="text-xs font-semibold text-white truncate">{member?.email || 'Admin'}</div>
            <div className="text-[10px] text-slate-400 capitalize flex items-center gap-1">
              {member?.isSuperAdmin ? (
                <span className="text-amber-400 font-semibold">Super Admin</span>
              ) : (
                <span>{member?.role || 'Owner'}</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => setShowPasswordModal(true)}
              title="Change Password"
              className="p-1.5 rounded-md text-slate-400 hover:text-blue-400 hover:bg-slate-800 transition-colors"
            >
              <KeyRound className="h-4 w-4" />
            </button>
            <button
              onClick={handleLogout}
              title="Log out"
              className="p-1.5 rounded-md text-slate-400 hover:text-red-400 hover:bg-red-950/40 transition-colors"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <ChangePasswordModal
        isOpen={showPasswordModal}
        onClose={() => setShowPasswordModal(false)}
        userEmail={member?.email}
        isSuperAdmin={member?.isSuperAdmin}
      />
    </aside>
  );
}
