import { ObjectId } from "mongodb";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/mongodb";
import { canManageInventory } from "@/lib/roles";
import { getSession } from "@/lib/hard-auth";
import { formatKg, formatMoney, round2, toNumber } from "@/lib/number";

async function createBatchAction(formData) {
  "use server";

  const session = await getSession();
  if (!session || !canManageInventory(session.role)) {
    throw new Error("Permission denied for inventory management.");
  }

  const fishName = String(formData.get("fishName") || "").trim();
  const purchaseDate = String(formData.get("purchaseDate") || "").trim();
  const initialKg = toNumber(formData.get("initialKg"));
  const wastePercent = toNumber(formData.get("wastePercent"));
  const manualWasteKg = toNumber(formData.get("manualWasteKg"));
  const buyPricePerKgRaw = toNumber(formData.get("buyPricePerKgRaw"));
  const notes = String(formData.get("notes") || "").trim();

  if (!fishName || !purchaseDate || initialKg <= 0 || buyPricePerKgRaw <= 0) {
    throw new Error("Invalid batch input.");
  }

  // Either wastePercent or manualWasteKg must be provided
  if (wastePercent < 0 && manualWasteKg <= 0) {
    throw new Error("Provide either waste % or manual waste kg.");
  }

  if (wastePercent >= 0 && (wastePercent >= 100)) {
    throw new Error("Waste percentage must be between 0 and 99.99.");
  }

  const date = new Date(purchaseDate);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid purchase date.");
  }

  // Calculate actual waste kg: use manual if provided, otherwise calculate from %
  let actualWasteKg = 0;
  if (manualWasteKg > 0) {
    actualWasteKg = round2(manualWasteKg);
    if (actualWasteKg >= initialKg) {
      throw new Error("Manual waste kg cannot be >= initial kg.");
    }
  } else if (wastePercent >= 0) {
    actualWasteKg = round2(initialKg * (wastePercent / 100));
  } else {
    throw new Error("Provide either waste % or manual waste kg.");
  }

  const sellableKg = round2(initialKg - actualWasteKg);
  const totalRawCost = round2(initialKg * buyPricePerKgRaw);
  const effectiveCostPerKgSellable = sellableKg > 0 ? round2(totalRawCost / sellableKg) : 0;

  const db = await getDb();
  await db.collection("inventory_batches").insertOne({
    fishName,
    purchaseDate: date,
    initialKg: round2(initialKg),
    remainingKg: sellableKg,
    wastePercent: wastePercent >= 0 ? round2(wastePercent) : null,
    manualWasteKg: manualWasteKg > 0 ? round2(manualWasteKg) : null,
    buyPricePerKgRaw: round2(buyPricePerKgRaw),
    totalRawCost,
    effectiveCostPerKgSellable,
    notes: notes || null,
    createdBy: session.username,
    createdAt: new Date(),
    updatedAt: new Date()
  });

  revalidatePath("/inventory");
  revalidatePath("/dashboard");
  revalidatePath("/sales");
}

async function deleteBatchAction(formData) {
  "use server";

  const session = await getSession();
  if (!session || !canManageInventory(session.role)) {
    throw new Error("Permission denied for inventory management.");
  }

  const id = String(formData.get("id") || "");
  if (!ObjectId.isValid(id)) {
    throw new Error("Invalid batch id.");
  }

  const db = await getDb();
  await db.collection("inventory_batches").deleteOne({ _id: new ObjectId(id) });

  revalidatePath("/inventory");
  revalidatePath("/dashboard");
  revalidatePath("/sales");
}

async function getInventoryRows() {
  const db = await getDb();
  const [batches, summary] = await Promise.all([
    db.collection("inventory_batches").find({}).sort({ purchaseDate: 1, createdAt: 1 }).toArray(),
    db
      .collection("inventory_batches")
      .aggregate([
        {
          $group: {
            _id: "$fishName",
            remainingKg: { $sum: "$remainingKg" },
            avgEffectiveCost: { $avg: "$effectiveCostPerKgSellable" }
          }
        },
        { $sort: { _id: 1 } }
      ])
      .toArray()
  ]);
  return { batches, summary };
}

