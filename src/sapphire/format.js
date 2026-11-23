// Display helpers: Indian rupee formatting (Rs 1,00,000.00) and dates in IST.
export const money = minor => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' })
  .format((Number(minor) || 0) / 100);

export const dateTime = value => value ? new Intl.DateTimeFormat('en-IN', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata',
}).format(new Date(value)) : '—';

export const STATUS_COLORS = {
  PENDING: 'warning', HOLD: 'warning', APPROVED: 'success', ACTIVE: 'success',
  REJECTED: 'error', FROZEN: 'error', COMPLETED: 'success',
};

// Same EMI formula as the backend, only for the preview shown before applying.
export function emiPreviewMinor(principalMinor, annualRateBps, months) {
  const r = annualRateBps / 10_000 / 12;
  if (!principalMinor || !months) return 0;
  if (r === 0) return Math.ceil(principalMinor / months);
  const factor = (1 + r) ** months;
  return Math.round((principalMinor * r * factor) / (factor - 1));
}
