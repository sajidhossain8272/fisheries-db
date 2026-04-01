import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  COLLECTIONS,
  getNextSequence,
  setMetaValue,
} from "./mongo-common.js";
import {
  buildImportedLabel,
  cleanText,
  firstDefined,
  normalizeKey,
  normalizeWhitespace,
  nowIso,
  parseCsv,
  parseLooseDate,
  parseNumber,
  roundCurrency,
} from "./utils.js";

const KITCHEN_SKIP_NAMES = new Set(["à¦¡à¦¿à¦‰ à¦¬à¦¿à¦² à¦¹à¦¿à¦¸à¦¾à¦¬", "à¦¤à¦¾à¦°à¦¿à¦–"]);
const __filename = fileURLToPath(import.meta.url);
const APP_DIR = path.resolve(path.dirname(__filename), "..");
const REPO_DIR = path.resolve(APP_DIR, "..");

function resolveDefaultSeedPath(relativePath) {
  const candidates = [
    path.join(APP_DIR, "data", relativePath),
    path.join(APP_DIR, "public", relativePath),
    path.join(REPO_DIR, "public", relativePath),
  ];

  return candidates.find((candidate) => fs.existsSync(candidate)) ?? candidates[0];
}

function ensureSeedFileExists(filePath, envName) {
  if (fs.existsSync(filePath)) {
    return;
  }

  throw new Error(
    `Seed file not found at ${filePath}. Set ${envName} to a valid CSV path or start with an already-seeded MongoDB database.`,
  );
}

function resolveSeedPaths() {
  return {
    kitchenCsvPath:
      process.env.KITCHEN_CSV_PATH ??
      resolveDefaultSeedPath("cleaned_kitchen_sales.csv"),
    supplierCsvPath:
      process.env.SUPPLIER_CSV_PATH ??
      resolveDefaultSeedPath("cleaned_supplier_ledger.csv"),
  };
}

function shouldSkipKitchenRow(row) {
  const productName = normalizeWhitespace(row.Product_Name);

  if (!productName) {
    return true;
  }

  if (KITCHEN_SKIP_NAMES.has(productName)) {
    return true;
  }

  if (parseLooseDate(productName)) {
    return true;
  }

  return false;
}

function aggregateKitchenSeeds(rows) {
  const seeds = new Map();

  for (const row of rows) {
    if (shouldSkipKitchenRow(row)) {
      continue;
    }

    const productName = normalizeWhitespace(row.Product_Name);
    const key = normalizeKey(productName);
    const purchaseQty = parseNumber(row.Purchase_Qty);
    const purchasePrice = parseNumber(row.Purchase_Price);
    const purchaseTotal = parseNumber(row.Purchase_Total);
    const stock = parseNumber(row.Stock);
    const salePrice = parseNumber(row.Sale_Price);
    const otherCost = parseNumber(row.Other_Cost);
    const effectivePurchasePrice =
      purchasePrice ??
      (purchaseQty && purchaseTotal ? roundCurrency(purchaseTotal / purchaseQty) : null);

    const seed =
      seeds.get(key) ??
      {
        name: productName,
        currentStock: null,
        defaultPurchasePrice: null,
        defaultSalePrice: null,
        defaultOtherCost: null,
      };

    seed.name = seed.name || productName;

    if (stock !== null) {
      seed.currentStock = Math.max(seed.currentStock ?? 0, stock);
    }

    if (effectivePurchasePrice !== null) {
      seed.defaultPurchasePrice = effectivePurchasePrice;
    }

    if (salePrice !== null) {
      seed.defaultSalePrice = salePrice;
    }

    if (otherCost !== null) {
      seed.defaultOtherCost = otherCost;
    }

    seeds.set(key, seed);
  }

  return [...seeds.entries()].map(([normalizedName, seed]) => ({
    ...seed,
    normalizedName,
    reorderLevel:
      seed.currentStock && seed.currentStock > 0
        ? Math.min(5, Math.max(1, Math.ceil(seed.currentStock * 0.25)))
        : 0,
  }));
}

