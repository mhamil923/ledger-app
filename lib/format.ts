const pct = new Intl.NumberFormat('en-US', {
  style: 'percent',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  signDisplay: 'exceptZero',
});

/**
 * Format a USD price across very different magnitudes — from ~$80,000 (BTC)
 * down to ~$0.000004 (PEPE). We scale decimals to the magnitude so micro-caps
 * don't get rounded to $0.00.
 */
export function formatPrice(value: number, _assetType?: string): string {
  if (value === 0) return '$0.00';
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';

  // Very small: scientific notation, e.g. -$4.080e-6
  if (abs < 0.0001) {
    return `${sign}$${abs.toExponential(3)}`;
  }
  // Sub-dollar: up to 8 sig digits, no thousands separator
  if (abs < 1) {
    return `${sign}$${abs.toLocaleString('en-US', { maximumFractionDigits: 8 })}`;
  }
  // $1–$100: 4 decimals (e.g. crypto in this range)
  if (abs < 100) {
    return `${sign}$${abs.toLocaleString('en-US', { maximumFractionDigits: 4 })}`;
  }
  // $100+: 2 decimals with thousands separators
  return `${sign}$${abs.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatPercent(value: number): string {
  // backend returns percent already (e.g., -1.88 for -1.88%)
  return pct.format(value / 100);
}

export function formatRelativeTime(timestampMs: number): string {
  const diff = Date.now() - timestampMs;
  if (diff < 0) return 'just now';
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
