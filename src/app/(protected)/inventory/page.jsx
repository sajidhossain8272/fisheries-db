import { ObjectId } from "mongodb";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/mongodb";
import { canManageInventory } from "@/lib/roles";
import { getSession } from "@/lib/hard-auth";
import { formatKg, formatMoney, round2, toNumber } from "@/lib/number";
import { InventoryBatchForm } from "@/components/inventory-form";
import { LowInventoryAlert } from "@/components/low-inventory-alert";
import { InventoryTableRow } from "@/components/inventory-table-row";

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

async function updateBatchAction(formData) {
  "use server";

  const session = await getSession();
  if (!session || !canManageInventory(session.role)) {
    throw new Error("Permission denied for inventory management.");
  }

  const id = String(formData.get("id") || "");
  if (!ObjectId.isValid(id)) {
    throw new Error("Invalid batch id.");
  }

  const fishName = String(formData.get("fishName") || "").trim();
  const initialKg = toNumber(formData.get("initialKg"));
  const remainingKg = toNumber(formData.get("remainingKg"));
  const wastePercent = toNumber(formData.get("wastePercent"));
  const manualWasteKg = toNumber(formData.get("manualWasteKg"));
  const buyPricePerKgRaw = toNumber(formData.get("buyPricePerKgRaw"));
  const notes = String(formData.get("notes") || "").trim();

  if (!fishName || initialKg <= 0 || buyPricePerKgRaw <= 0 || remainingKg < 0 || remainingKg > initialKg) {
    throw new Error("Invalid batch data.");
  }

  // Calculate waste
  let actualWasteKg = 0;
  if (manualWasteKg > 0) {
    actualWasteKg = round2(manualWasteKg);
  } else if (wastePercent >= 0) {
    actualWasteKg = round2(initialKg * (wastePercent / 100));
  }

  const totalRawCost = round2(initialKg * buyPricePerKgRaw);
  const effectiveCostPerKgSellable = remainingKg > 0 ? round2(totalRawCost / remainingKg) : 0;

  const db = await getDb();
  await db.collection("inventory_batches").updateOne(
    { _id: new ObjectId(id) },
    {
      $set: {
        fishName,
        initialKg: round2(initialKg),
        remainingKg: round2(remainingKg),
        wastePercent: wastePercent >= 0 ? round2(wastePercent) : null,
        manualWasteKg: manualWasteKg > 0 ? round2(manualWasteKg) : null,
        buyPricePerKgRaw: round2(buyPricePerKgRaw),
        totalRawCost,
        effectiveCostPerKgSellable,
        notes: notes || null,
        updatedBy: session.username,
        updatedAt: new Date()
      }
    }
  );

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
  const [batches, summary, soldByFish] = await Promise.all([
    db.collection("inventory_batches").find({}).sort({ purchaseDate: 1, createdAt: 1 }).toArray(),
    db
      .collection("inventory_batches")
      .aggregate([
        {
          $group: {
            _id: "$fishName",
            remainingKg: { $sum: "$remainingKg" },
            avgEffectiveCost: { $avg: "$effectiveCostPerKgSellable" },
            totalReceived: { $sum: "$initialKg" }
          }
        },
        { $sort: { _id: 1 } }
      ])
      .toArray(),
    db
      .collection("sales")
      .aggregate([
        {
          $group: {
            _id: "$fishName",
            totalSoldKg: { $sum: "$quantityKg" }
          }
        },
        { $sort: { _id: 1 } }
      ])
      .toArray()
  ]);
  
  // Merge sold data into summary
  const summaryWithSold = summary.map((row) => {
    const sold = soldByFish.find((s) => s._id === row._id);
    return {
      ...row,
      totalSoldKg: sold?.totalSoldKg || 0
    };
  });
  
  return { batches, summary: summaryWithSold };
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
          <InventoryBatchForm action={createBatchAction} />
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
          summary.map((row) => {
            const isLowStock = row.remainingKg < 20;
            return (
              <article
                key={row._id}
                className={`card p-4 ${isLowStock ? "border-yellow-300 bg-yellow-50" : ""}`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="label">{row._id}</p>
                    <div className="mt-2 space-y-1">
                      <div className="flex justify-between">
                        <span className="text-xs text-zinc-600">Remaining:</span>
                        <span className="text-sm font-semibold">{formatKg(row.remainingKg)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-xs text-zinc-600">Sold:</span>
                        <span className="text-sm font-semibold">{formatKg(row.totalSoldKg)}</span>
                      </div>
                      <div className="flex justify-between pt-1 border-t border-zinc-300">
                        <span className="text-xs text-zinc-600">Received:</span>
                        <span className="text-sm font-semibold">{formatKg(row.totalReceived)}</span>
                      </div>
                    </div>
                    <p className="mt-2 text-xs text-zinc-600">
                      Avg eff. cost {formatMoney(row.avgEffectiveCost)}/kg
                    </p>
                  </div>
                  {isLowStock && (
                    <svg
                      className="w-6 h-6 text-yellow-600 flex-shrink-0 ml-2"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                        clipRule="evenodd"
                      />
                    </svg>
                  )}
                </div>
              </article>
            );
          })
        )}
      </section>

      <section className="card p-5">
        <h2 className="text-lg font-semibold">Batch Table</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[1100px] border-collapse">
            <thead>
              <tr className="border-b border-zinc-300 text-left text-xs uppercase tracking-wide text-zinc-500">
                <th className="py-2">Fish</th>
                <th className="py-2">Purchase Date</th>
                <th className="py-2">Initial</th>
                <th className="py-2">Sold</th>
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
                  <td className="py-4 text-sm text-zinc-500" colSpan={10}>
                    No batches found.
                  </td>
                </tr>
              ) : (
                batches.map((batch) => (
                  <InventoryTableRow
                    key={batch._id.toString()}
                    batch={batch}
                    onDelete={async (id) => {
                      const formData = new FormData();
                      formData.append("id", id);
                      await deleteBatchAction(formData);
                    }}
                    canEdit={canEdit}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
