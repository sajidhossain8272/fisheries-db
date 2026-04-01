const currencyFormatter = new Intl.NumberFormat("en-BD", {
  style: "currency",
  currency: "BDT",
  maximumFractionDigits: 2,
});

const numberFormatter = new Intl.NumberFormat("en-BD", {
  maximumFractionDigits: 2,
});

const state = {
  bootstrap: null,
  supplierDetail: null,
  selectedSupplierId: null,
  page: document.body.dataset.page || "overview",
};

document.addEventListener("DOMContentLoaded", () => {
  bindEvents();
  setActiveNavigation();
  setDefaultDates();
  refreshAll().catch((error) => showFlash(error.message, "error"));
});

function bindEvents() {
  document.addEventListener("click", handleModalClick);
  document.addEventListener("keydown", handleEscapeClose);

  const supplierList = document.getElementById("supplier-list");
  if (supplierList) {
    supplierList.addEventListener("click", handleSupplierSelection);
  }

  const purchaseForm = document.getElementById("purchase-form");
  if (purchaseForm) {
    purchaseForm.addEventListener("submit", handlePurchaseSubmit);
    purchaseForm.addEventListener("input", updatePurchaseEstimate);
  }

  const paymentForm = document.getElementById("payment-form");
  if (paymentForm) {
    paymentForm.addEventListener("submit", handlePaymentSubmit);
  }

  const productForm = document.getElementById("product-form");
  if (productForm) {
    productForm.addEventListener("submit", handleProductSubmit);
  }

  const adjustmentForm = document.getElementById("adjustment-form");
  if (adjustmentForm) {
    adjustmentForm.addEventListener("submit", handleAdjustmentSubmit);
  }

  const adjustmentType = document.getElementById("adjustment-type");
  if (adjustmentType) {
    adjustmentType.addEventListener("change", syncAdjustmentDirectionState);
  }

  const saleForm = document.getElementById("sale-form");
  if (saleForm) {
    saleForm.addEventListener("submit", handleSaleSubmit);
    saleForm.addEventListener("input", updateSaleEstimate);
  }

  const saleProduct = document.getElementById("sale-product");
  if (saleProduct) {
    saleProduct.addEventListener("change", updateSaleEstimate);
  }

  const productTable = document.getElementById("product-table-body");
  if (productTable) {
    productTable.addEventListener("submit", handleInlineReorderSubmit);
  }
}

function setActiveNavigation() {
  document.querySelectorAll("[data-nav-page]").forEach((link) => {
    link.classList.toggle("active", link.dataset.navPage === state.page);
  });
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "Request failed.");
  }

  return data;
}

async function refreshAll() {
  state.bootstrap = await api("/api/bootstrap");

  if (!state.selectedSupplierId) {
    state.selectedSupplierId = state.bootstrap.suppliers[0]?.id ?? null;
  }

  if (
    state.selectedSupplierId &&
    !state.bootstrap.suppliers.some((supplier) => supplier.id === state.selectedSupplierId)
  ) {
    state.selectedSupplierId = state.bootstrap.suppliers[0]?.id ?? null;
  }

  syncSelectOptions();
  renderChrome();
  renderOverviewPage();
  renderInventoryPage();
  renderSalesPage();

  if (hasElement("supplier-list")) {
    renderSupplierList();
    await refreshSupplierDetail();
  } else {
    state.supplierDetail = null;
  }

  setDefaultDates();
}

async function refreshSupplierDetail() {
  if (!state.selectedSupplierId || !hasElement("supplier-summary")) {
    state.supplierDetail = null;
    renderSupplierPage();
    return;
  }

  state.supplierDetail = await api(`/api/suppliers/${state.selectedSupplierId}`);
  syncSupplierDefaults();
  renderSupplierList();
  renderSupplierPage();
}

