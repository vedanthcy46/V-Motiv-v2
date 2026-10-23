import React from 'react';

interface BrandLogoProps {
  variant?: 'horizontal' | 'lockup' | 'emblem';
  className?: string;
  theme?: 'light' | 'dark';
  height?: number;
  alt?: string;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({
  variant = 'horizontal',
  className = '',
  theme = 'dark',
  height = 42,
  alt = 'V MOTIV',
}) => {
  if (variant === 'lockup') {
    return (
      <div className={`brand-lockup-container ${className}`} style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center' }}>
        <img
          src="/brand/vmotiv-lockup.svg"
          alt={alt}
          style={{ height: height ? `${height}px` : 'auto', maxWidth: '100%', objectFit: 'contain' }}
        />
      </div>
    );
  }

  if (variant === 'emblem') {
    return (
      <img
        src="/brand/vmotiv-logo.svg"
        alt={alt}
        className={className}
        style={{ height: `${height}px`, width: 'auto', objectFit: 'contain' }}
      />
    );
  }

  // Horizontal logo (emblem + V MOTIV wordmark)
  return (
    <div
      className={`brand-horizontal-logo ${className}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '12px',
        textDecoration: 'none',
      }}
    >
      <img
        src="/brand/vmotiv-header-brand-v2.png"
        alt={alt}
        style={{
          height: `${height}px`,
          width: 'auto',
          maxWidth: '220px',
          objectFit: 'contain',
          display: 'block',
        }}
        onError={(e) => {
          // Fallback to SVG composition if PNG has any issue
          const target = e.currentTarget;
          target.onerror = null;
          target.src = '/brand/vmotiv-logo.svg';
        }}
      />
    </div>
  );
};
