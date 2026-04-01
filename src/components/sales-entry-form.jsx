"use client";

import { useState, useMemo } from "react";
import { LowInventoryAlert } from "@/components/low-inventory-alert";
import { formatKg } from "@/lib/number";

export function SalesEntryForm({ action, fishOptions, inventorySummary }) {
  const [selectedFish, setSelectedFish] = useState("");
  const [quantityKg, setQuantityKg] = useState("");

  const fishInventory = useMemo(() => {
    const map = {};
    inventorySummary.forEach((item) => {
      map[item._id] = item.remainingKg;
    });
    return map;
  }, [inventorySummary]);

  const availableKg = fishInventory[selectedFish] || 0;
  const parsedQuantity = parseFloat(quantityKg) || 0;
  
  const exceedsInventory = selectedFish && parsedQuantity > availableKg && availableKg > 0;
  const isLowStock = selectedFish && availableKg < 20 && availableKg > 0;
  const isOutOfStock = selectedFish && availableKg === 0;

  return (
    <div className="space-y-4">
      {/* Inventory Status Alerts */}
      {selectedFish && (
        <div className="space-y-2">
          {isOutOfStock && (
            <LowInventoryAlert
              message={`⚠️ ${selectedFish} is out of stock!`}
              variant="error"
            />
          )}
          {isLowStock && !isOutOfStock && (
            <LowInventoryAlert
              message={`⚠️ Low stock alert: Only ${formatKg(availableKg)} available`}
            />
          )}
          {exceedsInventory && (
            <LowInventoryAlert
              message={`⚠️ Only ${formatKg(availableKg)} available, but ${formatKg(parsedQuantity)} requested`}
              variant="error"
            />
          )}
        </div>
      )}

      <form action={action} className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <select
          name="fishName"
          className="input"
          required
          defaultValue=""
          value={selectedFish}
          onChange={(e) => setSelectedFish(e.target.value)}
        >
          <option value="" disabled>
            Select fish
          </option>
          {fishOptions.map((fish) => {
            const stock = fishInventory[fish];
            const stockDisplay = stock ? ` (${formatKg(stock)})` : "";
            const isLow = stock && stock < 20;
            return (
              <option key={fish} value={fish}>
                {fish}
                {isLow ? " ⚠️" : ""}
                {stockDisplay}
              </option>
            );
          })}
        </select>
        <input
          name="quantityKg"
          className="input"
          type="number"
          step="0.01"
          min="0.01"
          placeholder="Qty kg"
          required
          value={quantityKg}
          onChange={(e) => setQuantityKg(e.target.value)}
          disabled={isOutOfStock}
        />
        <input
          name="salePricePerKg"
          className="input"
          type="number"
          step="0.01"
          min="0.01"
          placeholder="Sale price/kg"
          required
          disabled={isOutOfStock}
        />
        <input
          name="saleDate"
          className="input"
          type="datetime-local"
          disabled={isOutOfStock}
        />
        <button
          type="submit"
          className="btn-black"
          disabled={isOutOfStock || exceedsInventory}
        >
          Record Sale
        </button>
      </form>
    </div>
  );
}
