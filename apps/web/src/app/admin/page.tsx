'use client';

import { useQuery } from '@tanstack/react-query';
import type { AdminStatsDto } from '@shopsense/shared';
import { api } from '@/lib/api';
import { formatTHB } from '@/lib/utils';
import { RevenueChart, Stat } from '@/components/revenue-chart';
import { PageTitle, Panel, Skeleton } from '@/components/ui/misc';
import { SellersList } from './sellers-list';

interface Integrations {
  llm: { provider: string; model: string };
  embeddings: { model: string };
  payments: string;
  email: string;
}

export default function AdminOverview() {
  const stats = useQuery({ queryKey: ['admin', 'stats'], queryFn: () => api<AdminStatsDto>('/admin/stats') });
  const integrations = useQuery({
    queryKey: ['admin', 'integrations'],
    queryFn: () => api<Integrations>('/admin/integrations'),
  });
  const s = stats.data;
  const i = integrations.data;
  return (
    <div>
      <PageTitle title="Platform overview" />
      {!s ? (
        <Skeleton className="h-96" />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat
              label="Users"
              value={s.users.toLocaleString()}
              hint={`${s.buyers} buyers, ${s.sellers} sellers`}
            />
            <Stat label="Paid orders" value={s.orders.toLocaleString()} />
            <Stat label="Revenue (all time)" value={formatTHB(s.revenue)} />
            <Stat label="Live products" value={s.products.toLocaleString()} />
          </div>
          <Panel className="mt-6 p-5">
            <h2 className="mb-4 text-lg">Revenue, last 30 days</h2>
            <RevenueChart data={s.revenueByDay} />
          </Panel>
          <section className="mt-8">
            <h2 className="mb-3 text-xl">
              Pending seller approvals{' '}
              {s.pendingSellers ? <span className="text-muted-fg">({s.pendingSellers})</span> : null}
            </h2>
            <SellersList status="PENDING" />
          </section>
        </>
      )}
      {i ? (
        <Panel className="mt-8 p-5">
          <h2 className="text-lg">Integrations</h2>
          <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-fg">Language model</dt>
              <dd>
                {i.llm.provider === 'none'
                  ? 'Not configured (rule-based fallbacks)'
                  : `${i.llm.provider} (${i.llm.model})`}
              </dd>
            </div>
            <div>
              <dt className="text-muted-fg">Embeddings</dt>
              <dd>{i.embeddings.model}</dd>
            </div>
            <div>
              <dt className="text-muted-fg">Payments</dt>
              <dd>{i.payments === 'stripe' ? 'Stripe (test mode)' : 'Mock payments'}</dd>
            </div>
            <div>
              <dt className="text-muted-fg">Email</dt>
              <dd>{i.email === 'log' ? 'Printed to API logs' : i.email}</dd>
            </div>
          </dl>
        </Panel>
      ) : null}
    </div>
  );
}
