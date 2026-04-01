"use client";

import { useState } from "react";

export function InventoryBatchForm({ action }) {
  const [wastePercent, setWastePercent] = useState("");
  const [manualWasteKg, setManualWasteKg] = useState("");

  const isWastePercentFilled = wastePercent !== "" && wastePercent !== "0";
  const isManualWasteFilled = manualWasteKg !== "" && manualWasteKg !== "0";

  return (
    <form action={action} className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-7">
      <input name="fishName" className="input" placeholder="Fish name" required />
      <input name="purchaseDate" className="input" type="date" required />
      <input
        name="initialKg"
        className="input"
        type="number"
        min="0.01"
        step="0.01"
        placeholder="Raw kg"
        required
      />
      <div>
        <input
          name="wastePercent"
          className={`input ${isManualWasteFilled ? "opacity-50 cursor-not-allowed" : ""}`}
          type="number"
          min="0"
          max="99.99"
          step="0.01"
          placeholder="Waste %"
          value={wastePercent}
          onChange={(e) => setWastePercent(e.target.value)}
          disabled={isManualWasteFilled}
          title={isManualWasteFilled ? "Disabled: Manual waste kg is entered" : ""}
        />
      </div>
      <div>
        <input
          name="manualWasteKg"
          className={`input ${isWastePercentFilled ? "opacity-50 cursor-not-allowed" : ""}`}
          type="number"
          min="0"
          step="0.01"
          placeholder="Manual waste kg"
          value={manualWasteKg}
          onChange={(e) => setManualWasteKg(e.target.value)}
          disabled={isWastePercentFilled}
          title={isWastePercentFilled ? "Disabled: Waste % is entered" : ""}
        />
      </div>
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
  );
}
