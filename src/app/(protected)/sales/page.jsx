import Link from "next/link";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/mongodb";
import { canManageSales } from "@/lib/roles";
import { formatKg, formatMoney, toNumber } from "@/lib/number";
import { recordSaleFIFO } from "@/lib/fish-ops";
import { getSession } from "@/lib/hard-auth";

async function createSaleAction(formData) {
  "use server";

  try {
    const session = await getSession();
    if (!session || !canManageSales(session.role)) {
      throw new Error("Permission denied for sales.");
    }

    const fishName = String(formData.get("fishName") || "").trim();
    const quantityKg = toNumber(formData.get("quantityKg"));
    const salePricePerKg = toNumber(formData.get("salePricePerKg"));
    const saleDateRaw = String(formData.get("saleDate") || "").trim();
    const saleDate = saleDateRaw ? new Date(saleDateRaw) : new Date();

    if (!fishName || quantityKg <= 0 || salePricePerKg <= 0 || Number.isNaN(saleDate.getTime())) {
      throw new Error("Invalid sale input.");
    }

    await recordSaleFIFO({
      fishName,
      quantityKg,
      salePricePerKg,
      saleDate,
      actorUsername: session.username
    });

    revalidatePath("/sales");
    revalidatePath("/inventory");
    revalidatePath("/dashboard");
  } catch (error) {
    console.error("Sales action error:", error);
    throw error;
  }
}

function FilterDateForm({ startDate, endDate }) {
  "use client";
  return (
    <div className="flex gap-2 flex-wrap items-end">
      <div>
        <label className="block text-xs text-zinc-600 mb-1">Start Date</label>
        <input
          type="date"
          defaultValue={startDate}
          id="filterStartDate"
          className="input"
        />
      </div>
      <div>
        <label className="block text-xs text-zinc-600 mb-1">End Date</label>
        <input
          type="date"
          defaultValue={endDate}
          id="filterEndDate"
          className="input"
        />
      </div>
      <button
        onClick={() => {
          const start = document.getElementById("filterStartDate").value;
          const end = document.getElementById("filterEndDate").value;
          if (start && end) {
            window.location.href = `/sales?filterType=date&startDate=${start}&endDate=${end}&page=1`;
          }
        }}
        className="btn-black text-sm"
      >
        Filter
      </button>
      <a href="/sales?page=1" className="px-3 py-2 bg-zinc-200 text-black rounded text-sm">
        Clear
      </a>
    </div>
  );
}

function FilterMonthForm({ filterMonth }) {
  "use client";
  return (
    <div className="flex gap-2 flex-wrap items-end">
      <div>
        <label className="block text-xs text-zinc-600 mb-1">Select Month</label>
        <input
          type="month"
          defaultValue={filterMonth}
          id="filterMonth"
          className="input"
        />
      </div>
      <button
        onClick={() => {
          const month = document.getElementById("filterMonth").value;
          if (month) {
            window.location.href = `/sales?filterType=month&month=${month}&page=1`;
          }
        }}
        className="btn-black text-sm"
      >
        Filter
      </button>
      <a href="/sales?page=1" className="px-3 py-2 bg-zinc-200 text-black rounded text-sm">
        Clear
      </a>
    </div>
  );
}


  const db = await getDb();
  
  // Parse filters
  const page = Math.max(1, parseInt(searchParams?.page || "1"));
  const pageSize = 15;
  const skip = (page - 1) * pageSize;
  
  const filterType = searchParams?.filterType || "all"; // "all", "date", "month"
  const startDate = searchParams?.startDate || "";
  const endDate = searchParams?.endDate || "";
  const filterMonth = searchParams?.month || "";
  
  let dateFilter = {};
  
  if (filterType === "date" && startDate && endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    dateFilter = { saleDate: { $gte: start, $lte: end } };
  } else if (filterType === "month" && filterMonth) {
    const [year, month] = filterMonth.split("-");
    const start = new Date(parseInt(year), parseInt(month) - 1, 1);
    const end = new Date(parseInt(year), parseInt(month), 0, 23, 59, 59, 999);
    dateFilter = { saleDate: { $gte: start, $lte: end } };
  }
  
  const [fishOptions, recentSales, totalCount] = await Promise.all([
    db.collection("inventory_batches").distinct("fishName", { remainingKg: { $gt: 0 } }),
    db.collection("sales")
      .find(dateFilter)
      .sort({ saleDate: -1 })
      .skip(skip)
      .limit(pageSize)
      .toArray(),
    db.collection("sales").countDocuments(dateFilter)
  ]);
  
  const totalPages = Math.ceil(totalCount / pageSize);
  
  return { 
    fishOptions: fishOptions.sort(), 
    recentSales,
    currentPage: page,
    totalPages,
    totalCount,
    pageSize,
    filterType,
    startDate,
    endDate,
    filterMonth
  };
}

