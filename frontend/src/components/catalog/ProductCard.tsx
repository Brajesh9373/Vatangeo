import { memo } from 'react';
import { FileText } from 'lucide-react';
import type { CatalogProduct } from '../../types';

interface Props {
  product: CatalogProduct;
  isDark: boolean;
  onGetQuote: (model: string) => void;
}

const cardBase = 'rounded-xl border p-4 transition-all hover:shadow-md hover:border-[var(--color-brand)]';
const cardDark = 'bg-[var(--color-dark-surface)] border-[var(--color-dark-border)]';
const cardLight = 'bg-[var(--color-light-elevated)] border-[var(--color-light-border)]';

const labelDark = 'text-[var(--color-dark-muted)]';
const labelLight = 'text-[var(--color-light-muted)]';
const valueDark = 'text-[var(--color-dark-text)] font-medium';
const valueLight = 'text-[var(--color-light-text)] font-medium';

const badgeDark = 'bg-white/10 text-[var(--color-dark-muted)]';
const badgeLight = 'bg-[var(--color-accent-subtle)] text-[var(--color-accent)]';

const titleDark = 'text-[var(--color-dark-text)]';
const titleLight = 'text-[var(--color-light-text)]';

function ProductCardBase({ product, isDark, onGetQuote }: Props) {
  const displayName = product.model.startsWith('Vantageo ') ? product.model : `Vantageo ${product.model}`;
  const labelCls = isDark ? labelDark : labelLight;
  const valueCls = isDark ? valueDark : valueLight;
  const bareModel = product.model.replace(/^Vantageo\s+/, '');

  return (
    <div className={[cardBase, isDark ? cardDark : cardLight].join(' ')}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className={['text-sm font-semibold', isDark ? titleDark : titleLight].join(' ')}>
            {displayName}
          </h3>
          {product.ff_detail ? (
            <span className={['text-[10px] font-medium px-1.5 py-0.5 rounded mt-1 inline-block', isDark ? badgeDark : badgeLight].join(' ')}>
              {product.ff_detail}
            </span>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        {product.dimm_slots != null ? (
          <div className={labelCls}>
            <span className="block text-[10px] uppercase tracking-wider mb-0.5">DIMM Slots</span>
            <span className={valueCls}>{product.dimm_slots}</span>
          </div>
        ) : null}
        {product.memory_type ? (
          <div className={labelCls}>
            <span className="block text-[10px] uppercase tracking-wider mb-0.5">Memory</span>
            <span className={valueCls}>{product.memory_type}</span>
          </div>
        ) : null}
        {product.max_tdp_w != null ? (
          <div className={labelCls}>
            <span className="block text-[10px] uppercase tracking-wider mb-0.5">Max TDP</span>
            <span className={valueCls}>{product.max_tdp_w}W</span>
          </div>
        ) : null}
      </div>

      <button
        type="button"
        onClick={() => onGetQuote(bareModel)}
        className="mt-3 w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-medium bg-[var(--color-brand)] text-white hover:bg-[var(--color-brand-hover)] transition-colors"
      >
        <FileText size={12} />
        Get Quote
      </button>
    </div>
  );
}

export const ProductCard = memo(ProductCardBase);
