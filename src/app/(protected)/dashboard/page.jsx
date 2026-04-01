import Link from "next/link";
import { getDb } from "@/lib/mongodb";
import { formatKg, formatMoney } from "@/lib/number";
import { toDayKey } from "@/lib/fish-ops";

async function getDashboardData(searchParams) {
  const db = await getDb();
  const today = toDayKey(new Date());

  // Parse filters - default to current month
  const filterType = searchParams?.filterType || "month";
  const startDate = searchParams?.startDate || "";
  const endDate = searchParams?.endDate || "";
  const filterMonth = searchParams?.month || "";

  let dateFilter = {};
  let periodLabel = "";
  
  // Default to current month
  if (filterType === "month" && !filterMonth) {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const monthStr = `${year}-${month}`;
    
    const start = new Date(parseInt(year), parseInt(month) - 1, 1);
    const end = new Date(parseInt(year), parseInt(month), 0, 23, 59, 59, 999);
    dateFilter = { saleDate: { $gte: start, $lte: end } };
    periodLabel = `This Month (${monthStr})`;
  } else if (filterType === "date" && startDate && endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    dateFilter = { saleDate: { $gte: start, $lte: end } };
    periodLabel = `${startDate} to ${endDate}`;
  } else if (filterType === "month" && filterMonth) {
    const [year, month] = filterMonth.split("-");
    const start = new Date(parseInt(year), parseInt(month) - 1, 1);
    const end = new Date(parseInt(year), parseInt(month), 0, 23, 59, 59, 999);
    dateFilter = { saleDate: { $gte: start, $lte: end } };
    periodLabel = filterMonth;
  } else if (filterType === "today") {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);
    dateFilter = { saleDate: { $gte: todayStart, $lte: todayEnd } };
    periodLabel = "Today";
  }

  const [inventoryRows, periodSales, recentSales, todaySales] = await Promise.all([
    db
      .collection("inventory_batches")
      .aggregate([
        { $match: { remainingKg: { $gt: 0 } } },
        { $group: { _id: "$fishName", remainingKg: { $sum: "$remainingKg" }, batches: { $sum: 1 } } },
        { $sort: { _id: 1 } }
      ])
      .toArray(),
    db
      .collection("sales")
      .aggregate([
        { $match: dateFilter },
        {
          $group: {
            _id: null,
            revenue: { $sum: "$revenue" },
            grossProfit: { $sum: "$grossProfit" },
            donation: { $sum: "$donationAmount" },
            netProfit: { $sum: "$netProfit" },
            soldKg: { $sum: "$quantityKg" },
            count: { $sum: 1 }
          }
        }
      ])
      .toArray(),
    db.collection("sales").find({}).sort({ saleDate: -1 }).limit(8).toArray(),
    db
      .collection("sales")
      .aggregate([
        { $match: { saleDay: today } },
        {
          $group: {
            _id: "$saleDay",
            revenue: { $sum: "$revenue" },
            grossProfit: { $sum: "$grossProfit" },
            donation: { $sum: "$donationAmount" },
            netProfit: { $sum: "$netProfit" },
            soldKg: { $sum: "$quantityKg" }
          }
        }
      ])
      .toArray()
  ]);

  const stockKg = inventoryRows.reduce((sum, row) => sum + Number(row.remainingKg || 0), 0);
  const periodRow = periodSales[0] || { revenue: 0, grossProfit: 0, donation: 0, netProfit: 0, soldKg: 0, count: 0 };
  const todayRow = todaySales[0] || { revenue: 0, grossProfit: 0, donation: 0, netProfit: 0, soldKg: 0 };

  return {
    today,
    stockKg,
    fishTypes: inventoryRows.length,
    todayRow,
    periodRow,
    recentSales,
    filterType,
    startDate,
    endDate,
    filterMonth,
    periodLabel
  };
}

function StatCard({ label, value, hint }) {
  return (
    <article className="card p-4">
      <p className="label">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
      {hint ? <p className="mt-1 text-xs text-zinc-500">{hint}</p> : null}
    </article>
  );
}

