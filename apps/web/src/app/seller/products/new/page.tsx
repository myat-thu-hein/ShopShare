import { ProductForm } from '@/components/product-form';
import { PageTitle } from '@/components/ui/misc';

export default function NewProductPage() {
  return (
    <div>
      <PageTitle
        title="Add product"
        description="Add a title and a few keywords, then let the AI draft the description."
      />
      <ProductForm />
    </div>
  );
}
