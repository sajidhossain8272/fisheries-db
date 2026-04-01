import {
  COLLECTIONS,
  compareEventRowsDesc,
  fetchProducts,
  fetchSales,
  fetchSupplierEntries,
  fetchSuppliers,
  getMetaValue,
  getNextSequence,
  parseSeedCounts,
  requireDate,
  requireNonNegativeNumber,
  requirePositiveNumber,
  toSerializable,
} from "./mongo-common.js";
import {
  buildDashboardDataView,
  buildProductRows,
  buildRecentSalesRows,
  buildSupplierRows,
  buildSupplierStats,
} from "./mongo-views.js";
import { firstDefined, normalizeKey, normalizeWhitespace, nowIso, roundCurrency } from "./utils.js";

async function getSupplierById(db, supplierId) {
  const supplier = await db.collection(COLLECTIONS.suppliers).findOne(
    { id: Number(supplierId) },
    { projection: { _id: 0 } },
  );

  if (!supplier) {
    throw new Error("Supplier not found.");
  }

  return supplier;
}

async function getProductById(db, productId) {
  const product = await db.collection(COLLECTIONS.products).findOne(
    { id: Number(productId) },
    { projection: { _id: 0 } },
  );

  if (!product) {
    throw new Error("Product not found.");
  }

  return product;
}

async function insertStockEvent(db, payload) {
  const id = await getNextSequence(db, "stock_events");
  const document = {
    id,
    product_id: payload.productId,
    supplier_entry_id: firstDefined(payload.supplierEntryId, null),
    sale_id: firstDefined(payload.saleId, null),
    event_type: payload.eventType,
    source_type: payload.sourceType,
    event_date: payload.eventDate,
    quantity_delta: payload.quantityDelta,
    unit_cost: firstDefined(payload.unitCost, null),
    unit_price: firstDefined(payload.unitPrice, null),
    other_cost: firstDefined(payload.otherCost, null),
    note: payload.note || null,
    created_at: payload.createdAt,
  };

  await db.collection(COLLECTIONS.stockEvents).insertOne(document);
  return document;
}

async function createOrUpdateProduct(db, input, options = {}) {
  const name = normalizeWhitespace(input.name);

  if (!name) {
    throw new Error("Product name is required.");
  }

  const normalizedName = normalizeKey(name);
  const productsCollection = db.collection(COLLECTIONS.products);
  const existing = await productsCollection.findOne(
    { normalized_name: normalizedName },
    { projection: { _id: 0 } },
  );
  const timestamp = nowIso();
  const sourceType = options.sourceType ?? "manual";
  const reorderLevel =
    input.reorderLevel === undefined || input.reorderLevel === null || input.reorderLevel === ""
      ? null
      : requireNonNegativeNumber(input.reorderLevel, "Reorder level");
  const purchasePrice =
    input.defaultPurchasePrice === undefined ||
    input.defaultPurchasePrice === null ||
    input.defaultPurchasePrice === ""
      ? null
      : requireNonNegativeNumber(input.defaultPurchasePrice, "Purchase price");
  const salePrice =
    input.defaultSalePrice === undefined || input.defaultSalePrice === null || input.defaultSalePrice === ""
      ? null
      : requireNonNegativeNumber(input.defaultSalePrice, "Sale price");
  const otherCost =
    input.defaultOtherCost === undefined || input.defaultOtherCost === null || input.defaultOtherCost === ""
      ? null
      : requireNonNegativeNumber(input.defaultOtherCost, "Other cost");
  const notes = input.notes === undefined ? undefined : normalizeWhitespace(input.notes || "");

  if (existing) {
    await productsCollection.updateOne(
      { id: existing.id },
      {
        $set: {
          name,
          reorder_level: reorderLevel ?? existing.reorder_level,
          default_purchase_price: purchasePrice ?? existing.default_purchase_price,
          default_sale_price: salePrice ?? existing.default_sale_price,
          default_other_cost: otherCost ?? existing.default_other_cost,
          notes: notes === undefined ? existing.notes : notes || null,
          updated_at: timestamp,
        },
      },
    );

    return getProductById(db, existing.id);
  }

  const id = await getNextSequence(db, "products");
  const document = {
    id,
    name,
    normalized_name: normalizedName,
    current_stock: 0,
    reorder_level: reorderLevel ?? 0,
    default_purchase_price: purchasePrice,
    default_sale_price: salePrice,
    default_other_cost: otherCost,
    notes: notes || null,
    source_type: sourceType,
    created_at: timestamp,
    updated_at: timestamp,
  };

  await productsCollection.insertOne(document);
  return getProductById(db, id);
}

