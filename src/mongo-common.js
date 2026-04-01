import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { normalizeWhitespace, nowIso, parseLooseDate, parseNumber } from "./utils.js";

const __filename = fileURLToPath(import.meta.url);
const APP_DIR = path.resolve(path.dirname(__filename), "..");
const LEGACY_SQLITE_PATH = path.join(APP_DIR, "data", "product-management.db");
const DEFAULT_DB_NAME = "centeral-kitchen";
const NAME_COLLATOR = new Intl.Collator("en", { sensitivity: "base" });

export const COLLECTIONS = {
  appMeta: "app_meta",
  counters: "counters",
  suppliers: "suppliers",
  products: "products",
  supplierEntries: "supplier_entries",
  sales: "sales",
  stockEvents: "stock_events",
};

export function toSerializable(value) {
  if (Array.isArray(value)) {
    return value.map(toSerializable);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== "_id")
        .map(([key, entryValue]) => [key, toSerializable(entryValue)]),
    );
  }

  return typeof value === "bigint" ? Number(value) : value;
}

export function compareNames(left = "", right = "") {
  return NAME_COLLATOR.compare(String(left), String(right));
}

function compareNullableDateDesc(left, right) {
  if (left && right) {
    return String(right).localeCompare(String(left));
  }

  if (left) {
    return -1;
  }

  if (right) {
    return 1;
  }

  return 0;
}

export function compareEventRowsDesc(left, right, fieldName) {
  const dateCompare = compareNullableDateDesc(left[fieldName], right[fieldName]);

  if (dateCompare !== 0) {
    return dateCompare;
  }

  return Number(right.id || 0) - Number(left.id || 0);
}

