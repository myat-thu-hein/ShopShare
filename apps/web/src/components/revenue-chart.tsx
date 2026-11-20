'use client';

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatTHB } from '@/lib/utils';

/** Axis labels in baht (values arrive in satang): 1500000 satang -> "฿15k". */
export function axisBaht(satang: number): string {
  const baht = satang / 100;
  if (baht >= 1_000_000) return `฿${+(baht / 1_000_000).toFixed(1)}M`;
  if (baht >= 1_000) return `฿${+(baht / 1_000).toFixed(1)}k`;
  return `฿${Math.round(baht)}`;
}

export function RevenueChart({ data }: { data: { date: string; revenue: number; orders: number }[] }) {
  const total = data.reduce((s, d) => s + d.revenue, 0);
  return (
    <figure aria-label={`Revenue over the last ${data.length} days, ${formatTHB(total)} in total`}>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--marigold)" stopOpacity={0.45} />
                <stop offset="100%" stopColor="var(--marigold)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--line)" />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tick={{ fill: 'var(--muted-fg)', fontSize: 12 }}
              tickFormatter={(d: string) =>
                new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
              }
              interval="preserveStartEnd"
              minTickGap={32}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={64}
              tick={{ fill: 'var(--muted-fg)', fontSize: 12 }}
              tickFormatter={axisBaht}
            />
            <Tooltip
              contentStyle={{
                background: 'var(--surface)',
                border: '1px solid var(--line)',
                borderRadius: 12,
                fontSize: 13,
              }}
              labelFormatter={(d: string) =>
                new Date(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
              }
              formatter={(v: number, name: string) =>
                name === 'revenue' ? [formatTHB(v), 'Revenue'] : [v, 'Orders']
              }
            />
            <Area
              type="monotone"
              dataKey="revenue"
              stroke="var(--marigold)"
              strokeWidth={2.5}
              fill="url(#rev)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

export function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      <p className="text-sm text-muted-fg">{label}</p>
      <p className="price mt-1 text-2xl sm:text-3xl">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-fg">{hint}</p> : null}
    </div>
  );
}
