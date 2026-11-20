import {
  CookingPot,
  Footprints,
  Laptop,
  Shirt,
  ShoppingBag,
  Sparkles,
  Tag,
  Tent,
  Trophy,
  Watch,
  type LucideIcon,
} from 'lucide-react';

const ICONS: Record<string, LucideIcon> = {
  footprints: Footprints,
  shirt: Shirt,
  laptop: Laptop,
  'cooking-pot': CookingPot,
  sparkles: Sparkles,
  tent: Tent,
  'shopping-bag': ShoppingBag,
  watch: Watch,
  trophy: Trophy,
};

export function CategoryIcon({ name, className }: { name: string | null; className?: string }) {
  const Icon = (name && ICONS[name]) || Tag;
  return <Icon className={className} aria-hidden />;
}
