const VALID_VARIANTS = ['tech', 'full', 'finance', 'happy', 'commodity', 'cyber'] as const;
type Variant = typeof VALID_VARIANTS[number];

function isValidVariant(v: string | null): v is Variant {
  return v !== null && VALID_VARIANTS.includes(v as Variant);
}

export const SITE_VARIANT: string = (() => {
  if (typeof window === 'undefined') return import.meta.env.VITE_VARIANT || 'full';

  const isTauri = '__TAURI_INTERNALS__' in window || '__TAURI__' in window;
  if (isTauri) {
    const stored = localStorage.getItem('worldmonitor-variant');
    if (isValidVariant(stored)) return stored;
    return import.meta.env.VITE_VARIANT || 'full';
  }

  const h = location.hostname;
  if (h.startsWith('tech.')) return 'tech';
  if (h.startsWith('finance.')) return 'finance';
  if (h.startsWith('happy.')) return 'happy';
  if (h.startsWith('commodity.')) return 'commodity';
  if (h.startsWith('cyber.')) return 'cyber';

  if (h === 'localhost' || h === '127.0.0.1') {
    const stored = localStorage.getItem('worldmonitor-variant');
    if (isValidVariant(stored)) return stored;
    return import.meta.env.VITE_VARIANT || 'full';
  }

  return 'full';
})();
