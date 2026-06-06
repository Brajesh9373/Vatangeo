import { memo, useState } from 'react';

type Size = 'sm' | 'md' | 'lg' | 'xl' | '2xl';

interface Props {
  size?: Size;
}

const SIZE_PX: Record<Size, number> = { sm: 32, md: 40, lg: 56, xl: 96, '2xl': 120 };

function LogoBase({ size = 'md' }: Props) {
  const [failed, setFailed] = useState(false);
  const px = SIZE_PX[size];

  if (failed) {
    return (
      <div
        className="bg-[var(--color-brand)] rounded-xl flex items-center justify-center shrink-0"
        style={{ width: px, height: px }}
      >
        <span className="text-white font-bold tracking-wider" style={{ fontSize: px * 0.45 }}>
          V
        </span>
      </div>
    );
  }

  return (
    <img
      src="/logo.webp"
      alt="Vantageo"
      width={px}
      height={px}
      className="rounded-xl shrink-0 object-contain"
      onError={() => setFailed(true)}
    />
  );
}

export const Logo = memo(LogoBase);
