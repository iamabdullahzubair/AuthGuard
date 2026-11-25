'use client';

import { FormEvent, useMemo, useState } from 'react';
import { apiRequest } from '@/lib/api';
import { Check, CircleAlert, Plus, Search, ShieldCheck, Trash2, UserRound, UsersRound, X } from 'lucide-react';

type TenantMember = { id: string; email: string; role: string; created_at: string; updated_at: string };

export function UsersClient({ members: initialMembers, ownerId, initialError }: { members: TenantMember[]; ownerId: string; initialError: string }) {
  const [members, setMembers] = useState(initialMembers);
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [editRole, setEditRole] = useState('');
  const [removing, setRemoving] = useState<TenantMember | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(initialError ? { kind: 'error', text: initialError } : null);
  const filteredMembers = useMemo(() => members.filter((member) => `${member.email} ${member.role}`.toLowerCase().includes(query.toLowerCase())), [members, query]);

  async function addMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setNotice(null);
    try {
      const result = await apiRequest<{ member: TenantMember }>('tenant-members', {
        method: 'POST',
        body: JSON.stringify({ email: form.get('email'), password: form.get('password'), role: form.get('role') }),
      });
      setMembers((current) => [...current, result.member].sort((a, b) => a.created_at.localeCompare(b.created_at)));
      setCreating(false);
      setNotice({ kind: 'success', text: `${result.member.email} was added to your workspace.` });
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Could not create this member.' });
    } finally { setBusy(false); }
  }

  async function saveRole(memberId: string) {
    setBusy(true);
    setNotice(null);
    try {
      const result = await apiRequest<{ member: TenantMember }>(`tenant-members/${encodeURIComponent(memberId)}/role`, {
        method: 'PATCH', body: JSON.stringify({ role: editRole }),
      });
      setMembers((current) => current.map((member) => member.id === memberId ? result.member : member));
      setEditing(null);
      setNotice({ kind: 'success', text: `Role updated for ${result.member.email}.` });
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Could not update the role.' });
    } finally { setBusy(false); }
  }

  async function removeMember() {
    if (!removing) return;
    setBusy(true);
    try {
      await apiRequest(`tenant-members/${encodeURIComponent(removing.id)}`, { method: 'DELETE' });
      setMembers((current) => current.filter((member) => member.id !== removing.id));
      setNotice({ kind: 'success', text: `${removing.email} was removed and their sessions were revoked.` });
      setRemoving(null);
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Could not remove this member.' });
    } finally { setBusy(false); }
  }

  const ownerCount = members.filter((member) => member.role === 'owner').length;

  return <div className="space-y-6">
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div><div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.14em] text-[#438267]"><UsersRound size={14} /> Workspace access</div><h1 className="text-[27px] font-semibold tracking-[-.05em] text-[#1d3027]">Team members</h1><p className="mt-1.5 text-[12px] text-[#849088]">Manage who can sign in to this tenant workspace.</p></div>
      <button onClick={() => { setNotice(null); setCreating(true); }} className="btn-primary h-10 px-4 text-[11px]"><Plus size={15} /> Add a member</button>
    </div>

    {notice && <div role="status" className={`flex items-start gap-2.5 rounded-xl border px-4 py-3 text-[11px] ${notice.kind === 'success' ? 'border-[#d3eadb] bg-[#f0faf3] text-[#286344]' : 'border-[#f0d2cb] bg-[#fff6f3] text-[#9b4b3c]'}`}><CircleAlert size={15} className="mt-0.5 shrink-0" /><span className="flex-1">{notice.text}</span><button onClick={() => setNotice(null)} aria-label="Dismiss" className="opacity-60 hover:opacity-100"><X size={14} /></button></div>}

    <section className="grid gap-3 sm:grid-cols-3">
      <Metric label="People" value={members.length} icon={UsersRound} />
      <Metric label="Role labels" value={new Set(members.map((member) => member.role)).size} icon={ShieldCheck} />
      <Metric label="Workspace owners" value={ownerCount} icon={UserRound} />
    </section>

    <section className="card overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-[#edf1ee] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div><h2 className="text-[12px] font-semibold text-[#304037]">All members <span className="ml-1 rounded-full bg-[#f0f4f1] px-2 py-0.5 text-[9px] text-[#77867c]">{members.length}</span></h2><p className="mt-1 text-[10px] text-[#98a39c]">Every account registered in this workspace.</p></div>
        <div className="relative w-full sm:w-[250px]"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#96a39a]" /><input className="field h-9 rounded-[10px] py-2 pl-9 text-[11px]" placeholder="Search by email or role" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
      </div>

      {members.length === 0 ? <div className="px-5 py-16 text-center"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#edf6f0] text-[#438267]"><UsersRound size={20} /></div><div className="mt-4 text-[13px] font-semibold text-[#34453c]">No member data yet</div><p className="mx-auto mt-1 max-w-sm text-[11px] leading-5 text-[#8b9890]">Members registered in V2 will appear here. You can add the first teammate when ready.</p></div> : <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] border-collapse text-left">
          <thead><tr className="bg-[#fafcfa] text-[9px] font-bold uppercase tracking-[.12em] text-[#99a49d]"><th className="px-5 py-3">Member</th><th className="px-4 py-3">Role label</th><th className="px-4 py-3">Added</th><th className="px-4 py-3 text-right">Manage</th></tr></thead>
          <tbody className="divide-y divide-[#eff2f0]">{filteredMembers.map((member) => <tr key={member.id} className="group transition hover:bg-[#fbfdfb]">
            <td className="px-5 py-3.5"><div className="flex items-center gap-3"><div className={`flex h-9 w-9 items-center justify-center rounded-xl text-[11px] font-bold ${member.role === 'owner' ? 'bg-[#e1f3e7] text-[#246346]' : 'bg-[#edf1f5] text-[#5c7083]'}`}>{member.email.slice(0, 1).toUpperCase()}</div><div><div className="text-[11px] font-semibold text-[#34443b]">{member.email}</div><div className="mt-1 text-[9px] text-[#9ba69f]">{member.id === ownerId ? 'You · workspace owner' : `Member ID ${member.id.slice(0, 8)}`}</div></div></div></td>
            <td className="px-4 py-3.5">{editing === member.id ? <div className="flex items-center gap-1.5"><input aria-label="New role label" value={editRole} maxLength={50} onChange={(event) => setEditRole(event.target.value)} className="field h-8 w-36 rounded-lg px-2.5 py-1 text-[10px]" /><button disabled={busy} onClick={() => saveRole(member.id)} className="rounded-lg bg-[#e7f4eb] p-2 text-[#327956] hover:bg-[#d8eedf] disabled:opacity-50" aria-label="Save role"><Check size={13} /></button><button onClick={() => setEditing(null)} className="rounded-lg p-2 text-[#98a39c] hover:bg-[#f0f3f1]" aria-label="Cancel role edit"><X size={13} /></button></div> : <span className={`status-pill ${member.role === 'owner' ? 'bg-[#e9f6ed] text-[#347555]' : 'bg-[#f0f3f5] text-[#5e6c77]'}`}>{member.role === 'owner' && <ShieldCheck size={12} />}{member.role}</span>}</td>
            <td className="px-4 py-3.5 text-[10px] text-[#8e9a92]">{new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(member.created_at))}</td>
            <td className="px-4 py-3.5 text-right">{member.role === 'owner' ? <span className="pr-2 text-[9px] font-medium text-[#a1aaa4]">Protected</span> : <div className="inline-flex items-center gap-1"><button onClick={() => { setEditing(member.id); setEditRole(member.role); }} className="rounded-lg px-2.5 py-1.5 text-[10px] font-semibold text-[#527461] hover:bg-[#edf6f0]">Edit role</button><button onClick={() => setRemoving(member)} className="rounded-lg p-2 text-[#a1aaa4] hover:bg-[#fff2ef] hover:text-[#bd5543]" aria-label={`Remove ${member.email}`}><Trash2 size={14} /></button></div>}</td>
          </tr>)}</tbody>
        </table>
        {filteredMembers.length === 0 && <div className="px-5 py-10 text-center text-[11px] text-[#8d9991]">No members match “{query}”.</div>}
      </div>}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#edf1ee] bg-[#fcfdfc] px-5 py-3 text-[9px] text-[#96a29a]"><span>Role labels help identify members; they do not grant permissions yet.</span><span>{filteredMembers.length} of {members.length} shown</span></div>
    </section>

    {creating && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#11241c]/45 p-4 backdrop-blur-[3px]" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCreating(false); }}><section role="dialog" aria-modal="true" aria-labelledby="create-member-title" className="surface-shadow w-full max-w-[470px] rounded-[22px] border border-white/70 bg-white p-6 sm:p-7">
      <div className="flex items-start justify-between"><div><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#e9f6ed] text-[#347555]"><UserRound size={18} /></span><h2 id="create-member-title" className="mt-4 text-[19px] font-semibold tracking-[-.04em] text-[#203229]">Add a team member</h2><p className="mt-1 text-[11px] leading-5 text-[#87938b]">Create a sign-in for someone in your workspace.</p></div><button onClick={() => setCreating(false)} className="rounded-lg p-2 text-[#8d9991] hover:bg-[#f1f4f2]" aria-label="Close dialog"><X size={16} /></button></div>
      <form onSubmit={addMember} className="mt-6 space-y-4">
        <div><label className="label" htmlFor="member-email">Member email</label><input className="field text-[12px]" id="member-email" name="email" type="email" placeholder="teammate@company.com" autoComplete="email" required maxLength={254} /></div>
        <div><label className="label" htmlFor="member-role">Role label</label><input className="field text-[12px]" id="member-role" name="role" placeholder="Support, Analyst, Operations…" required minLength={2} maxLength={50} /><p className="mt-1.5 text-[9px] text-[#929e96]">A label for now; it does not grant permissions.</p></div>
        <div><label className="label" htmlFor="member-password">Initial password</label><input className="field text-[12px]" id="member-password" name="password" type="password" placeholder="At least 8 characters" autoComplete="new-password" required minLength={8} maxLength={128} /><p className="mt-1.5 text-[9px] leading-4 text-[#929e96]">Share this with the member securely. They can change it after signing in.</p></div>
        <div className="flex justify-end gap-2 border-t border-[#edf1ee] pt-4"><button type="button" className="btn-secondary h-10 px-4 text-[11px]" onClick={() => setCreating(false)}>Cancel</button><button type="submit" className="btn-primary h-10 px-4 text-[11px]" disabled={busy}>{busy ? 'Creating…' : <><Plus size={14} /> Create member</>}</button></div>
      </form>
    </section></div>}

    {removing && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#11241c]/45 p-4 backdrop-blur-[3px]"><section role="alertdialog" aria-modal="true" aria-labelledby="remove-member-title" className="surface-shadow w-full max-w-[420px] rounded-[22px] bg-white p-6"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#fff0ed] text-[#bd5543]"><Trash2 size={17} /></div><h2 id="remove-member-title" className="mt-4 text-[18px] font-semibold text-[#24352c]">Remove this member?</h2><p className="mt-2 text-[11px] leading-5 text-[#79867e]">This removes <strong className="text-[#394a40]">{removing.email}</strong> from the workspace and revokes their active sessions. This cannot be undone.</p><div className="mt-6 flex justify-end gap-2"><button className="btn-secondary h-9 px-4 text-[11px]" onClick={() => setRemoving(null)}>Keep member</button><button className="inline-flex h-9 items-center gap-2 rounded-[10px] bg-[#b94e3c] px-4 text-[11px] font-semibold text-white hover:bg-[#a84232] disabled:opacity-60" disabled={busy} onClick={removeMember}>{busy ? 'Removing…' : 'Remove member'}</button></div></section></div>}
  </div>;
}

function Metric({ label, value, icon: Icon }: { label: string; value: number; icon: typeof UsersRound }) {
  return <div className="card flex items-center gap-3.5 px-4 py-4"><span className="rounded-[11px] bg-[#edf6f0] p-2.5 text-[#438267]"><Icon size={16} /></span><span><span className="block text-[9px] font-bold uppercase tracking-[.12em] text-[#9aa59e]">{label}</span><span className="mt-0.5 block text-[20px] font-semibold tracking-[-.04em] text-[#263930]">{value}</span></span></div>;
}
