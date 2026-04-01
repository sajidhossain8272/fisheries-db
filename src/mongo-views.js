import { firstDefined, roundCurrency } from "./utils.js";
import { compareEventRowsDesc, compareNames } from "./mongo-common.js";

export function buildSupplierStats(entries) {
  const stats = new Map();

  for (const entry of entries) {
    const current =
      stats.get(entry.supplier_id) ??
      {
        totalCharges: 0,
        totalPayments: 0,
        outstanding: 0,
        lastEventDate: null,
        entryCount: 0,
      };
    const purchaseTotal = Number(entry.purchase_total || 0);
    const paymentAmount = Number(entry.payment_amount || 0);

    if (entry.event_type === "purchase" || entry.event_type === "charge") {
      current.totalCharges += purchaseTotal;
    }

    if (entry.event_type === "payment") {
      current.totalPayments += paymentAmount;
    }

    current.outstanding = current.totalCharges - current.totalPayments;

    if (entry.event_date && (!current.lastEventDate || entry.event_date > current.lastEventDate)) {
      current.lastEventDate = entry.event_date;
    }

    current.entryCount += 1;
    stats.set(entry.supplier_id, current);
  }

  return stats;
}

export function buildSalesStats(sales) {
  const stats = new Map();

  for (const sale of sales) {
    const current =
      stats.get(sale.product_id) ??
      {
        soldQuantity: 0,
        revenue: 0,
        netProfit: 0,
      };

    current.soldQuantity += Number(sale.quantity || 0);
    current.revenue += Number(sale.revenue || 0);
    current.netProfit += Number(sale.net_profit || 0);
    stats.set(sale.product_id, current);
  }

  return stats;
}

export function buildCurrentMonthSummary(sales) {
  const month = new Date().toISOString().slice(0, 7);
  const summary = {
    revenue: 0,
    profit: 0,
    quantity: 0,
  };

  for (const sale of sales) {
    if (sale.sold_on?.slice(0, 7) !== month) {
      continue;
    }

    summary.revenue += Number(sale.revenue || 0);
    summary.profit += Number(sale.net_profit || 0);
    summary.quantity += Number(sale.quantity || 0);
  }

  return {
    revenue: roundCurrency(summary.revenue),
    profit: roundCurrency(summary.profit),
    quantity: roundCurrency(summary.quantity),
  };
}

export function buildMonthlyPerformance(sales) {
  const months = new Map();

  for (const sale of sales) {
    const month = sale.sold_on?.slice(0, 7);

    if (!month) {
      continue;
    }

    const current =
      months.get(month) ??
      {
        month,
        revenue: 0,
        profit: 0,
        quantity: 0,
      };

    current.revenue += Number(sale.revenue || 0);
    current.profit += Number(sale.net_profit || 0);
    current.quantity += Number(sale.quantity || 0);
    months.set(month, current);
  }

  return [...months.values()]
    .sort((left, right) => right.month.localeCompare(left.month))
    .slice(0, 6)
    .reverse()
    .map((row) => ({
      month: row.month,
      revenue: roundCurrency(row.revenue),
      profit: roundCurrency(row.profit),
      quantity: roundCurrency(row.quantity),
    }));
}

export function buildSupplierRows(suppliers, supplierEntries) {
  const stats = buildSupplierStats(supplierEntries);

  return [...suppliers]
    .sort((left, right) => compareNames(left.name, right.name))
    .map((supplier) => {
      const summary = stats.get(supplier.id);

      return {
        id: supplier.id,
        name: supplier.name,
        total_charges: roundCurrency(summary?.totalCharges || 0),
        total_payments: roundCurrency(summary?.totalPayments || 0),
        outstanding: roundCurrency(summary?.outstanding || 0),
        last_event_date: summary?.lastEventDate || null,
        entry_count: Number(summary?.entryCount || 0),
      };
    });
}

