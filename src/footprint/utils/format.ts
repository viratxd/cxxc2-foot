export function compact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (abs >= 1000) return `${(value / 1000).toFixed(abs >= 10000 ? 1 : 2)}K`;
  return value.toFixed(abs < 1 ? 4 : abs < 100 ? 2 : 0);
}

export function fmtPrice(value: number): string {
  return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
