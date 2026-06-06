import { Loader } from 'lucide-react';
import { fetchProducts } from '../../lib/api';
import { useCached } from '../../lib/useCached';
import { useTheme } from '../../context/ThemeContext';
import { ProductCard } from './ProductCard';

interface Props {
  onGetQuote: (model: string) => void;
}

export default function CatalogView({ onGetQuote }: Props) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const { data, loading, error } = useCached('products', fetchProducts);

  const products = data ?? [];
  const containerCls = isDark ? 'bg-[var(--color-dark-bg)]' : 'bg-[var(--color-light-bg)]';
  const titleCls = isDark ? 'text-[var(--color-dark-text)]' : 'text-[var(--color-light-text)]';
  const mutedCls = isDark ? 'text-[var(--color-dark-muted)]' : 'text-[var(--color-light-muted)]';

  return (
    <div className={['flex-1 overflow-y-auto custom-scroll', containerCls].join(' ')}>
      <div className="max-w-4xl mx-auto px-6 py-8">
        <h2 className={['text-lg font-semibold mb-6', titleCls].join(' ')}>Product Catalog</h2>

        {loading ? (
          <div className={['flex items-center gap-2 text-sm', mutedCls].join(' ')}>
            <Loader size={14} className="animate-spin" />
            Loading products...
          </div>
        ) : error ? (
          <div className="text-sm text-[var(--color-error)]">{error.message}</div>
        ) : products.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {products.map((p) => (
              <ProductCard key={p.model} product={p} isDark={isDark} onGetQuote={onGetQuote} />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
