import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  addPayment,
  addProduct,
  addPurchase,
  addSale,
  addStockAdjustment,
  getBootstrapData,
  getDashboardData,
  getSupplierDetails,
  initDatabase,
  listProducts,
  listSales,
  listSuppliers,
  updateProductReorderLevel,
} from "./db.js";

const __filename = fileURLToPath(import.meta.url);
const APP_DIR = path.resolve(path.dirname(__filename), "..");

const PUBLIC_DIR = path.join(APP_DIR, "public");
const HOST = String(process.env.HOST || "0.0.0.0").trim() || "0.0.0.0";
const PORT = resolvePort(process.env.PORT);
const BODY_SIZE_LIMIT = Number(process.env.BODY_SIZE_LIMIT || 1024 * 1024);
const STARTED_AT = new Date().toISOString();
const ROUTE_FILE_MAP = {
  "/": "index.html",
  "/overview": "index.html",
  "/suppliers": "suppliers.html",
  "/inventory": "inventory.html",
  "/sales": "sales.html",
};

const CONTENT_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

const { client, db, dbName, seedResult } = await initDatabase();

function resolvePort(rawValue) {
  const parsed = Number.parseInt(String(rawValue || ""), 10);
  return Number.isInteger(parsed) && parsed > 0 && parsed < 65536 ? parsed : 3000;
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

function sendError(response, statusCode, message) {
  sendJson(response, statusCode, { error: message });
}

function resolveErrorStatusCode(error) {
  if (Number.isInteger(error?.statusCode)) {
    return error.statusCode;
  }

  if (String(error?.name || "").startsWith("Mongo")) {
    return 503;
  }

  const message = String(error?.message || "").toLowerCase();

  if (message.includes("not found")) {
    return 404;
  }

  if (
    message.includes("invalid") ||
    message.includes("required") ||
    message.includes("must be") ||
    message.includes("too large") ||
    message.includes("provide either") ||
    message.includes("not enough stock") ||
    message.includes("reduce stock below zero")
  ) {
    return 400;
  }

  return 500;
}

function sendFile(response, filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const contentType = CONTENT_TYPES[extension] ?? "application/octet-stream";
  const file = fs.readFileSync(filePath);

  response.writeHead(200, {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
  });
  response.end(file);
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalBytes = 0;

    request.on("data", (chunk) => {
      totalBytes += chunk.length;

      if (totalBytes > BODY_SIZE_LIMIT) {
        reject(new Error("Request body is too large."));
        request.destroy();
        return;
      }

      chunks.push(chunk);
    });

    request.on("end", () => {
      if (!chunks.length) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(new Error("Invalid JSON body."));
      }
    });

    request.on("error", reject);
  });
}

function serveStatic(response, pathname) {
  const mappedFile = ROUTE_FILE_MAP[pathname] ?? pathname.replace(/^\/+/, "");
  const requestedPath = mappedFile || "index.html";
  const resolvedPath = path.normalize(path.join(PUBLIC_DIR, requestedPath));

  if (!resolvedPath.startsWith(PUBLIC_DIR)) {
    sendError(response, 403, "Forbidden.");
    return;
  }

  if (fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isFile()) {
    sendFile(response, resolvedPath);
    return;
  }

  const fallbackFile = path.join(PUBLIC_DIR, "index.html");

  if (fs.existsSync(fallbackFile)) {
    sendFile(response, fallbackFile);
    return;
  }

  sendError(response, 404, "Not found.");
}

