import { getDb } from "@/lib/mongodb";
import { formatMoney } from "@/lib/number";
import { getSession } from "@/lib/hard-auth";
import { canManageInventory } from "@/lib/roles";
import Link from "next/link";

async function getPriceLogData() {
  const db = await getDb();
  const logs = await db
    .collection("price_chart_log")
    .find({})
    .sort({ createdAt: -1 })
    .toArray();

  return { logs };
}

export default async function PriceChartLogsPage() {
  const session = await getSession();
  const canView = canManageInventory(session?.role);
  const { logs } = await getPriceLogData();

  if (!canView) {
    return (
      <div className="card p-5">
        <p className="text-sm text-red-600">
          Permission denied. Only admin role can view price history.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="card p-5">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Price Chart History</h1>
          <Link href="/price-chart" className="btn-white text-sm">
            Back to Prices
          </Link>
        </div>
        <p className="mt-2 text-sm text-zinc-600">
          Complete audit trail of all price changes and entries.
        </p>
      </section>

      <section className="card p-5">
        {logs.length === 0 ? (
          <p className="text-sm text-zinc-500">No price history available.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] border-collapse">
              <thead>
                <tr className="border-b border-zinc-300 text-left text-xs uppercase tracking-wide text-zinc-500">
                  <th className="py-2">Fish Name</th>
                  <th className="py-2">Selling Price/kg</th>
                  <th className="py-2">Notes</th>
                  <th className="py-2">Date</th>
                  <th className="py-2">Created By</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log._id.toString()} className="border-b border-zinc-200 text-sm">
                    <td className="py-2 font-medium">{log.fishName}</td>
                    <td className="py-2">{formatMoney(log.sellingPrice)}</td>
                    <td className="py-2 text-zinc-600">{log.notes || "—"}</td>
                    <td className="py-2">{new Date(log.createdAt).toLocaleDateString()}</td>
                    <td className="py-2">{log.createdBy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