export default async function SalesPage({ searchParams }) {
  const { 
    fishOptions, 
    recentSales, 
    currentPage, 
    totalPages, 
    totalCount,
    filterType,
    startDate,
    endDate,
    filterMonth
  } = await getSalesData(searchParams);

  return (
    <div className="space-y-6">
      <section className="card p-5">
        <h1 className="text-xl font-semibold">Sales Entry</h1>
        <p className="mt-2 text-sm text-zinc-600">
          Sales use FIFO inventory allocation. Complexity is O(b) where b is number of available batches for the fish.
        </p>
        <form action={createSaleAction} className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <select name="fishName" className="input" required defaultValue="">
            <option value="" disabled>
              Select fish
            </option>
            {fishOptions.map((fish) => (
              <option key={fish} value={fish}>
                {fish}
              </option>
            ))}
          </select>
          <input name="quantityKg" className="input" type="number" step="0.01" min="0.01" placeholder="Qty kg" required />
          <input
            name="salePricePerKg"
            className="input"
            type="number"
            step="0.01"
            min="0.01"
            placeholder="Sale price/kg"
            required
          />
          <input name="saleDate" className="input" type="datetime-local" />
          <button type="submit" className="btn-black">
            Record Sale
          </button>
        </form>
      </section>

      <section className="card p-5">
        <h2 className="text-lg font-semibold">Sales Ledger</h2>
        
        {/* Filter Controls */}
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap gap-2 items-center text-sm">
            <label className="font-medium">Filter by:</label>
            <a
              href="/sales?page=1"
              className={`px-3 py-1 rounded ${filterType === "all" ? "bg-black text-white" : "bg-zinc-200 text-black"}`}
            >
              All
            </a>
            <a
              href="/sales?filterType=date&page=1"
              className={`px-3 py-1 rounded ${filterType === "date" ? "bg-black text-white" : "bg-zinc-200 text-black"}`}
            >
              By Date Range
            </a>
            <a
              href="/sales?filterType=month&page=1"
              className={`px-3 py-1 rounded ${filterType === "month" ? "bg-black text-white" : "bg-zinc-200 text-black"}`}
            >
              By Month
            </a>
          </div>

          {/* Date Range Filter */}
          {filterType === "date" && (
            <FilterDateForm startDate={startDate} endDate={endDate} />
          )}

          {/* Month Filter */}
          {filterType === "month" && (
            <FilterMonthForm filterMonth={filterMonth} />
          )}
        </div>

        {/* Results Info */}
        <div className="mt-4 text-sm text-zinc-600">
          Showing {recentSales.length > 0 ? (currentPage - 1) * 15 + 1 : 0} to {(currentPage - 1) * 15 + recentSales.length} of {totalCount} sales
        </div>

        {/* Table */}
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse">
            <thead>
              <tr className="border-b border-zinc-300 text-left text-xs uppercase tracking-wide text-zinc-500">
                <th className="py-2">Date</th>
                <th className="py-2">Fish</th>
                <th className="py-2">Quantity</th>
                <th className="py-2">Revenue</th>
                <th className="py-2">COGS</th>
                <th className="py-2">Gross Profit</th>
                <th className="py-2">Donation (5%)</th>
                <th className="py-2">Net Profit</th>
              </tr>
            </thead>
            <tbody>
              {recentSales.length === 0 ? (
                <tr>
                  <td className="py-4 text-sm text-zinc-500" colSpan={8}>
                    No sales recorded.
                  </td>
                </tr>
              ) : (
                recentSales.map((sale) => (
                  <tr key={sale._id.toString()} className="border-b border-zinc-200 text-sm">
                    <td className="py-2">{new Date(sale.saleDate).toLocaleString()}</td>
                    <td className="py-2 font-medium">{sale.fishName}</td>
                    <td className="py-2">{formatKg(sale.quantityKg)}</td>
                    <td className="py-2">{formatMoney(sale.revenue)}</td>
                    <td className="py-2">{formatMoney(sale.cogs)}</td>
                    <td className="py-2">{formatMoney(sale.grossProfit)}</td>
                    <td className="py-2">{formatMoney(sale.donationAmount)}</td>
                    <td className="py-2">{formatMoney(sale.netProfit)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-4 flex justify-center items-center gap-2">
            {currentPage > 1 && (
              <>
                <a
                  href={`/sales?filterType=${filterType}${startDate ? `&startDate=${startDate}` : ""}${endDate ? `&endDate=${endDate}` : ""}${filterMonth ? `&month=${filterMonth}` : ""}&page=1`}
                  className="px-2 py-1 border border-zinc-300 rounded text-sm hover:bg-zinc-100"
                >
                  First
                </a>
                <a
                  href={`/sales?filterType=${filterType}${startDate ? `&startDate=${startDate}` : ""}${endDate ? `&endDate=${endDate}` : ""}${filterMonth ? `&month=${filterMonth}` : ""}&page=${currentPage - 1}`}
                  className="px-2 py-1 border border-zinc-300 rounded text-sm hover:bg-zinc-100"
                >
                  Prev
                </a>
              </>
            )}

            <span className="px-3 py-1 text-sm text-zinc-600">
              Page {currentPage} of {totalPages}
            </span>

            {currentPage < totalPages && (
              <>
                <a
                  href={`/sales?filterType=${filterType}${startDate ? `&startDate=${startDate}` : ""}${endDate ? `&endDate=${endDate}` : ""}${filterMonth ? `&month=${filterMonth}` : ""}&page=${currentPage + 1}`}
                  className="px-2 py-1 border border-zinc-300 rounded text-sm hover:bg-zinc-100"
                >
                  Next
                </a>
                <a
                  href={`/sales?filterType=${filterType}${startDate ? `&startDate=${startDate}` : ""}${endDate ? `&endDate=${endDate}` : ""}${filterMonth ? `&month=${filterMonth}` : ""}&page=${totalPages}`}
                  className="px-2 py-1 border border-zinc-300 rounded text-sm hover:bg-zinc-100"
                >
                  Last
                </a>
              </>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
