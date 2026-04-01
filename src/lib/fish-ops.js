import { getDb, getMongoClient } from "@/lib/mongodb";
import { round2 } from "@/lib/number";

const DONATION_RATE = 0.05;
const REPORT_TIMEZONE = process.env.REPORT_TIMEZONE || "Asia/Dhaka";

export function toDayKey(date = new Date(), timeZone = REPORT_TIMEZONE) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

export function computeBatchMetrics({ initialKg, wastePercent, buyPricePerKgRaw }) {
  const totalRawCost = round2(initialKg * buyPricePerKgRaw);
  const sellableKg = round2(initialKg * (1 - wastePercent / 100));
  const effectiveCostPerKgSellable = sellableKg > 0 ? round2(totalRawCost / sellableKg) : 0;

  return {
    totalRawCost,
    sellableKg,
    effectiveCostPerKgSellable
  };
}

export async function recordSaleFIFO({
  fishName,
  quantityKg,
  salePricePerKg,
  saleDate,
  actorUsername
}) {
  const mongoClient = await getMongoClient();
  const db = await getDb();
  const session = mongoClient.startSession();
  let createdSale = null;

  try {
    await session.withTransaction(async () => {
      const batches = await db
        .collection("inventory_batches")
        .find(
          {
            fishName,
            remainingKg: { $gt: 0 }
          },
          { session }
        )
        .sort({ purchaseDate: 1, createdAt: 1 })
        .toArray();

      const availableKg = round2(
        batches.reduce((sum, batch) => sum + Number(batch.remainingKg || 0), 0)
      );

      if (availableKg < quantityKg) {
        throw new Error(`Insufficient stock. Available ${availableKg.toFixed(2)} kg.`);
      }

      let remaining = quantityKg;
      let cogs = 0;
      const allocations = [];
      const updates = [];

      for (const batch of batches) {
        if (remaining <= 0) {
          break;
        }

        const taken = Math.min(remaining, Number(batch.remainingKg));
        if (taken <= 0) {
          continue;
        }

        remaining = round2(remaining - taken);
        const lineCost = round2(taken * Number(batch.effectiveCostPerKgSellable));
        cogs = round2(cogs + lineCost);

        allocations.push({
          batchId: batch._id.toString(),
          purchaseDate: batch.purchaseDate,
          quantityKg: round2(taken),
          costPerKg: round2(Number(batch.effectiveCostPerKgSellable))
        });

        updates.push({
          updateOne: {
            filter: { _id: batch._id },
            update: { $inc: { remainingKg: -round2(taken) }, $set: { updatedAt: new Date() } }
          }
        });
      }

      if (remaining > 0) {
        throw new Error("Allocation failed due to concurrent stock update. Retry sale.");
      }

      if (updates.length > 0) {
        await db.collection("inventory_batches").bulkWrite(updates, { session });
      }

      const revenue = round2(quantityKg * salePricePerKg);
      const grossProfit = round2(revenue - cogs);
      const donationAmount = grossProfit > 0 ? round2(grossProfit * DONATION_RATE) : 0;
      const netProfit = round2(grossProfit - donationAmount);

      const sale = {
        fishName,
        quantityKg: round2(quantityKg),
        salePricePerKg: round2(salePricePerKg),
        saleDate,
        saleDay: toDayKey(saleDate),
        revenue,
        cogs,
        grossProfit,
        donationAmount,
        netProfit,
        donationRate: DONATION_RATE,
        allocations,
        createdBy: actorUsername || null,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const result = await db.collection("sales").insertOne(sale, { session });
      createdSale = { ...sale, _id: result.insertedId };
    });
  } catch (error) {
    console.error("recordSaleFIFO error:", error);
    throw error;
  } finally {
    await session.endSession();
  }

  return createdSale;
}
