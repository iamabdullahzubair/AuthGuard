import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AuditLogViewer, type AuditLogResult } from '@/components/audit/AuditLogViewer';
import { getServerProfile, serverApi } from '@/lib/server-api';

export const metadata: Metadata = { title: 'Activity & audit logs' };

export default async function TenantActivityPage() {
  const profile = await getServerProfile();
  if (!profile) redirect('/login');
  if (profile.member.isSuperAdmin || profile.member.role !== 'owner') redirect('/dashboard');
  const result = await serverApi<AuditLogResult>('audit-logs/tenant?limit=25&offset=0');
  return <AuditLogViewer scope="tenant" initialData={result?.data ?? null} initialError={result ? '' : 'Could not load workspace activity. Check the V2 API connection and apply pending database migrations.'} />;
}
