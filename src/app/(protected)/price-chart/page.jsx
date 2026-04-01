import { ObjectId } from "mongodb";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/mongodb";
import { formatMoney, toNumber, round2 } from "@/lib/number";
import { getSession } from "@/lib/hard-auth";
import { canManageInventory } from "@/lib/roles";
import Link from "next/link";

async function addPriceChartAction(formData) {
  "use server";

  const session = await getSession();
  if (!session || !canManageInventory(session.role)) {
    throw new Error("Permission denied for price management.");
  }

  const fishName = String(formData.get("fishName") || "").trim();
  const sellingPrice = toNumber(formData.get("sellingPrice"));
  const notes = String(formData.get("notes") || "").trim();

  if (!fishName || sellingPrice <= 0) {
    throw new Error("Invalid price entry. Fish name and price are required.");
  }

  const db = await getDb();

  // Add to price chart log
  await db.collection("price_chart_log").insertOne({
    fishName,
    sellingPrice: round2(sellingPrice),
    notes: notes || null,
    createdBy: session.username,
    createdAt: new Date()
  });

  // Update or insert current price
  await db.collection("price_chart").updateOne(
    { fishName },
    {
      $set: {
        sellingPrice: round2(sellingPrice),
        notes: notes || null,
        lastUpdatedBy: session.username,
        lastUpdatedAt: new Date()
      }
    },
    { upsert: true }
  );

  revalidatePath("/price-chart");
  redirect("/price-chart");
}

async function getPriceChartData() {
  const db = await getDb();
  const currentPrices = await db
    .collection("price_chart")
    .find({})
    .sort({ fishName: 1 })
    .toArray();

  return { currentPrices };
}

export default async function PriceChartPage() {
  const session = await getSession();
  const canEdit = canManageInventory(session?.role);
  const { currentPrices } = await getPriceChartData();

  return (
    <div className="space-y-6">
      <section className="card p-5">
        <h1 className="text-xl font-semibold">Price Chart Management</h1>
        <p className="mt-2 text-sm text-zinc-600">
          Set and update selling prices for each fish. Price history is logged for audit trail.
        </p>

        {canEdit ? (
          <form action={addPriceChartAction} className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <input
              name="fishName"
              className="input"
              placeholder="Fish name"
              required
            />
            <input
              name="sellingPrice"
              className="input"
              type="number"
              step="0.01"
              min="0.01"
              placeholder="Selling price/kg"
              required
            />
            <input
              name="notes"
              className="input"
              placeholder="Notes (optional)"
            />
            <button className="btn-black md:col-span-2 xl:col-span-4" type="submit">
              Add/Update Price
            </button>
          </form>
        ) : (
          <p className="mt-4 rounded-md border border-zinc-300 bg-zinc-50 p-3 text-sm">
            Only admin role can manage prices.
          </p>
        )}
      </section>

      <section className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Current Prices</h2>
          <Link href="/price-chart/logs" className="btn-white text-sm">
            View History
          </Link>
        </div>

        {currentPrices.length === 0 ? (
          <p className="text-sm text-zinc-500">No prices set yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] border-collapse">
              <thead>
                <tr className="border-b border-zinc-300 text-left text-xs uppercase tracking-wide text-zinc-500">
                  <th className="py-2">Fish Name</th>
                  <th className="py-2">Selling Price/kg</th>
                  <th className="py-2">Notes</th>
                  <th className="py-2">Last Updated</th>
                  <th className="py-2">By</th>
                </tr>
              </thead>
              <tbody>
                {currentPrices.map((price) => (
                  <tr key={price._id.toString()} className="border-b border-zinc-200 text-sm">
                    <td className="py-2 font-medium">{price.fishName}</td>
                    <td className="py-2">{formatMoney(price.sellingPrice)}</td>
                    <td className="py-2 text-zinc-600">{price.notes || "—"}</td>
                    <td className="py-2">{new Date(price.lastUpdatedAt).toLocaleDateString()}</td>
                    <td className="py-2">{price.lastUpdatedBy}</td>
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
