import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/mongodb";
import { canManageSales } from "@/lib/roles";
import { formatKg, formatMoney, toNumber } from "@/lib/number";
import { recordSaleFIFO } from "@/lib/fish-ops";
import { getSession } from "@/lib/hard-auth";

async function createSaleAction(formData) {
  "use server";

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
}

async function getSalesData() {
  const db = await getDb();
  const [fishOptions, recentSales] = await Promise.all([
    db.collection("inventory_batches").distinct("fishName", { remainingKg: { $gt: 0 } }),
    db.collection("sales").find({}).sort({ saleDate: -1 }).limit(30).toArray()
  ]);
  return { fishOptions: fishOptions.sort(), recentSales };
}

export default async function SalesPage() {
  const { fishOptions, recentSales } = await getSalesData();

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
        <h2 className="text-lg font-semibold">Recent Sales Ledger</h2>
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
      </section>
    </div>
  );
}
