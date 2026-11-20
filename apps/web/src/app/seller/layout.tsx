import { RoleGate } from '@/components/role-gate';
import { DashboardShell } from '@/components/dashboard-shell';

export const metadata = { title: 'Seller dashboard', robots: { index: false } };

const NAV = [
  { href: '/seller', label: 'Overview' },
  { href: '/seller/products', label: 'Products' },
  { href: '/seller/orders', label: 'Orders' },
  { href: '/seller/settings', label: 'Store settings' },
];

export default function SellerLayout({ children }: { children: React.ReactNode }) {
  return (
    <RoleGate roles={['SELLER']}>
      <DashboardShell title="Seller" nav={NAV}>
        {children}
      </DashboardShell>
    </RoleGate>
  );
}
