"use client";

import { useState } from "react";
import { formatKg, formatMoney } from "@/lib/number";

export function EditBatchModal({ batch, onClose, onSave }) {
  const [fishName, setFishName] = useState(batch.fishName);
  const [initialKg, setInitialKg] = useState(batch.initialKg);
  const [remainingKg, setRemainingKg] = useState(batch.remainingKg);
  const [wastePercent, setWastePercent] = useState(batch.wastePercent !== null ? batch.wastePercent : "");
  const [manualWasteKg, setManualWasteKg] = useState(batch.manualWasteKg !== null ? batch.manualWasteKg : "");
  const [buyPricePerKgRaw, setBuyPricePerKgRaw] = useState(batch.buyPricePerKgRaw);
  const [notes, setNotes] = useState(batch.notes || "");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    const formData = new FormData();
    formData.append("id", batch._id);
    formData.append("fishName", fishName);
    formData.append("initialKg", initialKg);
    formData.append("remainingKg", remainingKg);
    formData.append("wastePercent", wastePercent !== "" ? parseFloat(wastePercent) : -1);
    formData.append("manualWasteKg", manualWasteKg !== "" ? parseFloat(manualWasteKg) : 0);
    formData.append("buyPricePerKgRaw", buyPricePerKgRaw);
    formData.append("notes", notes);

    try {
      const result = await onSave(formData);
      if (result.success) {
        onClose();
      } else {
        setError(result.error || "Failed to update batch");
      }
    } catch (err) {
      setError(err.message || "An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-lg max-w-2xl w-full">
        <div className="flex justify-between items-center p-5 border-b">
          <h2 className="text-lg font-semibold">Edit Batch</h2>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-700 text-2xl"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="p-3 bg-red-100 border border-red-300 text-red-700 rounded text-sm">
              {error}
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="label">Fish Name</label>
              <input
                type="text"
                value={fishName}
                onChange={(e) => setFishName(e.target.value)}
                className="input"
                required
              />
            </div>
            <div>
              <label className="label">Purchase Date</label>
              <input
                type="date"
                value={new Date(batch.purchaseDate).toISOString().split("T")[0]}
                className="input"
                disabled
              />
              <p className="text-xs text-zinc-500 mt-1">Cannot change purchase date</p>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <label className="label">Initial KG</label>
              <input
                type="number"
                step="0.01"
                value={initialKg}
                onChange={(e) => setInitialKg(parseFloat(e.target.value))}
                className="input"
                required
              />
            </div>
            <div>
              <label className="label">Remaining KG</label>
              <input
                type="number"
                step="0.01"
                value={remainingKg}
                onChange={(e) => setRemainingKg(parseFloat(e.target.value))}
                className="input"
                required
              />
            </div>
            <div>
              <label className="label">Buy Price/kg</label>
              <input
                type="number"
                step="0.01"
                value={buyPricePerKgRaw}
                onChange={(e) => setBuyPricePerKgRaw(parseFloat(e.target.value))}
                className="input"
                required
              />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2 bg-blue-50 p-3 rounded">
            <div>
              <label className="label">Waste %</label>
              <input
                type="number"
                step="0.01"
                min="0"
                max="99.99"
                value={wastePercent}
                onChange={(e) => setWastePercent(e.target.value)}
                placeholder="Leave empty if manual waste kg"
                className="input"
              />
              {wastePercent !== "" && <p className="text-xs text-zinc-600 mt-1">Waste kg: {(initialKg * parseFloat(wastePercent) / 100).toFixed(2)}</p>}
            </div>
            <div>
              <label className="label">Manual Waste KG</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={manualWasteKg}
                onChange={(e) => setManualWasteKg(e.target.value)}
                placeholder="Leave empty if waste %"
                className="input"
              />
              {manualWasteKg !== "" && <p className="text-xs text-zinc-600 mt-1">{parseFloat(manualWasteKg).toFixed(2)} kg waste</p>}
            </div>
          </div>

          <div>
            <label className="label">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="input min-h-20"
              placeholder="Optional notes about this batch"
            />
          </div>

          <div className="flex gap-2 justify-end pt-4 border-t">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-zinc-200 text-black rounded hover:bg-zinc-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-4 py-2 bg-black text-white rounded hover:bg-zinc-800 disabled:opacity-50"
            >
              {isLoading ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
