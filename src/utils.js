import fs from "node:fs";

const BANGLA_DIGITS = {
  "০": "0",
  "১": "1",
  "২": "2",
  "৩": "3",
  "৪": "4",
  "৫": "5",
  "৬": "6",
  "৭": "7",
  "৮": "8",
  "৯": "9",
};

const NUMERIC_PATTERN = /^-?\d+(?:\.\d+)?$/;
const DATE_PATTERN = /(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/;

export function cleanText(value = "") {
  return String(value ?? "").replace(/^\uFEFF/, "").trim();
}

export function toAsciiDigits(value = "") {
  return String(value ?? "").replace(/[০-৯]/g, (digit) => BANGLA_DIGITS[digit] ?? digit);
}

export function normalizeWhitespace(value = "") {
  return cleanText(value).replace(/\s+/g, " ");
}

export function normalizeKey(value = "") {
  return normalizeWhitespace(toAsciiDigits(value)).toLowerCase();
}

export function parseNumber(value) {
  const candidate = toAsciiDigits(cleanText(value)).replace(/,/g, "");

  if (!candidate || !NUMERIC_PATTERN.test(candidate)) {
    return null;
  }

  const parsed = Number(candidate);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseLooseDate(value) {
  const candidate = toAsciiDigits(cleanText(value));
  const match = candidate.match(DATE_PATTERN);

  if (!match) {
    return null;
  }

  const day = Number(match[1]);
  const month = Number(match[2]);
  let year = Number(match[3]);

  if (year < 100) {
    year += 2000;
  }

  if (!Number.isInteger(day) || !Number.isInteger(month) || !Number.isInteger(year)) {
    return null;
  }

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function parseCsv(filePath) {
  const rawText = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "").trim();

  if (!rawText) {
    return [];
  }

  const lines = rawText.split(/\r?\n/);
  const headers = lines.shift().split(",").map(cleanText);

  return lines.map((line) => {
    const values = line.split(",");
    const row = {};

    headers.forEach((header, index) => {
      row[header] = cleanText(values[index] ?? "");
    });

    return row;
  });
}

export function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

export function nowIso() {
  return new Date().toISOString();
}

export function roundCurrency(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

export function firstDefined(...values) {
  const match = values.find((value) => value !== null && value !== undefined);
  return match === undefined ? null : match;
}

export function buildImportedLabel({ description, size, packet }) {
  const pieces = [description, size, packet].map(normalizeWhitespace).filter(Boolean);
  return pieces.join(" / ");
}
