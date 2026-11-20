import { RoleGate } from '@/components/role-gate';
import { DashboardShell } from '@/components/dashboard-shell';

export const metadata = { title: 'Admin', robots: { index: false } };

const NAV = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/sellers', label: 'Seller approvals' },
  { href: '/admin/users', label: 'Users' },
  { href: '/admin/categories', label: 'Categories' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <RoleGate roles={['ADMIN']}>
      <DashboardShell title="Admin" nav={NAV}>
        {children}
      </DashboardShell>
    </RoleGate>
  );
}