async function resolveProduct(db, payload) {
  if (payload.productId) {
    return getProductById(db, Number(payload.productId));
  }

  if (payload.productName) {
    return createOrUpdateProduct(
      db,
      {
        name: payload.productName,
        reorderLevel: payload.reorderLevel,
        defaultPurchasePrice: payload.rate,
        defaultSalePrice: payload.salePrice,
        defaultOtherCost: payload.otherCost,
      },
      { sourceType: "manual" },
    );
  }

  throw new Error("A product selection is required.");
}

export async function getBootstrapData(db) {
  const [suppliers, products, sales, supplierEntries, seededAt, seedCounts] = await Promise.all([
    fetchSuppliers(db),
    fetchProducts(db),
    fetchSales(db),
    fetchSupplierEntries(db, { event_type: { $ne: "summary" } }),
    getMetaValue(db, "seeded_at"),
    getMetaValue(db, "seed_counts"),
  ]);

  return toSerializable({
    dashboard: buildDashboardDataView(suppliers, products, sales, supplierEntries),
    suppliers: buildSupplierRows(suppliers, supplierEntries),
    products: buildProductRows(products, sales),
    recentSales: buildRecentSalesRows(products, sales, 20),
    meta: {
      dbPath: db.databaseName,
      seededAt: seededAt ?? null,
      seedCounts: parseSeedCounts(seedCounts),
    },
  });
}

export async function getDashboardData(db) {
  const [suppliers, products, sales, supplierEntries] = await Promise.all([
    fetchSuppliers(db),
    fetchProducts(db),
    fetchSales(db),
    fetchSupplierEntries(db, { event_type: { $ne: "summary" } }),
  ]);

  return toSerializable(buildDashboardDataView(suppliers, products, sales, supplierEntries));
}

export async function listSuppliers(db) {
  const [suppliers, supplierEntries] = await Promise.all([
    fetchSuppliers(db),
    fetchSupplierEntries(db, { event_type: { $ne: "summary" } }),
  ]);

  return toSerializable(buildSupplierRows(suppliers, supplierEntries));
}

export async function getSupplierDetails(db, supplierId) {
  const supplier = await getSupplierById(db, Number(supplierId));
  const [entries, products] = await Promise.all([
    fetchSupplierEntries(db, { supplier_id: Number(supplierId) }),
    fetchProducts(db),
  ]);
  const productMap = new Map(products.map((product) => [product.id, product.name]));
  const summary = buildSupplierStats(entries.filter((entry) => entry.event_type !== "summary")).get(supplier.id);
  const detailedEntries = [...entries]
    .sort((left, right) => compareEventRowsDesc(left, right, "event_date"))
    .slice(0, 250)
    .map((entry) => ({
      id: entry.id,
      event_type: entry.event_type,
      source_type: entry.source_type,
      source_sheet: entry.source_sheet || null,
      event_date: entry.event_date || null,
      raw_date: entry.raw_date || null,
      description: entry.description || null,
      size: entry.size || null,
      packet: entry.packet || null,
      quantity: firstDefined(entry.quantity, null),
      rate: firstDefined(entry.rate, null),
      purchase_total: firstDefined(entry.purchase_total, null),
      payment_amount: firstDefined(entry.payment_amount, null),
      balance_note: entry.balance_note || null,
      note: entry.note || null,
      product_name: entry.product_id ? productMap.get(entry.product_id) || null : null,
    }));

  return toSerializable({
    supplier: {
      id: supplier.id,
      name: supplier.name,
      total_charges: roundCurrency(summary?.totalCharges || 0),
      total_payments: roundCurrency(summary?.totalPayments || 0),
      outstanding: roundCurrency(summary?.outstanding || 0),
    },
    entries: detailedEntries,
  });
}

export async function listProducts(db) {
  const [products, sales] = await Promise.all([fetchProducts(db), fetchSales(db)]);
  return toSerializable(buildProductRows(products, sales));
}