function renderChrome() {
  if (!state.bootstrap) {
    return;
  }

  const { dashboard, meta } = state.bootstrap;
  const { overview, currentMonth } = dashboard;

  setHtml(
    "header-meta",
    [
      renderMetaCard("Database Seed", meta.seededAt ? formatDate(meta.seededAt) : "Not seeded"),
      renderMetaCard("Imported Products", formatNumber(meta.seedCounts.products ?? 0)),
      renderMetaCard("Supplier Entries", formatNumber(meta.seedCounts.supplierEntries ?? 0)),
    ].join(""),
  );

  setHtml(
    "sidebar-summary",
    [
      renderSidebarMini("Outstanding", formatCurrency(overview.outstanding_payable || 0)),
      renderSidebarMini("Stock on hand", formatNumber(overview.stock_on_hand || 0)),
      renderSidebarMini("Month profit", formatCurrency(currentMonth.profit || 0)),
    ].join(""),
  );
}

function renderOverviewPage() {
  if (!hasElement("overview-stats") || !state.bootstrap) {
    return;
  }

  const { dashboard } = state.bootstrap;
  const { overview, currentMonth } = dashboard;

  setHtml(
    "overview-stats",
    [
      renderStatCard("Outstanding Payable", formatCurrency(overview.outstanding_payable || 0), "Across all suppliers"),
      renderStatCard("Current Stock", formatNumber(overview.stock_on_hand || 0), "Across all products"),
      renderStatCard("Low Stock Items", formatNumber(overview.low_stock_count || 0), "Based on reorder level"),
      renderStatCard("Sales This Month", formatCurrency(currentMonth.revenue || 0), "Recorded revenue"),
      renderStatCard("Profit This Month", formatCurrency(currentMonth.profit || 0), "Recorded net profit"),
    ].join(""),
  );

  setHtml("monthly-performance", renderMonthlyPerformance(dashboard.monthlyPerformance));
  setHtml(
    "low-stock-list",
    renderCompactRows(
      dashboard.lowStock,
      (row) => `
        <div class="list-item">
          <div class="list-item-row">
            <span class="list-item-title">${escapeHtml(row.name)}</span>
            <span class="amount-negative">${formatNumber(row.current_stock)}</span>
          </div>
          <div class="list-item-subtitle">Reorder at ${formatNumber(row.reorder_level)}</div>
        </div>
      `,
      "No low stock alerts yet.",
    ),
  );

  setHtml(
    "supplier-balance-list",
    renderCompactRows(
      dashboard.supplierBalances,
      (row) => `
        <div class="list-item">
          <div class="list-item-row">
            <span class="list-item-title">${escapeHtml(row.name)}</span>
            <span class="${row.outstanding > 0 ? "amount-negative" : "amount-positive"}">${formatCurrency(row.outstanding)}</span>
          </div>
          <div class="list-item-subtitle">${row.outstanding > 0 ? "Amount still payable" : "Advance or credit"}</div>
        </div>
      `,
      "Supplier balances will appear here after transactions are available.",
    ),
  );

  setHtml(
    "top-product-list",
    renderCompactRows(
      dashboard.topProducts,
      (row) => `
        <div class="list-item">
          <div class="list-item-row">
            <span class="list-item-title">${escapeHtml(row.name)}</span>
            <span class="amount-positive">${formatCurrency(row.net_profit)}</span>
          </div>
          <div class="list-item-subtitle">${formatNumber(row.sold_quantity)} sold | Revenue ${formatCurrency(row.revenue)}</div>
        </div>
      `,
      "Record a few sales to start ranking products.",
    ),
  );
}

function renderSupplierList() {
  if (!hasElement("supplier-list") || !state.bootstrap) {
    return;
  }

  const suppliers = state.bootstrap.suppliers;
  setText("supplier-count-badge", `${suppliers.length} parties`);
  setHtml(
    "supplier-list",
    renderCompactRows(
      suppliers,
      (supplier) => `
        <button class="supplier-pill ${supplier.id === state.selectedSupplierId ? "active" : ""}" data-supplier-id="${supplier.id}">
          <span class="supplier-pill-name">${escapeHtml(supplier.name)}</span>
          <span class="supplier-pill-meta">${formatCurrency(supplier.outstanding)} outstanding | ${formatNumber(supplier.entry_count)} entries</span>
        </button>
      `,
      "No suppliers are available yet.",
    ),
  );
}

