import Link from 'next/link';
import { ArrowUpRight, Fingerprint, LockKeyhole, ShieldCheck } from 'lucide-react';

export function AuthBrand() {
  return (
    <Link href="/login" className="inline-flex items-center gap-3" aria-label="AuthGuard home">
      <span className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-[#b9f3cf] text-[#124d3c]">
        <ShieldCheck size={22} strokeWidth={2.2} />
      </span>
      <span className="text-[17px] font-bold tracking-[-.04em] text-[#f4fff7]">AuthGuard</span>
      <span className="rounded-full border border-white/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[.14em] text-white/55">V2</span>
    </Link>
  );
}

export function AuthFrame({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-white lg:grid lg:grid-cols-[1.02fr_.98fr]">
      <section className="relative hidden min-h-screen overflow-hidden bg-[#112d25] px-12 py-10 text-white lg:flex lg:flex-col xl:px-[8.5vw]">
        <div className="auth-grid pointer-events-none absolute inset-0 opacity-30" />
        <div className="pointer-events-none absolute -right-40 top-32 h-[520px] w-[520px] rounded-full border border-white/[.08]" />
        <div className="pointer-events-none absolute -right-20 top-52 h-[360px] w-[360px] rounded-full border border-white/[.08]" />
        <div className="pointer-events-none absolute bottom-[-190px] left-[-100px] h-[500px] w-[500px] rounded-full bg-[#71d99c]/10 blur-[100px]" />
        <div className="relative z-10"><AuthBrand /></div>

        <div className="relative z-10 my-auto max-w-[560px] pb-10 pt-20">
          <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-[#b9f3cf]/20 bg-[#b9f3cf]/[.08] px-3.5 py-2 text-[11px] font-semibold tracking-wide text-[#b9f3cf]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#7de5a5] shadow-[0_0_10px_#7de5a5]" />
            A calmer way to secure access
          </div>
          <h1 className="text-balance text-[44px] font-semibold leading-[1.1] tracking-[-.055em] text-[#f2faf5] xl:text-[58px]">
            Security that fits the way your team works.
          </h1>
          <p className="mt-6 max-w-[460px] text-[15px] leading-7 text-[#b1c8bc]">
            One clear place to manage your workspace, team access, and active sessions.
          </p>

          <div className="mt-12 grid max-w-[500px] grid-cols-2 gap-3">
            <div className="rounded-2xl border border-white/[.09] bg-white/[.045] p-4 backdrop-blur-sm">
              <Fingerprint className="mb-4 text-[#9be8b4]" size={21} />
              <div className="text-[13px] font-semibold text-white">Protected sessions</div>
              <div className="mt-1 text-[11px] leading-5 text-[#a9c1b4]">See and revoke device access any time.</div>
            </div>
            <div className="rounded-2xl border border-white/[.09] bg-white/[.045] p-4 backdrop-blur-sm">
              <LockKeyhole className="mb-4 text-[#9be8b4]" size={21} />
              <div className="text-[13px] font-semibold text-white">Tenant isolation</div>
              <div className="mt-1 text-[11px] leading-5 text-[#a9c1b4]">Team members stay in their workspace.</div>
            </div>
          </div>
        </div>

        <div className="relative z-10 flex items-center justify-between border-t border-white/10 pt-5 text-[10px] text-[#8fa99b]">
          <span>AuthGuard · Secure workspace access</span>
          <span className="flex items-center gap-1.5">Built for clarity <ArrowUpRight size={12} /></span>
        </div>
      </section>

      <section className="relative flex min-h-screen items-center justify-center px-5 py-10 sm:px-10">
        <div className="absolute left-6 top-6 lg:hidden"><AuthBrand /></div>
        <div className="w-full max-w-[430px] pt-10 lg:pt-0">{children}</div>
        <div className="absolute bottom-5 text-center text-[10px] text-[#99a59e]">Protected by AuthGuard · Secure sign-in</div>
      </section>
    </main>
  );
}