export function buildProductRows(products, sales) {
  const salesStats = buildSalesStats(sales);

  return [...products]
    .map((product) => {
      const summary = salesStats.get(product.id);
      const isLowStock =
        Number(product.reorder_level || 0) > 0 &&
        Number(product.current_stock || 0) <= Number(product.reorder_level || 0);

      return {
        id: product.id,
        name: product.name,
        current_stock: roundCurrency(product.current_stock || 0),
        reorder_level: roundCurrency(product.reorder_level || 0),
        default_purchase_price: firstDefined(product.default_purchase_price, null),
        default_sale_price: firstDefined(product.default_sale_price, null),
        default_other_cost: firstDefined(product.default_other_cost, null),
        source_type: product.source_type,
        sold_quantity: roundCurrency(summary?.soldQuantity || 0),
        profit_total: roundCurrency(summary?.netProfit || 0),
        is_low_stock: isLowStock ? 1 : 0,
      };
    })
    .sort((left, right) => {
      if (left.is_low_stock !== right.is_low_stock) {
        return right.is_low_stock - left.is_low_stock;
      }

      if (left.current_stock !== right.current_stock) {
        return left.current_stock - right.current_stock;
      }

      return compareNames(left.name, right.name);
    });
}

export function buildRecentSalesRows(products, sales, limit = 30) {
  const productMap = new Map(products.map((product) => [product.id, product]));

  return [...sales]
    .sort((left, right) => compareEventRowsDesc(left, right, "sold_on"))
    .slice(0, Number(limit))
    .map((sale) => ({
      id: sale.id,
      sold_on: sale.sold_on,
      quantity: roundCurrency(sale.quantity || 0),
      sale_price: sale.sale_price,
      unit_cost: sale.unit_cost,
      other_cost: sale.other_cost,
      revenue: sale.revenue,
      total_cost: sale.total_cost,
      net_profit: sale.net_profit,
      note: sale.note || null,
      product_id: sale.product_id,
      product_name: productMap.get(sale.product_id)?.name || "Unknown product",
    }));
}

export function buildDashboardDataView(suppliers, products, sales, supplierEntries) {
  const supplierStats = buildSupplierStats(supplierEntries);
  const salesStats = buildSalesStats(sales);
  const currentMonth = buildCurrentMonthSummary(sales);
  const stockOnHand = products.reduce(
    (total, product) => total + Number(product.current_stock || 0),
    0,
  );
  const outstandingPayable = [...supplierStats.values()].reduce(
    (total, supplier) => total + Number(supplier.outstanding || 0),
    0,
  );
  const lowStockProducts = products
    .filter(
      (product) =>
        Number(product.reorder_level || 0) > 0 &&
        Number(product.current_stock || 0) <= Number(product.reorder_level || 0),
    )
    .sort((left, right) => {
      if (Number(left.current_stock || 0) !== Number(right.current_stock || 0)) {
        return Number(left.current_stock || 0) - Number(right.current_stock || 0);
      }

      return compareNames(left.name, right.name);
    });
  const topProducts = products
    .map((product) => {
      const summary = salesStats.get(product.id);

      return {
        id: product.id,
        name: product.name,
        sold_quantity: roundCurrency(summary?.soldQuantity || 0),
        revenue: roundCurrency(summary?.revenue || 0),
        net_profit: roundCurrency(summary?.netProfit || 0),
      };
    })
    .filter((product) => product.sold_quantity > 0 || product.net_profit > 0)
    .sort((left, right) => {
      if (left.net_profit !== right.net_profit) {
        return right.net_profit - left.net_profit;
      }

      return right.revenue - left.revenue;
    })
    .slice(0, 10);
  const supplierBalances = suppliers
    .map((supplier) => ({
      id: supplier.id,
      name: supplier.name,
      outstanding: roundCurrency(supplierStats.get(supplier.id)?.outstanding || 0),
    }))
    .filter((supplier) => supplier.outstanding !== 0)
    .sort((left, right) => right.outstanding - left.outstanding)
    .slice(0, 8);

  return {
    overview: {
      supplier_count: suppliers.length,
      product_count: products.length,
      stock_on_hand: roundCurrency(stockOnHand),
      outstanding_payable: roundCurrency(outstandingPayable),
      low_stock_count: lowStockProducts.length,
      sales_count: sales.length,
    },
    currentMonth,
    lowStock: lowStockProducts.slice(0, 12).map((product) => ({
      id: product.id,
      name: product.name,
      current_stock: roundCurrency(product.current_stock || 0),
      reorder_level: roundCurrency(product.reorder_level || 0),
      default_sale_price: firstDefined(product.default_sale_price, null),
    })),
    monthlyPerformance: buildMonthlyPerformance(sales),
    topProducts,
    supplierBalances,
  };
}