async function handleApiRequest(request, response, pathname) {
  if ((pathname === "/api/health" || pathname === "/healthz" || pathname === "/readyz") && request.method === "GET") {
    await db.command({ ping: 1 });
    sendJson(response, 200, {
      status: "ok",
      database: dbName,
      startedAt: STARTED_AT,
      uptimeSeconds: Math.round(process.uptime()),
    });
    return;
  }

  if (pathname === "/api/bootstrap" && request.method === "GET") {
    sendJson(response, 200, await getBootstrapData(db));
    return;
  }

  if (pathname === "/api/dashboard" && request.method === "GET") {
    sendJson(response, 200, await getDashboardData(db));
    return;
  }

  if (pathname === "/api/suppliers" && request.method === "GET") {
    sendJson(response, 200, await listSuppliers(db));
    return;
  }

  const supplierMatch = pathname.match(/^\/api\/suppliers\/(\d+)$/);
  if (supplierMatch && request.method === "GET") {
    sendJson(response, 200, await getSupplierDetails(db, Number(supplierMatch[1])));
    return;
  }

  if (pathname === "/api/products" && request.method === "GET") {
    sendJson(response, 200, await listProducts(db));
    return;
  }

  if (pathname === "/api/products" && request.method === "POST") {
    const payload = await readJsonBody(request);
    sendJson(response, 201, await addProduct(db, payload));
    return;
  }

  const reorderMatch = pathname.match(/^\/api\/products\/(\d+)\/reorder-level$/);
  if (reorderMatch && request.method === "POST") {
    const payload = await readJsonBody(request);
    sendJson(
      response,
      200,
      await updateProductReorderLevel(db, Number(reorderMatch[1]), payload),
    );
    return;
  }

  const adjustmentMatch = pathname.match(/^\/api\/products\/(\d+)\/adjustments$/);
  if (adjustmentMatch && request.method === "POST") {
    const payload = await readJsonBody(request);
    sendJson(
      response,
      200,
      await addStockAdjustment(db, Number(adjustmentMatch[1]), payload),
    );
    return;
  }

  if (pathname === "/api/purchases" && request.method === "POST") {
    const payload = await readJsonBody(request);
    sendJson(response, 201, await addPurchase(db, payload));
    return;
  }

  if (pathname === "/api/payments" && request.method === "POST") {
    const payload = await readJsonBody(request);
    sendJson(response, 201, await addPayment(db, payload));
    return;
  }

  if (pathname === "/api/sales" && request.method === "GET") {
    sendJson(response, 200, await listSales(db, 40));
    return;
  }

  if (pathname === "/api/sales" && request.method === "POST") {
    const payload = await readJsonBody(request);
    sendJson(response, 201, await addSale(db, payload));
    return;
  }

  sendError(response, 404, "API route not found.");
}

const server = http.createServer(async (request, response) => {
  const baseUrl = `http://${request.headers.host || `${HOST}:${PORT}`}`;
  const url = new URL(request.url || "/", baseUrl);

  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  response.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()");

  try {
    if (url.pathname.startsWith("/api/")) {
      await handleApiRequest(request, response, url.pathname);
      return;
    }

    serveStatic(response, url.pathname);
  } catch (error) {
    const statusCode = resolveErrorStatusCode(error);
    const message =
      statusCode === 503
        ? "Database unavailable."
        : statusCode === 500
          ? "Unexpected server error."
          : error.message;
    sendError(response, statusCode, message || "Unexpected server error.");

    if (statusCode >= 500) {
      console.error(error);
    }
  }
});

server.headersTimeout = 60000;
server.requestTimeout = 60000;
server.keepAliveTimeout = 5000;

async function shutdown(signal) {
  console.log(`${signal} received, closing MongoDB connection.`);
  await client.close();
  server.close(() => process.exit(0));
}

process.on("SIGINT", () => {
  shutdown("SIGINT").catch((error) => {
    console.error(error);
    process.exit(1);
  });
});

process.on("SIGTERM", () => {
  shutdown("SIGTERM").catch((error) => {
    console.error(error);
    process.exit(1);
  });
});

server.listen(PORT, HOST, () => {
  const localHost = HOST === "0.0.0.0" ? "127.0.0.1" : HOST;
  const seedMessage = seedResult?.skipped
    ? "Existing MongoDB data detected."
    : seedResult?.migrated
      ? `Migrated SQLite data with ${seedResult.products} products and ${seedResult.supplierEntries} supplier entries.`
      : `Seeded MongoDB with ${seedResult.products} products and ${seedResult.supplierEntries} supplier entries.`;

  console.log(`Product management system listening on http://${localHost}:${PORT}`);
  console.log(`Bound host: ${HOST}`);
  console.log(`MongoDB database: ${dbName}`);
  console.log(seedMessage);
});
