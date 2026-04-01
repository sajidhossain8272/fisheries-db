"use client";

import { useState } from "react";
import { EditBatchModal } from "@/components/edit-batch-modal";
import { formatKg, formatMoney } from "@/lib/number";

export function InventoryTableRow({ batch, onDelete, canEdit }) {
  const [showEditModal, setShowEditModal] = useState(false);

  const wasteKg = batch.manualWasteKg !== null && batch.manualWasteKg !== undefined && batch.manualWasteKg > 0
    ? batch.manualWasteKg
    : batch.wastePercent !== null && batch.wastePercent !== undefined
      ? batch.initialKg * batch.wastePercent / 100
      : 0;

  const soldKg = Math.max(0, batch.initialKg - wasteKg - batch.remainingKg);

  const handleSave = async (formData) => {
    try {
      const response = await fetch("/api/batch/update", {
        method: "POST",
        body: formData
      });

      if (!response.ok) {
        const error = await response.json();
        return { success: false, error: error.message || "Failed to update batch" };
      }

      setShowEditModal(false);
      window.location.reload();
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  return (
    <>
      <tr className="border-b border-zinc-200 text-sm">
        <td className="py-2 font-medium">{batch.fishName}</td>
        <td className="py-2">{new Date(batch.purchaseDate).toLocaleDateString()}</td>
        <td className="py-2">{formatKg(batch.initialKg)}</td>
        <td className="py-2 font-medium text-blue-600">{formatKg(soldKg)}</td>
        <td className="py-2">{formatKg(batch.remainingKg)}</td>
        <td className="py-2">
          {batch.manualWasteKg !== null && batch.manualWasteKg !== undefined && batch.manualWasteKg > 0 ? (
            <span title="Manual waste kg">{formatKg(batch.manualWasteKg)} kg</span>
          ) : (
            <span>{batch.wastePercent !== null && batch.wastePercent !== undefined ? Number(batch.wastePercent).toFixed(2) : "0"}%</span>
          )}
        </td>
        <td className="py-2">{formatMoney(batch.buyPricePerKgRaw)}</td>
        <td className="py-2">{formatMoney(batch.effectiveCostPerKgSellable)}</td>
        <td className="py-2">{formatMoney(batch.totalRawCost)}</td>
        <td className="py-2 space-x-1">
          {canEdit ? (
            <div className="flex gap-1">
              <button
                onClick={() => setShowEditModal(true)}
                className="px-2 py-1 bg-orange-500 text-white text-xs rounded hover:bg-orange-600"
              >
                Edit
              </button>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (confirm("Are you sure you want to delete this batch?")) {
                    onDelete(batch._id.toString());
                  }
                }}
                style={{ display: "inline" }}
              >
                <input type="hidden" name="id" value={batch._id.toString()} />
                <button
                  type="submit"
                  className="px-2 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700"
                >
                  Delete
                </button>
              </form>
            </div>
          ) : (
            <span className="text-xs text-zinc-500">No access</span>
          )}
        </td>
      </tr>

      {showEditModal && (
        <EditBatchModal
          batch={batch}
          onClose={() => setShowEditModal(false)}
          onSave={handleSave}
        />
      )}
    </>
  );
}
