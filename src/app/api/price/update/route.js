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
      return new Response(JSON.stringify({ message: "Invalid price id" }), { status: 400 });
    }

    const sellingPrice = toNumber(formData.get("sellingPrice"));
    const notes = String(formData.get("notes") || "").trim();

    if (sellingPrice <= 0) {
      return new Response(JSON.stringify({ message: "Invalid price" }), { status: 400 });
    }

    const db = await getDb();
    
    // Get the current price to log the change
    const currentPrice = await db.collection("price_chart").findOne({ _id: new ObjectId(id) });
    
    if (!currentPrice) {
      return new Response(JSON.stringify({ message: "Price not found" }), { status: 404 });
    }

    // Update the current price
    await db.collection("price_chart").updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          sellingPrice: round2(sellingPrice),
          notes: notes || null,
          lastUpdatedBy: session.username,
          lastUpdatedAt: new Date()
        }
      }
    );

    // Log the change
    await db.collection("price_chart_log").insertOne({
      fishName: currentPrice.fishName,
      oldPrice: currentPrice.sellingPrice,
      newPrice: round2(sellingPrice),
      changeType: sellingPrice > currentPrice.sellingPrice ? "increased" : sellingPrice < currentPrice.sellingPrice ? "decreased" : "updated",
      notes: notes || null,
      changedBy: session.username,
      changedAt: new Date()
    });

    revalidatePath("/price-chart");

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (error) {
    console.error("Price update error:", error);
    return new Response(JSON.stringify({ message: error.message || "Failed to update price" }), { status: 500 });
  }
}
