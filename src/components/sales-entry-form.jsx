"use client";

import { useState, useMemo } from "react";
import { LowInventoryAlert } from "@/components/low-inventory-alert";
import { formatKg, formatMoney } from "@/lib/number";

export function SalesEntryForm({ action, fishOptions, inventorySummary }) {
  const [selectedFish, setSelectedFish] = useState("");
  const [quantityKg, setQuantityKg] = useState("");
  const [salePricePerKg, setSalePricePerKg] = useState("");

  const fishInventory = useMemo(() => {
    const map = {};
    if (Array.isArray(inventorySummary)) {
      inventorySummary.forEach((item) => {
        if (item && item._id) {
          map[item._id] = {
            remainingKg: Number(item.remainingKg || 0),
            avgEffectiveCost: Number(item.avgEffectiveCost || 0)
          };
        }
      });
    }
    return map;
  }, [inventorySummary]);

  const availableKg = fishInventory[selectedFish]?.remainingKg || 0;
  const effectiveCostPerKg = fishInventory[selectedFish]?.avgEffectiveCost || 0;
  const parsedQuantity = Math.max(0, parseFloat(quantityKg) || 0);
  const parsedSalePrice = Math.max(0, parseFloat(salePricePerKg) || 0);

  // Calculate profit (with guards against NaN)
  const profitPerKg = isFinite(parsedSalePrice - effectiveCostPerKg) ? parsedSalePrice - effectiveCostPerKg : 0;
  const totalProfit = isFinite(profitPerKg * parsedQuantity) ? profitPerKg * parsedQuantity : 0;
  const totalRevenue = isFinite(parsedSalePrice * parsedQuantity) ? parsedSalePrice * parsedQuantity : 0;
  const totalCogs = isFinite(effectiveCostPerKg * parsedQuantity) ? effectiveCostPerKg * parsedQuantity : 0;

  // Donation (5%)
  const grossProfit = isFinite(totalRevenue - totalCogs) ? totalRevenue - totalCogs : 0;
  const donation = grossProfit > 0 ? grossProfit * 0.05 : 0;
  const netProfit = isFinite(grossProfit - donation) ? grossProfit - donation : 0;

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

      <form action={action} className="grid gap-4">
        {/* Form Row 1: Fish, Quantity, Price, Date */}
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
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
              const stockDisplay = stock ? ` (${formatKg(stock.remainingKg)})` : "";
              const isLow = stock && stock.remainingKg < 20;
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
            value={salePricePerKg}
            onChange={(e) => setSalePricePerKg(e.target.value)}
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
        </div>

        {/* Customer Details (Optional) */}
        <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
          <p className="text-xs font-semibold text-blue-900 mb-3">CUSTOMER DETAILS (Optional)</p>
          <div className="grid gap-3 md:grid-cols-3">
            <input
              name="customerName"
              className="input"
              type="text"
              placeholder="Customer name"
            />
            <input
              name="customerPhone"
              className="input"
              type="tel"
              placeholder="Customer phone"
            />
            <input
              name="customerAddress"
              className="input"
              type="text"
              placeholder="Customer address"
            />
          </div>
        </div>

        {/* Pricing Information Card */}
        {selectedFish && effectiveCostPerKg > 0 && (
          <div className="bg-zinc-50 border border-zinc-200 rounded-md p-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {/* Effective Cost */}
              <div>
                <p className="text-xs text-zinc-600 font-medium mb-1">Effective Cost/kg</p>
                <p className="text-lg font-semibold">{formatMoney(effectiveCostPerKg)}</p>
              </div>

              {/* Profit per KG */}
              <div>
                <p className="text-xs text-zinc-600 font-medium mb-1">Profit/kg</p>
                {salePricePerKg ? (
                  <p
                    className={`text-lg font-semibold ${
                      profitPerKg >= 0 ? "text-green-600" : "text-red-600"
                    }`}
                  >
                    {profitPerKg >= 0 ? "+" : ""}{formatMoney(profitPerKg)}
                  </p>
                ) : (
                  <p className="text-lg font-semibold text-zinc-400">—</p>
                )}
              </div>

              {/* Total Profit */}
              <div>
                <p className="text-xs text-zinc-600 font-medium mb-1">Total Profit (before donation)</p>
                {quantityKg && salePricePerKg ? (
                  <p
                    className={`text-lg font-semibold ${
                      grossProfit >= 0 ? "text-green-600" : "text-red-600"
                    }`}
                  >
                    {grossProfit >= 0 ? "+" : ""}{formatMoney(grossProfit)}
                  </p>
                ) : (
                  <p className="text-lg font-semibold text-zinc-400">—</p>
                )}
              </div>

              {/* Net Profit After Donation */}
              <div>
                <p className="text-xs text-zinc-600 font-medium mb-1">Net Profit (after 5% donation)</p>
                {quantityKg && salePricePerKg ? (
                  <p
                    className={`text-lg font-semibold ${
                      netProfit >= 0 ? "text-green-600" : "text-red-600"
                    }`}
                  >
                    {netProfit >= 0 ? "+" : ""}{formatMoney(netProfit)}
                  </p>
                ) : (
                  <p className="text-lg font-semibold text-zinc-400">—</p>
                )}
              </div>
            </div>

            {/* Details breakdown */}
            {quantityKg && salePricePerKg && (
              <div className="mt-3 pt-3 border-t border-zinc-200 text-xs text-zinc-600 space-y-1">
                <div className="flex justify-between">
                  <span>Revenue ({formatKg(parsedQuantity)} × {formatMoney(parsedSalePrice)}):</span>
                  <span className="font-medium">{formatMoney(totalRevenue)}</span>
                </div>
                <div className="flex justify-between">
                  <span>COGS ({formatKg(parsedQuantity)} × {formatMoney(effectiveCostPerKg)}):</span>
                  <span className="font-medium">{formatMoney(totalCogs)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Donation (5% of gross profit):</span>
                  <span className="font-medium">{formatMoney(donation)}</span>
                </div>
              </div>
            )}
          </div>
        )}
      </form>
    </div>
  );
}