function isSummarySupplierRow(row) {
  const weight = normalizeKey(row.Weight);
  const packet = normalizeKey(row.Packet);
  return weight.startsWith("total") || packet.startsWith("total");
}

function buildSupplierSeedEntries(rows) {
  const entries = [];

  for (const row of rows) {
    const supplierName = normalizeWhitespace(row.Party_Name);

    if (!supplierName) {
      continue;
    }

    const purchaseDate = parseLooseDate(row.Date);
    const paymentDate = parseLooseDate(row.Payment_Date);
    const description = normalizeWhitespace(row.Description);
    const size = normalizeWhitespace(row.Size);
    const packet = normalizeWhitespace(row.Packet);
    const quantity = parseNumber(row.Weight);
    const rate = parseNumber(row.Rate);
    const purchaseTotal = parseNumber(row.Total_Taka);
    const paymentAmount = parseNumber(row.Payment_Amount);
    const balanceNote = normalizeWhitespace(row.Balance);
    const sourceSheet = normalizeWhitespace(row.Source_Sheet);
    const rawPayload = JSON.stringify(row);
    const label = buildImportedLabel({ description, size, packet });
    const now = nowIso();

    if (isSummarySupplierRow(row)) {
      entries.push({
        supplierName,
        eventType: "summary",
        sourceSheet,
        eventDate: paymentDate ?? purchaseDate,
        rawDate: cleanText(row.Payment_Date || row.Date),
        description: label || "Imported summary row",
        size,
        packet,
        quantity,
        rate,
        purchaseTotal,
        paymentAmount,
        balanceNote,
        note: "Summary row kept for reference only.",
        rawPayload,
        createdAt: now,
      });
      continue;
    }

    const looksLikeCharge =
      !description &&
      !purchaseDate &&
      purchaseTotal !== null &&
      Boolean(packet || size || balanceNote);

    const shouldInsertPurchase =
      purchaseTotal !== null && Boolean(description || purchaseDate || quantity !== null || rate !== null);

    if (shouldInsertPurchase || looksLikeCharge) {
      entries.push({
        supplierName,
        eventType: looksLikeCharge ? "charge" : "purchase",
        sourceSheet,
        eventDate: purchaseDate,
        rawDate: cleanText(row.Date),
        description:
          description ||
          packet ||
          size ||
          (looksLikeCharge ? "Imported charge" : "Imported purchase"),
        size,
        packet,
        quantity,
        rate,
        purchaseTotal,
        paymentAmount: null,
        balanceNote,
        note: looksLikeCharge ? "Imported extra charge row." : "Imported purchase row.",
        rawPayload,
        createdAt: now,
      });
    }

    const looksEmbeddedCounter =
      paymentDate === null &&
      purchaseDate !== null &&
      paymentAmount !== null &&
      (paymentAmount < 100 || paymentAmount === quantity || paymentAmount === parseNumber(row.Packet));

    const shouldInsertPayment =
      paymentAmount !== null &&
      !looksEmbeddedCounter &&
      (paymentDate !== null || (!purchaseDate && !description) || paymentAmount >= 100);

    if (shouldInsertPayment) {
      entries.push({
        supplierName,
        eventType: "payment",
        sourceSheet,
        eventDate: paymentDate,
        rawDate: cleanText(row.Payment_Date),
        description: description || "Imported payment",
        size,
        packet,
        quantity: null,
        rate: null,
        purchaseTotal: null,
        paymentAmount,
        balanceNote,
        note: "Imported payment row.",
        rawPayload,
        createdAt: now,
      });
    }
  }

  return entries;
}