function renderSupplierPage() {
  if (!hasElement("supplier-summary")) {
    return;
  }

  if (!state.supplierDetail?.supplier) {
    setHtml("supplier-summary", `<div class="empty-state">Select a supplier to inspect its ledger.</div>`);
    setHtml("supplier-ledger-body", "");
    setText("ledger-caption", "");
    return;
  }

  const { supplier, entries } = state.supplierDetail;

  setText("ledger-caption", `${entries.length} recent rows`);
  setHtml(
    "supplier-summary",
    [
      renderSummaryCard("Supplier", escapeHtml(supplier.name)),
      renderSummaryCard("Purchases + Charges", formatCurrency(supplier.total_charges || 0)),
      renderSummaryCard("Payments", formatCurrency(supplier.total_payments || 0)),
      renderSummaryCard("Outstanding", formatCurrency(supplier.outstanding || 0)),
    ].join(""),
  );

  setHtml(
    "supplier-ledger-body",
    entries.length
      ? entries
          .map(
            (entry) => `
              <tr>
                <td>${escapeHtml(formatDate(entry.event_date || entry.raw_date))}</td>
                <td><span class="type-pill ${entry.event_type}">${escapeHtml(titleCase(entry.event_type))}</span></td>
                <td>
                  <strong>${escapeHtml(entry.description || "Untitled entry")}</strong>
                  <div class="muted">${escapeHtml([entry.product_name, entry.size, entry.packet].filter(Boolean).join(" | "))}</div>
                </td>
                <td>${entry.quantity === null ? "-" : formatNumber(entry.quantity)}</td>
                <td>${entry.rate === null ? "-" : formatCurrency(entry.rate)}</td>
                <td>${entry.purchase_total === null ? "-" : formatCurrency(entry.purchase_total)}</td>
                <td>${entry.payment_amount === null ? "-" : formatCurrency(entry.payment_amount)}</td>
                <td>${escapeHtml(entry.source_type === "seed" ? "CSV import" : "Live entry")}</td>
              </tr>
            `,
          )
          .join("")
      : `<tr><td colspan="8"><div class="empty-state">No ledger rows found for this supplier.</div></td></tr>`,
  );
}

function renderInventoryPage() {
  if (!state.bootstrap) {
    return;
  }

  const { dashboard, products } = state.bootstrap;

  if (hasElement("inventory-stats")) {
    setHtml(
      "inventory-stats",
      [
        renderStatCard("Products", formatNumber(dashboard.overview.product_count || 0), "Tracked inventory items"),
        renderStatCard("Stock on Hand", formatNumber(dashboard.overview.stock_on_hand || 0), "Total quantity"),
        renderStatCard("Low Stock", formatNumber(dashboard.overview.low_stock_count || 0), "Needs attention"),
        renderStatCard("Recorded Sales", formatNumber(dashboard.overview.sales_count || 0), "Live sales entries"),
      ].join(""),
    );
  }

  if (hasElement("product-table-body")) {
    setHtml(
      "product-table-body",
      products.length
        ? products
            .map(
              (product) => `
                <tr class="${product.is_low_stock ? "low-stock" : ""}">
                  <td>
                    <strong>${escapeHtml(product.name)}</strong>
                    <div class="muted">${product.source_type === "seed" ? "Seeded product" : "Manual product"}</div>
                  </td>
                  <td>${formatNumber(product.current_stock)}</td>
                  <td>${formatNumber(product.reorder_level)}</td>
                  <td>${product.default_purchase_price === null ? "-" : formatCurrency(product.default_purchase_price)}</td>
                  <td>${product.default_sale_price === null ? "-" : formatCurrency(product.default_sale_price)}</td>
                  <td>${formatCurrency(product.profit_total || 0)}</td>
                  <td>
                    <form data-product-id="${product.id}" class="inline-reorder-form">
                      <input name="reorderLevel" type="number" min="0" step="0.01" value="${product.reorder_level ?? 0}" />
                      <button class="reorder-button" type="submit">Update</button>
                    </form>
                  </td>
                </tr>
              `,
            )
            .join("")
        : `<tr><td colspan="7"><div class="empty-state">No products are loaded yet.</div></td></tr>`,
    );
  }
}

