import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { MongoClient } from "mongodb";
import { seedDatabase } from "./importer.js";
import {
  ensureIndexes,
  ensureSeeded,
  resolveMongoSettings,
  toSerializable,
} from "./mongo-common.js";

const __filename = fileURLToPath(import.meta.url);
const APP_DIR = path.resolve(path.dirname(__filename), "..");

try {
  process.loadEnvFile(path.join(APP_DIR, ".env"));
} catch (error) {
  if (error.code !== "ENOENT") {
    throw error;
  }
}
export {
  addPayment,
  addProduct,
  addPurchase,
  addSale,
  addStockAdjustment,
  getBootstrapData,
  getDashboardData,
  getSupplierDetails,
  listProducts,
  listSales,
  listSuppliers,
  updateProductReorderLevel,
} from "./mongo-ops.js";

export async function initDatabase() {
  const settings = resolveMongoSettings();
  const client = new MongoClient(settings.uri);
  await client.connect();

  const db = client.db(settings.dbName);
  await ensureIndexes(db);
  const seedResult = await ensureSeeded(db, seedDatabase);

  return {
    client,
    db,
    dbName: settings.dbName,
    seedResult: toSerializable(seedResult),
  };
}