export async function listSales(db, limit = 30) {
  const [products, sales] = await Promise.all([fetchProducts(db), fetchSales(db)]);
  return toSerializable(buildRecentSalesRows(products, sales, limit));
}

export async function addProduct(db, payload) {
  return toSerializable(await createOrUpdateProduct(db, payload, { sourceType: "manual" }));
}

export async function updateProductReorderLevel(db, productId, payload) {
  const product = await getProductById(db, Number(productId));
  const reorderLevel = requireNonNegativeNumber(payload.reorderLevel, "Reorder level");
  const timestamp = nowIso();

  await db.collection(COLLECTIONS.products).updateOne(
    { id: product.id },
    { $set: { reorder_level: reorderLevel, updated_at: timestamp } },
  );

  return toSerializable(await getProductById(db, product.id));
}

export async function addPurchase(db, payload) {
  const supplierId = Number(payload.supplierId);
  await getSupplierById(db, supplierId);

  const product = await resolveProduct(db, payload);
  const purchasedOn = requireDate(payload.purchasedOn, "Purchase date");
  const quantity = requirePositiveNumber(payload.quantity, "Quantity");
  const rateInput = payload.rate === undefined || payload.rate === null || payload.rate === ""
    ? null
    : requirePositiveNumber(payload.rate, "Rate");
  const totalInput = payload.totalAmount === undefined || payload.totalAmount === null || payload.totalAmount === ""
    ? null
    : requirePositiveNumber(payload.totalAmount, "Total amount");
  const totalAmount = totalInput ?? (rateInput !== null ? roundCurrency(quantity * rateInput) : null);

  if (totalAmount === null) {
    throw new Error("Provide either rate or total amount.");
  }

  const rate = rateInput ?? roundCurrency(totalAmount / quantity);
  const createdAt = nowIso();
  const description = normalizeWhitespace(payload.description) || product.name;
  const size = normalizeWhitespace(payload.size || "");
  const packet = normalizeWhitespace(payload.packet || "");
  const note = normalizeWhitespace(payload.note || "");
  const entryId = await getNextSequence(db, "supplier_entries");

  await db.collection(COLLECTIONS.supplierEntries).insertOne({
    id: entryId,
    supplier_id: supplierId,
    product_id: product.id,
    event_type: "purchase",
    source_type: "manual",
    source_sheet: null,
    event_date: purchasedOn,
    raw_date: purchasedOn,
    description,
    size: size || null,
    packet: packet || null,
    quantity,
    rate,
    purchase_total: totalAmount,
    payment_amount: null,
    balance_note: null,
    note: note || null,
    raw_payload: null,
    created_at: createdAt,
  });

  await insertStockEvent(db, {
    productId: product.id,
    supplierEntryId: entryId,
    saleId: null,
    eventType: "purchase",
    sourceType: "manual",
    eventDate: purchasedOn,
    quantityDelta: quantity,
    unitCost: rate,
    unitPrice: null,
    otherCost: null,
    note: note || `Purchased from supplier #${supplierId}.`,
    createdAt,
  });

  await db.collection(COLLECTIONS.products).updateOne(
    { id: product.id },
    {
      $inc: { current_stock: quantity },
      $set: { default_purchase_price: rate, updated_at: createdAt },
    },
  );

  return toSerializable({
    product: await getProductById(db, product.id),
    supplier: await getSupplierDetails(db, supplierId),
  });
}

export async function addPayment(db, payload) {
  const supplierId = Number(payload.supplierId);
  await getSupplierById(db, supplierId);

  const paidOn = requireDate(payload.paidOn, "Payment date");
  const amount = requirePositiveNumber(payload.amount, "Payment amount");
  const description = normalizeWhitespace(payload.description || "");
  const note = normalizeWhitespace(payload.note || "");
  const createdAt = nowIso();

  await db.collection(COLLECTIONS.supplierEntries).insertOne({
    id: await getNextSequence(db, "supplier_entries"),
    supplier_id: supplierId,
    product_id: null,
    event_type: "payment",
    source_type: "manual",
    source_sheet: null,
    event_date: paidOn,
    raw_date: paidOn,
    description: description || "Manual payment",
    size: null,
    packet: null,
    quantity: null,
    rate: null,
    purchase_total: null,
    payment_amount: amount,
    balance_note: null,
    note: note || null,
    raw_payload: null,
    created_at: createdAt,
  });

  return toSerializable(await getSupplierDetails(db, supplierId));
}

