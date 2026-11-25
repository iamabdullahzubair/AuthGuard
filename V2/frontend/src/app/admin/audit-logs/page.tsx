import type { Metadata } from 'next';
import { AuditLogViewer, type AuditLogResult } from '@/components/audit/AuditLogViewer';
import { serverApi } from '@/lib/server-api';

export const metadata: Metadata = { title: 'Activity & audit logs' };

export default async function PlatformAuditLogsPage() {
  const result = await serverApi<AuditLogResult>('audit-logs/platform?limit=25&offset=0');
  return <AuditLogViewer scope="platform" initialData={result?.data ?? null} initialError={result ? '' : 'Could not load platform audit logs. Check the V2 API connection and apply pending database migrations.'} />;
}