export default async function DashboardPage({ searchParams }) {
  const data = await getDashboardData(searchParams);

  return (
    <div className="space-y-6">
      {/* Filter Controls */}
      <section className="card p-5">
        <h3 className="text-sm font-semibold mb-3">Filter Period</h3>
        <div className="flex flex-wrap gap-2 items-center text-sm mb-3">
          <a
            href="?filterType=today"
            className={`px-3 py-1 rounded ${data.filterType === "today" ? "bg-black text-white" : "bg-zinc-200 text-black"}`}
          >
            Today
          </a>
          <a
            href="?filterType=month"
            className={`px-3 py-1 rounded ${data.filterType === "month" && !data.filterMonth ? "bg-black text-white" : "bg-zinc-200 text-black"}`}
          >
            This Month
          </a>
          <a
            href="?filterType=month&month=custom"
            className={`px-3 py-1 rounded ${data.filterMonth ? "bg-black text-white" : "bg-zinc-200 text-black"}`}
          >
            Select Month
          </a>
          <a
            href="?filterType=date"
            className={`px-3 py-1 rounded ${data.filterType === "date" ? "bg-black text-white" : "bg-zinc-200 text-black"}`}
          >
            Date Range
          </a>
        </div>

        {/* Month Selector */}
        {data.filterMonth && (
          <form className="flex gap-2 items-end">
            <div>
              <label className="block text-xs text-zinc-600 mb-1">Select Month</label>
              <input
                type="month"
                name="month"
                defaultValue={data.filterMonth !== "custom" ? data.filterMonth : ""}
                className="input"
              />
            </div>
            <button type="submit" className="btn-black text-sm">
              Filter
            </button>
          </form>
        )}

        {/* Date Range */}
        {data.filterType === "date" && (
          <form className="flex gap-2 flex-wrap items-end">
            <div>
              <label className="block text-xs text-zinc-600 mb-1">Start Date</label>
              <input
                type="date"
                name="startDate"
                defaultValue={data.startDate}
                className="input"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-600 mb-1">End Date</label>
              <input
                type="date"
                name="endDate"
                defaultValue={data.endDate}
                className="input"
                required
              />
            </div>
            <button type="submit" className="btn-black text-sm">
              Filter
            </button>
          </form>
        )}
      </section>

      {/* Stats Section */}
      <section>
        <p className="text-xs text-zinc-600 mb-3">Period: {data.periodLabel}</p>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Stock Available" value={formatKg(data.stockKg)} hint={`${data.fishTypes} fish types`} />
          <StatCard 
            label={`Revenue (${data.periodLabel})`} 
            value={formatMoney(data.periodRow.revenue)}
            hint={`${data.periodRow.count} transactions`}
          />
          <StatCard
            label="Gross Profit"
            value={formatMoney(data.periodRow.grossProfit)}
            hint={`Donation 5%: ${formatMoney(data.periodRow.donation)}`}
          />
          <StatCard label="Net Profit After Donation" value={formatMoney(data.periodRow.netProfit)} />
        </div>
      </section>

      <section className="card p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Recent Sales</h2>
          <Link href="/sales" className="btn-white text-sm">
            Manage Sales
          </Link>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse">
            <thead>
              <tr className="border-b border-zinc-300 text-left text-xs uppercase tracking-wide text-zinc-500">
                <th className="py-2">Date</th>
                <th className="py-2">Fish</th>
                <th className="py-2">Qty</th>
                <th className="py-2">Revenue</th>
                <th className="py-2">Gross</th>
                <th className="py-2">Donation</th>
                <th className="py-2">Net</th>
              </tr>
            </thead>
            <tbody>
              {data.recentSales.length === 0 ? (
                <tr>
                  <td className="py-4 text-sm text-zinc-500" colSpan={7}>
                    No sales yet.
                  </td>
                </tr>
              ) : (
                data.recentSales.map((sale) => (
                  <tr key={sale._id.toString()} className="border-b border-zinc-200 text-sm">
                    <td className="py-2">{new Date(sale.saleDate).toLocaleDateString()}</td>
                    <td className="py-2 font-medium">{sale.fishName}</td>
                    <td className="py-2">{formatKg(sale.quantityKg)}</td>
                    <td className="py-2">{formatMoney(sale.revenue)}</td>
                    <td className="py-2">{formatMoney(sale.grossProfit)}</td>
                    <td className="py-2">{formatMoney(sale.donationAmount)}</td>
                    <td className="py-2">{formatMoney(sale.netProfit)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