export function parseSeedCounts(value) {
  if (!value) {
    return {};
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  return value && typeof value === "object" ? toSerializable(value) : {};
}

export function normalizeDateInput(value) {
  const trimmed = normalizeWhitespace(value);

  if (!trimmed) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  return parseLooseDate(trimmed);
}

export function requireDate(value, fieldName) {
  const parsed = normalizeDateInput(value);

  if (!parsed) {
    throw new Error(`${fieldName} is required.`);
  }

  return parsed;
}

export function requirePositiveNumber(value, fieldName) {
  const parsed = typeof value === "number" ? value : parseNumber(value);

  if (parsed === null || parsed <= 0) {
    throw new Error(`${fieldName} must be greater than zero.`);
  }

  return parsed;
}

export function requireNonNegativeNumber(value, fieldName) {
  const parsed = typeof value === "number" ? value : parseNumber(value);

  if (parsed === null || parsed < 0) {
    throw new Error(`${fieldName} must be zero or greater.`);
  }

  return parsed;
}

function envFlagEnabled(value) {
  return ["1", "true", "yes", "on"].includes(normalizeWhitespace(value).toLowerCase());
}

function deriveDbNameFromUri(uri) {
  try {
    const parsed = new URL(uri);
    const dbName = decodeURIComponent(parsed.pathname.replace(/^\/+/, "").split("/")[0] || "");
    return dbName || null;
  } catch {
    return null;
  }
}

export function resolveMongoSettings() {
  const explicitUri = normalizeWhitespace(process.env.MONGODB_URI || process.env.MONGO_URI || "");
  const explicitDbName = normalizeWhitespace(process.env.MONGODB_DB_NAME || process.env.MONGO_DB_NAME || "");

  if (explicitUri) {
    return {
      uri: explicitUri,
      dbName: explicitDbName || deriveDbNameFromUri(explicitUri) || DEFAULT_DB_NAME,
    };
  }

  const scheme = normalizeWhitespace(process.env.MONGODB_SCHEME || "mongodb") || "mongodb";
  const host = normalizeWhitespace(process.env.MONGODB_HOST || "127.0.0.1:27017") || "127.0.0.1:27017";
  const dbName = explicitDbName || DEFAULT_DB_NAME;
  const username = normalizeWhitespace(process.env.MONGODB_USERNAME || process.env.MONGO_USER || "");
  const password = process.env.MONGODB_PASSWORD || process.env.MONGO_PASSWORD || "";
  const authSource = normalizeWhitespace(process.env.MONGODB_AUTH_SOURCE || "");
  const params = normalizeWhitespace(process.env.MONGODB_PARAMS || "");

  if (password && !username) {
    throw new Error("MONGODB_USERNAME is required when MONGODB_PASSWORD is set.");
  }

  const credentials = username
    ? password
      ? `${encodeURIComponent(username)}:${encodeURIComponent(password)}@`
      : `${encodeURIComponent(username)}@`
    : "";
  const query = new URLSearchParams(params);

  if (credentials && authSource && !query.has("authSource")) {
    query.set("authSource", authSource);
  }

  const queryString = query.toString();
  const uri =
    `${scheme}://${credentials}${host}/${encodeURIComponent(dbName)}` +
    (queryString ? `?${queryString}` : "");

  return { uri, dbName };
}

export async function ensureIndexes(db) {
  await Promise.all([
    db.collection(COLLECTIONS.appMeta).createIndex({ key: 1 }, { unique: true }),
    db.collection(COLLECTIONS.counters).createIndex({ name: 1 }, { unique: true }),
    db.collection(COLLECTIONS.suppliers).createIndex({ id: 1 }, { unique: true }),
    db.collection(COLLECTIONS.suppliers).createIndex({ normalized_name: 1 }, { unique: true }),
    db.collection(COLLECTIONS.products).createIndex({ id: 1 }, { unique: true }),
    db.collection(COLLECTIONS.products).createIndex({ normalized_name: 1 }, { unique: true }),
    db.collection(COLLECTIONS.supplierEntries).createIndex({ id: 1 }, { unique: true }),
    db.collection(COLLECTIONS.supplierEntries).createIndex({ supplier_id: 1, event_date: -1 }),
    db.collection(COLLECTIONS.sales).createIndex({ id: 1 }, { unique: true }),
    db.collection(COLLECTIONS.sales).createIndex({ product_id: 1, sold_on: -1 }),
    db.collection(COLLECTIONS.stockEvents).createIndex({ id: 1 }, { unique: true }),
    db.collection(COLLECTIONS.stockEvents).createIndex({ product_id: 1, event_date: -1 }),
  ]);
}

export async function getMetaValue(db, key) {
  const doc = await db.collection(COLLECTIONS.appMeta).findOne(
    { key },
    { projection: { _id: 0, value: 1 } },
  );
  return doc?.value ?? null;
}

export async function setMetaValue(db, key, value) {
  await db.collection(COLLECTIONS.appMeta).updateOne(
    { key },
    { $set: { key, value } },
    { upsert: true },
  );
}

export async function getNextSequence(db, name) {
  const doc = await db.collection(COLLECTIONS.counters).findOneAndUpdate(
    { name },
    { $inc: { value: 1 }, $setOnInsert: { name } },
    {
      upsert: true,
      returnDocument: "after",
      projection: { _id: 0, value: 1 },
    },
  );

  return Number(doc?.value ?? 1);
}

async function setCounterValue(db, name, value) {
  await db.collection(COLLECTIONS.counters).updateOne(
    { name },
    { $set: { name, value: Number(value || 0) } },
    { upsert: true },
  );
}

function maxId(rows) {
  return rows.reduce((highest, row) => Math.max(highest, Number(row.id || 0)), 0);
}

function hasLegacySqliteDatabase() {
  return fs.existsSync(LEGACY_SQLITE_PATH) && fs.statSync(LEGACY_SQLITE_PATH).size > 0;
}

function readLegacyTable(sqlite, sql) {
  try {
    return toSerializable(sqlite.prepare(sql).all());
  } catch {
    return [];
  }
}

export async function migrateLegacySqliteDatabase(db) {
  if (!hasLegacySqliteDatabase()) {
    return null;
  }

  const sqlite = new DatabaseSync(LEGACY_SQLITE_PATH);

  try {
    const appMeta = readLegacyTable(sqlite, "SELECT key, value FROM app_meta");
    const suppliers = readLegacyTable(sqlite, "SELECT * FROM suppliers");
    const products = readLegacyTable(sqlite, "SELECT * FROM products");
    const supplierEntries = readLegacyTable(sqlite, "SELECT * FROM supplier_entries");
    const sales = readLegacyTable(sqlite, "SELECT * FROM sales");
    const stockEvents = readLegacyTable(sqlite, "SELECT * FROM stock_events");
    const hasData = [appMeta, suppliers, products, supplierEntries, sales, stockEvents].some(
      (rows) => rows.length > 0,
    );

    if (!hasData) {
      return null;
    }

    if (appMeta.length) await db.collection(COLLECTIONS.appMeta).insertMany(appMeta, { ordered: true });
    if (suppliers.length) await db.collection(COLLECTIONS.suppliers).insertMany(suppliers, { ordered: true });
    if (products.length) await db.collection(COLLECTIONS.products).insertMany(products, { ordered: true });
    if (supplierEntries.length) {
      await db.collection(COLLECTIONS.supplierEntries).insertMany(supplierEntries, { ordered: true });
    }
    if (sales.length) await db.collection(COLLECTIONS.sales).insertMany(sales, { ordered: true });
    if (stockEvents.length) {
      await db.collection(COLLECTIONS.stockEvents).insertMany(stockEvents, { ordered: true });
    }

    await Promise.all([
      setCounterValue(db, "suppliers", maxId(suppliers)),
      setCounterValue(db, "products", maxId(products)),
      setCounterValue(db, "supplier_entries", maxId(supplierEntries)),
      setCounterValue(db, "sales", maxId(sales)),
      setCounterValue(db, "stock_events", maxId(stockEvents)),
    ]);

    await setMetaValue(db, "migrated_from_sqlite_at", nowIso());

    if (!(await getMetaValue(db, "seed_counts"))) {
      await setMetaValue(db, "seed_counts", {
        products: products.length,
        supplierEntries: supplierEntries.length,
      });
    }

    return {
      migrated: true,
      suppliers: suppliers.length,
      products: products.length,
      supplierEntries: supplierEntries.length,
      sales: sales.length,
    };
  } finally {
    sqlite.close();
  }
}

export async function ensureSeeded(db, seedDatabase) {
  const seeded = await getMetaValue(db, "seeded_at");

  if (seeded) {
    return { skipped: true };
  }

  if (!envFlagEnabled(process.env.MONGODB_SKIP_SQLITE_MIGRATION)) {
    const migrationResult = await migrateLegacySqliteDatabase(db);

    if (migrationResult) {
      return migrationResult;
    }
  }

  return seedDatabase(db);
}

export async function fetchSuppliers(db) {
  return db.collection(COLLECTIONS.suppliers).find({}, { projection: { _id: 0 } }).toArray();
}

export async function fetchProducts(db) {
  return db.collection(COLLECTIONS.products).find({}, { projection: { _id: 0 } }).toArray();
}

export async function fetchSales(db) {
  return db.collection(COLLECTIONS.sales).find({}, { projection: { _id: 0 } }).toArray();
}

export async function fetchSupplierEntries(db, filter = {}) {
  return db
    .collection(COLLECTIONS.supplierEntries)
    .find(filter, { projection: { _id: 0 } })
    .toArray();
}