function renderSalesPage() {
  if (!state.bootstrap) {
    return;
  }

  const { dashboard, recentSales } = state.bootstrap;
  const { overview, currentMonth } = dashboard;

  if (hasElement("sales-stats")) {
    setHtml(
      "sales-stats",
      [
        renderStatCard("Revenue This Month", formatCurrency(currentMonth.revenue || 0), "Recorded sales revenue"),
        renderStatCard("Profit This Month", formatCurrency(currentMonth.profit || 0), "Recorded net profit"),
        renderStatCard("Qty Sold This Month", formatNumber(currentMonth.quantity || 0), "Units or kg sold"),
        renderStatCard("Total Sales Entries", formatNumber(overview.sales_count || 0), "All live sales"),
      ].join(""),
    );
  }

  if (hasElement("recent-sales-list")) {
    setHtml(
      "recent-sales-list",
      renderCompactRows(
        recentSales,
        (sale) => `
          <div class="list-item">
            <div class="list-item-row">
              <span class="list-item-title">${escapeHtml(sale.product_name)}</span>
              <span class="amount-positive">${formatCurrency(sale.net_profit)}</span>
            </div>
            <div class="list-item-subtitle">${formatDate(sale.sold_on)} | ${formatNumber(sale.quantity)} sold | Revenue ${formatCurrency(sale.revenue)}</div>
          </div>
        `,
        "No live sales recorded yet.",
      ),
    );
  }

  if (hasElement("sales-monthly-performance")) {
    setHtml("sales-monthly-performance", renderMonthlyPerformance(dashboard.monthlyPerformance));
  }

  if (hasElement("sales-top-product-list")) {
    setHtml(
      "sales-top-product-list",
      renderCompactRows(
        dashboard.topProducts,
        (row) => `
          <div class="list-item">
            <div class="list-item-row">
              <span class="list-item-title">${escapeHtml(row.name)}</span>
              <span class="amount-positive">${formatCurrency(row.net_profit)}</span>
            </div>
            <div class="list-item-subtitle">${formatNumber(row.sold_quantity)} sold | Revenue ${formatCurrency(row.revenue)}</div>
          </div>
        `,
        "Top products will appear here after sales are added.",
      ),
    );
  }
}

function syncSelectOptions() {
  if (!state.bootstrap) {
    return;
  }

  const suppliers = state.bootstrap.suppliers ?? [];
  const products = state.bootstrap.products ?? [];

  populateSelect("purchase-supplier", suppliers, "Select supplier");
  populateSelect("payment-supplier", suppliers, "Select supplier");
  populateSelect("purchase-product", products, "Use existing product");
  populateSelect("adjustment-product", products, "Select product");
  populateSelect("sale-product", products, "Select product");
  syncSupplierDefaults();
}

function syncSupplierDefaults() {
  if (!state.selectedSupplierId) {
    return;
  }

  const purchaseSupplier = document.getElementById("purchase-supplier");
  if (purchaseSupplier) {
    purchaseSupplier.value = String(state.selectedSupplierId);
  }

  const paymentSupplier = document.getElementById("payment-supplier");
  if (paymentSupplier) {
    paymentSupplier.value = String(state.selectedSupplierId);
  }
}

function populateSelect(selectId, records, placeholder) {
  const select = document.getElementById(selectId);

  if (!select) {
    return;
  }

  const previousValue = select.value;
  select.innerHTML = [`<option value="">${escapeHtml(placeholder)}</option>`]
    .concat(records.map((record) => `<option value="${record.id}">${escapeHtml(record.name)}</option>`))
    .join("");

  if (records.some((record) => String(record.id) === previousValue)) {
    select.value = previousValue;
  }
}

function handleSupplierSelection(event) {
  const button = event.target.closest("[data-supplier-id]");

  if (!button) {
    return;
  }

  state.selectedSupplierId = Number(button.dataset.supplierId);
  renderSupplierList();
  refreshSupplierDetail().catch((error) => showFlash(error.message, "error"));
}

function handleModalClick(event) {
  const openTrigger = event.target.closest("[data-modal-open]");
  if (openTrigger) {
    openModal(openTrigger.dataset.modalOpen);
    return;
  }

  const closeTrigger = event.target.closest("[data-modal-close]");
  if (closeTrigger) {
    closeModal(closeTrigger.dataset.modalClose);
  }
}