export async function addStockAdjustment(db, productId, payload) {
  const product = await getProductById(db, Number(productId));
  const type = normalizeWhitespace(payload.type || "");
  const quantity = requirePositiveNumber(payload.quantity, "Adjustment quantity");
  const adjustedOn = requireDate(payload.adjustedOn, "Adjustment date");
  const note = normalizeWhitespace(payload.note || "");
  const direction = normalizeWhitespace(payload.direction || "").toLowerCase();

  if (!["adjustment", "wastage", "donation"].includes(type)) {
    throw new Error("Invalid adjustment type.");
  }

  let quantityDelta = 0;

  if (type === "adjustment") {
    if (!["add", "remove"].includes(direction)) {
      throw new Error("Adjustment direction must be add or remove.");
    }

    quantityDelta = direction === "add" ? quantity : -quantity;
  } else {
    quantityDelta = -quantity;
  }

  if (Number(product.current_stock || 0) + quantityDelta < 0) {
    throw new Error("Adjustment would reduce stock below zero.");
  }

  const createdAt = nowIso();

  await insertStockEvent(db, {
    productId: product.id,
    supplierEntryId: null,
    saleId: null,
    eventType: type,
    sourceType: "manual",
    eventDate: adjustedOn,
    quantityDelta,
    unitCost: null,
    unitPrice: null,
    otherCost: null,
    note: note || `Manual ${type}.`,
    createdAt,
  });

  await db.collection(COLLECTIONS.products).updateOne(
    { id: product.id },
    { $inc: { current_stock: quantityDelta }, $set: { updated_at: createdAt } },
  );

  return toSerializable(await getProductById(db, product.id));
}

export async function addSale(db, payload) {
  const product = await getProductById(db, Number(payload.productId));
  const soldOn = requireDate(payload.soldOn, "Sale date");
  const quantity = requirePositiveNumber(payload.quantity, "Sale quantity");
  const salePrice = requirePositiveNumber(payload.salePrice, "Sale price");
  const unitCost = payload.unitCost === undefined || payload.unitCost === null || payload.unitCost === ""
    ? firstDefined(product.default_purchase_price, 0)
    : requireNonNegativeNumber(payload.unitCost, "Cost price");
  const otherCost = payload.otherCost === undefined || payload.otherCost === null || payload.otherCost === ""
    ? firstDefined(product.default_other_cost, 0)
    : requireNonNegativeNumber(payload.otherCost, "Other cost");
  const note = normalizeWhitespace(payload.note || "");

  if (Number(product.current_stock || 0) < quantity) {
    throw new Error("Not enough stock on hand for this sale.");
  }

  const revenue = roundCurrency(quantity * salePrice);
  const totalCost = roundCurrency(quantity * unitCost + otherCost);
  const netProfit = roundCurrency(revenue - totalCost);
  const createdAt = nowIso();
  const saleId = await getNextSequence(db, "sales");

  await db.collection(COLLECTIONS.sales).insertOne({
    id: saleId,
    product_id: product.id,
    sold_on: soldOn,
    quantity,
    sale_price: salePrice,
    unit_cost: unitCost,
    other_cost: otherCost,
    revenue,
    total_cost: totalCost,
    net_profit: netProfit,
    note: note || null,
    created_at: createdAt,
  });

  await insertStockEvent(db, {
    productId: product.id,
    supplierEntryId: null,
    saleId,
    eventType: "sale",
    sourceType: "manual",
    eventDate: soldOn,
    quantityDelta: -quantity,
    unitCost,
    unitPrice: salePrice,
    otherCost,
    note: note || "Recorded sale.",
    createdAt,
  });

  await db.collection(COLLECTIONS.products).updateOne(
    { id: product.id },
    {
      $inc: { current_stock: -quantity },
      $set: { default_sale_price: salePrice, updated_at: createdAt },
    },
  );

  return toSerializable({
    id: saleId,
    product_id: product.id,
    product_name: product.name,
    sold_on: soldOn,
    quantity,
    sale_price: salePrice,
    unit_cost: unitCost,
    other_cost: otherCost,
    revenue,
    total_cost: totalCost,
    net_profit: netProfit,
    note: note || null,
    created_at: createdAt,
  });
}
