import { PageTitle } from '@/components/ui/misc';
import { SellersList } from '../sellers-list';

export default function AdminSellers() {
  return (
    <div>
      <PageTitle
        title="Sellers"
        description="Approve new stores or suspend existing ones. Products from unapproved stores are hidden."
      />
      <SellersList />
    </div>
  );
}
