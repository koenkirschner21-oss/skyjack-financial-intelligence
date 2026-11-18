import React, { useState } from 'react';

interface SkyjackLogoProps {
  variant: 'dark-sidebar' | 'light-surface';
  collapsed?: boolean;
}

const OFFICIAL_LOGO_SRC = '/assets/aistudio/skyjack-logo_fec1b2df.webp';
const COLLAPSED_SYMBOL_SRC = '/assets/skyjack-symbol.png';

/**
 * Official SKYJACK brand mark aligned to the 2018 SKYJACK colour guide
 * (#E53C2E red/orange, #231F20 black, #7E8082 grey).
 */
export const SkyjackLogo: React.FC<SkyjackLogoProps> = ({ variant, collapsed = false }) => {
  const [imgFailed, setImgFailed] = useState(false);
  const [symbolFailed, setSymbolFailed] = useState(false);
  const isDark = variant === 'dark-sidebar';

  const wordmark = imgFailed ? (
    <span
      className="text-[16px] font-bold tracking-[0.08em] whitespace-nowrap"
      style={{ color: isDark ? '#FFFFFF' : '#231F20' }}
    >
      SK<span className="text-[#E53C2E]">Y</span>JACK
    </span>
  ) : (
    <img
      src={OFFICIAL_LOGO_SRC}
      alt=""
      referrerPolicy="no-referrer"
      onError={() => setImgFailed(true)}
      className={`aspect-[2/1] h-auto object-contain shrink-0 ${
        isDark
          ? 'w-[136px] brightness-[1.24] contrast-[1.08] saturate-[1.06]'
          : 'w-[120px]'
      }`}
    />
  );

  const symbol = symbolFailed ? (
    <span className="text-xs font-bold text-[#E53C2E]">SJ</span>
  ) : (
    <img
      src={COLLAPSED_SYMBOL_SRC}
      alt=""
      referrerPolicy="no-referrer"
      onError={() => setSymbolFailed(true)}
      className="w-7 h-7 object-contain block"
    />
  );

  return (
    <span className="inline-flex items-center justify-center select-none" aria-label="SKYJACK">
      <span className={collapsed ? 'hidden' : 'inline-flex items-center'}>{wordmark}</span>
      <span
        className={`${
          collapsed ? 'inline-flex' : 'hidden'
        } w-9 h-9 rounded-md items-center justify-center shrink-0 overflow-hidden ${
          isDark ? 'bg-white/[0.05] border border-white/[0.10]' : 'bg-[#F5F6F7] border border-[#E2E5E8]'
        }`}
        title="SKYJACK"
      >
        {symbol}
      </span>
    </span>
  );
};

