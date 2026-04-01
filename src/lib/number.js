export function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

export function round2(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function formatMoney(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "BDT",
    maximumFractionDigits: 2
  }).format(toNumber(value));
}

export function formatKg(value) {
  return `${toNumber(value).toFixed(2)} kg`;
}