function handleEscapeClose(event) {
  if (event.key !== "Escape") {
    return;
  }

  document.querySelectorAll(".modal:not(.hidden)").forEach((modal) => {
    closeModal(modal.id);
  });
}

function openModal(modalId) {
  const modal = document.getElementById(modalId);

  if (!modal) {
    return;
  }

  syncSupplierDefaults();
  setDefaultDates();
  updatePurchaseEstimate();
  updateSaleEstimate();
  modal.classList.remove("hidden");
  document.body.classList.add("modal-open");
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);

  if (!modal) {
    return;
  }

  modal.classList.add("hidden");

  if (!document.querySelector(".modal:not(.hidden)")) {
    document.body.classList.remove("modal-open");
  }
}

async function handlePurchaseSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = Object.fromEntries(new FormData(form).entries());

  if (!payload.productId && !payload.productName.trim()) {
    showFlash("Choose an existing product or enter a new product name.", "error");
    return;
  }

  await api("/api/purchases", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  form.reset();
  closeModal("purchase-modal");
  await refreshAll();
  showFlash("Purchase saved and stock updated.", "success");
}

async function handlePaymentSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = Object.fromEntries(new FormData(form).entries());

  await api("/api/payments", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  form.reset();
  closeModal("payment-modal");
  await refreshAll();
  showFlash("Payment saved against supplier ledger.", "success");
}

async function handleProductSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = Object.fromEntries(new FormData(form).entries());

  await api("/api/products", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  form.reset();
  closeModal("product-modal");
  await refreshAll();
  showFlash("Product saved.", "success");
}

async function handleAdjustmentSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = Object.fromEntries(new FormData(form).entries());

  await api(`/api/products/${payload.productId}/adjustments`, {
    method: "POST",
    body: JSON.stringify(payload),
  });

  form.reset();
  closeModal("adjustment-modal");
  await refreshAll();
  showFlash("Stock movement saved.", "success");
}

async function handleSaleSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = Object.fromEntries(new FormData(form).entries());

  await api("/api/sales", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  form.reset();
  closeModal("sale-modal");
  await refreshAll();
  showFlash("Sale saved and stock reduced.", "success");
}

async function handleInlineReorderSubmit(event) {
  const form = event.target.closest(".inline-reorder-form");

  if (!form) {
    return;
  }

  event.preventDefault();

  await api(`/api/products/${form.dataset.productId}/reorder-level`, {
    method: "POST",
    body: JSON.stringify(Object.fromEntries(new FormData(form).entries())),
  });

  await refreshAll();
  showFlash("Reorder level updated.", "success");
}

function updatePurchaseEstimate() {
  const form = document.getElementById("purchase-form");
  const target = document.getElementById("purchase-estimate");

  if (!form || !target) {
    return;
  }

  const quantity = Number(form.elements.quantity.value);
  const rate = Number(form.elements.rate.value);
  const total = Number(form.elements.totalAmount.value);

  if (quantity > 0 && rate > 0) {
    target.textContent = `Estimated total: ${formatCurrency(quantity * rate)}`;
    return;
  }

  if (quantity > 0 && total > 0) {
    target.textContent = `Implied rate: ${formatCurrency(total / quantity)}`;
    return;
  }

  target.textContent = "Enter quantity and rate, or quantity and total amount, to preview the purchase value.";
}

function updateSaleEstimate() {
  const form = document.getElementById("sale-form");
  const target = document.getElementById("sale-estimate");

  if (!form || !target || !state.bootstrap) {
    return;
  }

  const productId = Number(form.elements.productId.value);
  const product = state.bootstrap.products.find((item) => item.id === productId);

  if (!product) {
    target.textContent = "Select a product to preview revenue and profit.";
    return;
  }

  const quantity = Number(form.elements.quantity.value);
  const salePrice = Number(form.elements.salePrice.value);
  const unitCost = Number(form.elements.unitCost.value || product.default_purchase_price || 0);
  const otherCost = Number(form.elements.otherCost.value || product.default_other_cost || 0);

  if (!(quantity > 0) || !(salePrice > 0)) {
    target.textContent = `Current stock: ${formatNumber(product.current_stock)} | Default cost: ${formatCurrency(unitCost)}`;
    return;
  }

  const revenue = quantity * salePrice;
  const totalCost = quantity * unitCost + otherCost;
  const profit = revenue - totalCost;

  target.textContent = `Revenue ${formatCurrency(revenue)} | Estimated cost ${formatCurrency(totalCost)} | Estimated profit ${formatCurrency(profit)}`;
}