export default async function InventoryPage() {
  const session = await getSession();
  const canEdit = canManageInventory(session?.role);
  const { batches, summary } = await getInventoryRows();

  return (
    <div className="space-y-6">
      <section className="card p-5">
        <h1 className="text-xl font-semibold">Inventory Batches</h1>
        <p className="mt-2 text-sm text-zinc-600">
          FIFO costing: sales always consume oldest purchase-date batches first, so remaining old stock keeps old cost.
        </p>
        {canEdit ? (
          <form action={createBatchAction} className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-7">
            <input name="fishName" className="input" placeholder="Fish name" required />
            <input name="purchaseDate" className="input" type="date" required />
            <input name="initialKg" className="input" type="number" min="0.01" step="0.01" placeholder="Raw kg" required />
            <input
              name="wastePercent"
              className="input"
              type="number"
              min="0"
              max="99.99"
              step="0.01"
              placeholder="Waste %"
            />
            <input
              name="manualWasteKg"
              className="input"
              type="number"
              min="0"
              step="0.01"
              placeholder="Manual waste kg (leave empty for %)"
            />
            <input
              name="buyPricePerKgRaw"
              className="input"
              type="number"
              min="0.01"
              step="0.01"
              placeholder="Buy price/kg"
              required
            />
            <input name="notes" className="input" placeholder="Notes (optional)" />
            <button className="btn-black md:col-span-2 xl:col-span-7" type="submit">
              Add Inventory Batch
            </button>
          </form>
        ) : (
          <p className="mt-4 rounded-md border border-zinc-300 bg-zinc-50 p-3 text-sm">
            Employee role can view batches but cannot create or delete inventory entries.
          </p>
        )}
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        {summary.length === 0 ? (
          <p className="text-sm text-zinc-500">No inventory summary available.</p>
        ) : (
          summary.map((row) => (
            <article key={row._id} className="card p-4">
              <p className="label">{row._id}</p>
              <p className="mt-1 text-xl font-semibold">{formatKg(row.remainingKg)}</p>
              <p className="text-sm text-zinc-600">Avg. effective cost {formatMoney(row.avgEffectiveCost)}/kg</p>
            </article>
          ))
        )}
      </section>

      <section className="card p-5">
        <h2 className="text-lg font-semibold">Batch Table</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse">
            <thead>
              <tr className="border-b border-zinc-300 text-left text-xs uppercase tracking-wide text-zinc-500">
                <th className="py-2">Fish</th>
                <th className="py-2">Purchase Date</th>
                <th className="py-2">Initial</th>
                <th className="py-2">Remaining</th>
                <th className="py-2">Waste</th>
                <th className="py-2">Buy/kg</th>
                <th className="py-2">Effective Cost/kg</th>
                <th className="py-2">Total Raw Cost</th>
                <th className="py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {batches.length === 0 ? (
                <tr>
                  <td className="py-4 text-sm text-zinc-500" colSpan={9}>
                    No batches found.
                  </td>
                </tr>
              ) : (
                batches.map((batch) => (
                  <tr key={batch._id.toString()} className="border-b border-zinc-200 text-sm">
                    <td className="py-2 font-medium">{batch.fishName}</td>
                    <td className="py-2">{new Date(batch.purchaseDate).toLocaleDateString()}</td>
                    <td className="py-2">{formatKg(batch.initialKg)}</td>
                    <td className="py-2">{formatKg(batch.remainingKg)}</td>
                    <td className="py-2">
                      {batch.manualWasteKg ? (
                        <span title="Manual waste kg">{formatKg(batch.manualWasteKg)} kg</span>
                      ) : (
                        <span>{Number(batch.wastePercent).toFixed(2)}%</span>
                      )}
                    </td>
                    <td className="py-2">{formatMoney(batch.buyPricePerKgRaw)}</td>
                    <td className="py-2">{formatMoney(batch.effectiveCostPerKgSellable)}</td>
                    <td className="py-2">{formatMoney(batch.totalRawCost)}</td>
                    <td className="py-2">
                      {canEdit ? (
                        <form action={deleteBatchAction}>
                          <input type="hidden" name="id" value={batch._id.toString()} />
                          <button type="submit" className="btn-white text-xs">
                            Delete
                          </button>
                        </form>
                      ) : (
                        <span className="text-xs text-zinc-500">No access</span>
                      )}
                    </td>
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
