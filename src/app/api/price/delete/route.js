import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { getSession } from "@/lib/hard-auth";
import { canManageInventory } from "@/lib/roles";
import { revalidatePath } from "next/cache";

export async function POST(request) {
  try {
    const session = await getSession();
    if (!session || !canManageInventory(session.role)) {
      return new Response(JSON.stringify({ message: "Permission denied" }), { status: 403 });
    }

    const body = await request.json();
    const id = body.id;

    if (!ObjectId.isValid(id)) {
      return new Response(JSON.stringify({ message: "Invalid price id" }), { status: 400 });
    }

    const db = await getDb();
    const price = await db.collection("price_chart").findOne({ _id: new ObjectId(id) });

    if (!price) {
      return new Response(JSON.stringify({ message: "Price not found" }), { status: 404 });
    }

    await db.collection("price_chart").deleteOne({ _id: new ObjectId(id) });

    // Log the deletion
    await db.collection("price_chart_log").insertOne({
      fishName: price.fishName,
      oldPrice: price.sellingPrice,
      newPrice: null,
      changeType: "deleted",
      notes: `Deleted by ${session.username}`,
      changedBy: session.username,
      changedAt: new Date()
    });

    revalidatePath("/price-chart");

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (error) {
    console.error("Price delete error:", error);
    return new Response(JSON.stringify({ message: error.message || "Failed to delete price" }), { status: 500 });
  }
}
