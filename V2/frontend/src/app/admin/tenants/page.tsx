import type { Metadata } from 'next';
import { AdminConsole } from '@/components/admin/AdminConsole';
import { serverApi } from '@/lib/server-api';

export const metadata: Metadata = { title: 'Tenant directory' };

export type TenantSummary = {
  id: string;
  name: string;
  slug: string;
  status: 'active' | 'suspended';
  tier?: string;
  createdAt: string;
  ownerEmail: string | null;
  memberCount: number;
};
export type TenantDirectoryData = {
  tenants: TenantSummary[];
  pagination: { total: number; limit: number; offset: number; hasMore: boolean };
};

export default async function TenantsPage() {
  const result = await serverApi<TenantDirectoryData>('super-admin/tenants?limit=10&offset=0');
  return <AdminConsole initialTenants={result?.data.tenants ?? []} initialTotal={result?.data.pagination.total ?? 0} initialError={result ? '' : 'Could not load the tenant directory. Check the V2 API connection and reload.'} />;
}
