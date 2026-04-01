import Link from "next/link";
import { getDb } from "@/lib/mongodb";
import { formatKg, formatMoney } from "@/lib/number";
import { toDayKey } from "@/lib/fish-ops";

async function getDashboardData() {
  const db = await getDb();
  const today = toDayKey(new Date());

  const [inventoryRows, todaySales, recentSales] = await Promise.all([
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
      .toArray(),
    db.collection("sales").find({}).sort({ saleDate: -1 }).limit(8).toArray()
  ]);

  const stockKg = inventoryRows.reduce((sum, row) => sum + Number(row.remainingKg || 0), 0);
  const todayRow = todaySales[0] || { revenue: 0, grossProfit: 0, donation: 0, netProfit: 0, soldKg: 0 };

  return {
    today,
    stockKg,
    fishTypes: inventoryRows.length,
    todayRow,
    recentSales
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

export default async function DashboardPage() {
  const data = await getDashboardData();

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Stock Available" value={formatKg(data.stockKg)} hint={`${data.fishTypes} fish types`} />
        <StatCard label={`Revenue (${data.today})`} value={formatMoney(data.todayRow.revenue)} />
        <StatCard
          label="Gross Profit"
          value={formatMoney(data.todayRow.grossProfit)}
          hint={`Donation 5%: ${formatMoney(data.todayRow.donation)}`}
        />
        <StatCard label="Net Profit After Donation" value={formatMoney(data.todayRow.netProfit)} />
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