function syncAdjustmentDirectionState() {
  const typeSelect = document.getElementById("adjustment-type");
  const directionSelect = document.getElementById("adjustment-direction");

  if (!typeSelect || !directionSelect) {
    return;
  }

  const isManual = typeSelect.value === "adjustment";
  directionSelect.disabled = !isManual;

  if (!isManual) {
    directionSelect.value = "remove";
  }
}

function setDefaultDates() {
  const today = new Date().toISOString().slice(0, 10);

  document.querySelectorAll('input[type="date"]').forEach((input) => {
    if (!input.value) {
      input.value = today;
    }
  });

  syncAdjustmentDirectionState();
}

function showFlash(message, type) {
  const flash = document.getElementById("flash");

  if (!flash) {
    return;
  }

  flash.textContent = message;
  flash.className = `flash ${type}`;

  window.clearTimeout(showFlash.timeoutId);
  showFlash.timeoutId = window.setTimeout(() => {
    flash.className = "flash hidden";
  }, 3000);
}

function renderMonthlyPerformance(rows) {
  if (!rows?.length) {
    return `<div class="empty-state">Record sales to unlock monthly revenue and profit trends.</div>`;
  }

  const maxProfit = Math.max(...rows.map((row) => Number(row.profit) || 0), 1);

  return rows
    .map((row) => {
      const width = Math.max(8, Math.round((Number(row.profit) / maxProfit) * 100));
      return `
        <div class="bar-row">
          <div class="bar-label-row">
            <span class="list-item-title">${escapeHtml(row.month)}</span>
            <span>${formatCurrency(row.profit)} profit</span>
          </div>
          <div class="bar-track"><div class="bar-fill" style="width: ${width}%"></div></div>
          <div class="list-item-subtitle">${formatCurrency(row.revenue)} revenue | ${formatNumber(row.quantity)} sold</div>
        </div>
      `;
    })
    .join("");
}

function renderCompactRows(rows, renderRow, emptyMessage) {
  if (!rows?.length) {
    return `<div class="empty-state">${escapeHtml(emptyMessage)}</div>`;
  }

  return rows.map(renderRow).join("");
}

function renderMetaCard(label, value) {
  return `
    <article class="hero-meta-card">
      <span class="label">${escapeHtml(label)}</span>
      <strong>${value}</strong>
    </article>
  `;
}

function renderSidebarMini(label, value) {
  return `
    <div class="sidebar-mini">
      <span>${escapeHtml(label)}</span>
      <strong>${value}</strong>
    </div>
  `;
}

function renderStatCard(label, value, caption) {
  return `
    <article class="stat-card">
      <span class="label">${escapeHtml(label)}</span>
      <strong>${value}</strong>
      <div class="muted">${escapeHtml(caption)}</div>
    </article>
  `;
}

function renderSummaryCard(label, value) {
  return `
    <article class="summary-card">
      <span class="label">${escapeHtml(label)}</span>
      <strong>${value}</strong>
    </article>
  `;
}

function setHtml(id, value) {
  const element = document.getElementById(id);

  if (element) {
    element.innerHTML = value;
  }
}

function setText(id, value) {
  const element = document.getElementById(id);

  if (element) {
    element.textContent = value;
  }
}

function hasElement(id) {
  return Boolean(document.getElementById(id));
}

function formatCurrency(value) {
  return currencyFormatter.format(Number(value) || 0);
}

function formatNumber(value) {
  return numberFormatter.format(Number(value) || 0);
}

function formatDate(value) {
  if (!value) {
    return "No date";
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T00:00:00`).toLocaleDateString("en-BD", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  if (!Number.isNaN(Date.parse(value))) {
    return new Date(value).toLocaleDateString("en-BD", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  return value;
}

function titleCase(value) {
  return String(value)
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
