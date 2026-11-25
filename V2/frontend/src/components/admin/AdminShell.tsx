import { AdminNavigation } from './AdminNavigation';

export function AdminShell({ email, children }: { email: string; children: React.ReactNode }) {
  return <div className="min-h-screen bg-[#f5f7f4] lg:flex">
    <AdminNavigation />
    <div className="min-w-0 flex-1">
      <header className="sticky top-0 z-30 flex h-[68px] items-center justify-between border-b border-[#e6ece7] bg-white/90 px-5 backdrop-blur-xl sm:px-8 lg:px-9">
        <div><div className="text-[10px] font-medium text-[#89968e]">AuthGuard</div><div className="mt-0.5 text-[12px] font-semibold text-[#26372f]">Platform operations</div></div>
        <div className="flex items-center gap-3"><div className="hidden text-right sm:block"><div className="max-w-[240px] truncate text-[11px] font-semibold text-[#314239]">{email}</div><div className="mt-0.5 text-[9px] text-[#9aa59e]">Super Admin</div></div><div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#fbf1d6] text-[11px] font-bold text-[#806320]">{email.slice(0, 1).toUpperCase()}</div></div>
      </header>
      <main className="mx-auto w-full max-w-[1440px] px-5 py-7 sm:px-8 sm:py-9 lg:px-10">{children}</main>
    </div>
  </div>;
}