export async function seedDatabase(db) {
  const { kitchenCsvPath, supplierCsvPath } = resolveSeedPaths();
  ensureSeedFileExists(kitchenCsvPath, "KITCHEN_CSV_PATH");
  ensureSeedFileExists(supplierCsvPath, "SUPPLIER_CSV_PATH");
  const kitchenRows = parseCsv(kitchenCsvPath);
  const supplierRows = parseCsv(supplierCsvPath);
  const kitchenSeeds = aggregateKitchenSeeds(kitchenRows);
  const supplierSeeds = buildSupplierSeedEntries(supplierRows);
  const seedDate = nowIso().slice(0, 10);
  const productDocs = [];
  const stockEventDocs = [];
  const supplierDocs = [];
  const supplierEntryDocs = [];
  const supplierCache = new Map();

  for (const seed of kitchenSeeds) {
    const createdAt = nowIso();
    const productId = await getNextSequence(db, "products");

    productDocs.push({
      id: productId,
      name: seed.name,
      normalized_name: seed.normalizedName,
      current_stock: seed.currentStock ?? 0,
      reorder_level: seed.reorderLevel,
      default_purchase_price: seed.defaultPurchasePrice,
      default_sale_price: seed.defaultSalePrice,
      default_other_cost: seed.defaultOtherCost,
      notes: "Seeded from cleaned_kitchen_sales.csv",
      source_type: "seed",
      created_at: createdAt,
      updated_at: createdAt,
    });

    if (seed.currentStock && seed.currentStock > 0) {
      stockEventDocs.push({
        id: await getNextSequence(db, "stock_events"),
        product_id: productId,
        supplier_entry_id: null,
        sale_id: null,
        event_type: "seed_stock",
        source_type: "seed",
        event_date: seedDate,
        quantity_delta: seed.currentStock,
        unit_cost: seed.defaultPurchasePrice,
        unit_price: seed.defaultSalePrice,
        other_cost: seed.defaultOtherCost,
        note: "Imported opening stock from kitchen sheet.",
        created_at: createdAt,
      });
    }
  }

  for (const entry of supplierSeeds) {
    const normalizedSupplier = normalizeKey(entry.supplierName);
    let supplierId = supplierCache.get(normalizedSupplier);

    if (!supplierId) {
      supplierId = await getNextSequence(db, "suppliers");
      supplierCache.set(normalizedSupplier, supplierId);
      supplierDocs.push({
        id: supplierId,
        name: entry.supplierName,
        normalized_name: normalizedSupplier,
        created_at: entry.createdAt,
      });
    }

    supplierEntryDocs.push({
      id: await getNextSequence(db, "supplier_entries"),
      supplier_id: supplierId,
      product_id: null,
      event_type: entry.eventType,
      source_type: "seed",
      source_sheet: entry.sourceSheet || null,
      event_date: firstDefined(entry.eventDate, null),
      raw_date: entry.rawDate || null,
      description: entry.description || null,
      size: entry.size || null,
      packet: entry.packet || null,
      quantity: entry.quantity,
      rate: entry.rate,
      purchase_total: entry.purchaseTotal,
      payment_amount: entry.paymentAmount,
      balance_note: entry.balanceNote || null,
      note: entry.note || null,
      raw_payload: entry.rawPayload,
      created_at: entry.createdAt,
    });
  }

  if (productDocs.length) {
    await db.collection(COLLECTIONS.products).insertMany(productDocs, { ordered: true });
  }

  if (stockEventDocs.length) {
    await db.collection(COLLECTIONS.stockEvents).insertMany(stockEventDocs, { ordered: true });
  }

  if (supplierDocs.length) {
    await db.collection(COLLECTIONS.suppliers).insertMany(supplierDocs, { ordered: true });
  }

  if (supplierEntryDocs.length) {
    await db.collection(COLLECTIONS.supplierEntries).insertMany(supplierEntryDocs, { ordered: true });
  }

  await Promise.all([
    setMetaValue(db, "seeded_at", nowIso()),
    setMetaValue(db, "seed_kitchen_csv", kitchenCsvPath),
    setMetaValue(db, "seed_supplier_csv", supplierCsvPath),
    setMetaValue(db, "seed_counts", {
      products: kitchenSeeds.length,
      supplierEntries: supplierSeeds.length,
    }),
  ]);

  return {
    products: kitchenSeeds.length,
    supplierEntries: supplierSeeds.length,
    suppliers: supplierCache.size,
  };
}
