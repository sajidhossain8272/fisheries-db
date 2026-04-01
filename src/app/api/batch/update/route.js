import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { getSession } from "@/lib/hard-auth";
import { canManageInventory } from "@/lib/roles";
import { toNumber, round2 } from "@/lib/number";
import { revalidatePath } from "next/cache";

export async function POST(request) {
  try {
    const session = await getSession();
    if (!session || !canManageInventory(session.role)) {
      return new Response(JSON.stringify({ message: "Permission denied" }), { status: 403 });
    }

    const formData = await request.formData();
    
    const id = String(formData.get("id") || "");
    if (!ObjectId.isValid(id)) {
      return new Response(JSON.stringify({ message: "Invalid batch id" }), { status: 400 });
    }

    const fishName = String(formData.get("fishName") || "").trim();
    const initialKg = toNumber(formData.get("initialKg"));
    const remainingKg = toNumber(formData.get("remainingKg"));
    const wastePercent = toNumber(formData.get("wastePercent"));
    const manualWasteKg = toNumber(formData.get("manualWasteKg"));
    const buyPricePerKgRaw = toNumber(formData.get("buyPricePerKgRaw"));
    const notes = String(formData.get("notes") || "").trim();

    if (!fishName || initialKg <= 0 || buyPricePerKgRaw <= 0 || remainingKg < 0 || remainingKg > initialKg) {
      return new Response(JSON.stringify({ message: "Invalid batch data" }), { status: 400 });
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

    // Trigger revalidation
    revalidatePath("/inventory");
    revalidatePath("/dashboard");
    revalidatePath("/sales");

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (error) {
    console.error("Batch update error:", error);
    return new Response(JSON.stringify({ message: error.message || "Failed to update batch" }), { status: 500 });
  }
}
