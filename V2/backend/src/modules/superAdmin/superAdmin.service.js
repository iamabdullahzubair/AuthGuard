import { listTenants } from './superAdmin.repository.js';

export async function getTenantDirectory({ search = '', limit = 20, offset = 0 }) {
  const result = await listTenants({ search: search.trim(), limit, offset });
  return {
    tenants: result.tenants,
    pagination: {
      total: result.total,
      limit,
      offset,
      hasMore: offset + result.tenants.length < result.total,
    },
  };
}
