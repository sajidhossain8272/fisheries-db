"use client";

import { useState } from "react";
import { EditPriceModal } from "@/components/edit-price-modal";
import { formatMoney } from "@/lib/number";

export function PriceChartTableRow({ price, onDelete, canEdit }) {
  const [showEditModal, setShowEditModal] = useState(false);

  const handleSave = async (formData) => {
    try {
      const response = await fetch("/api/price/update", {
        method: "POST",
        body: formData
      });

      if (!response.ok) {
        const error = await response.json();
        return { success: false, error: error.message || "Failed to update price" };
      }

      setShowEditModal(false);
      window.location.reload();
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  const handleDelete = async () => {
    if (confirm(`Are you sure you want to delete the price for ${price.fishName}?`)) {
      try {
        const response = await fetch("/api/price/delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: price._id.toString() })
        });

        if (response.ok) {
          window.location.reload();
        } else {
          const error = await response.json();
          alert(error.message || "Failed to delete price");
        }
      } catch (err) {
        alert(err.message || "An error occurred");
      }
    }
  };

  return (
    <>
      <tr className="border-b border-zinc-200 text-sm">
        <td className="py-2 font-medium">{price.fishName}</td>
        <td className="py-2">{formatMoney(price.sellingPrice)}</td>
        <td className="py-2 text-zinc-600">{price.notes || "—"}</td>
        <td className="py-2">{new Date(price.lastUpdatedAt).toLocaleDateString()}</td>
        <td className="py-2">{price.lastUpdatedBy}</td>
        <td className="py-2 space-x-1">
          {canEdit ? (
            <div className="flex gap-1">
              <button
                onClick={() => setShowEditModal(true)}
                className="px-2 py-1 bg-orange-500 text-white text-xs rounded hover:bg-orange-600"
              >
                Edit
              </button>
              <button
                onClick={handleDelete}
                className="px-2 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          ) : (
            <span className="text-xs text-zinc-500">No access</span>
          )}
        </td>
      </tr>

      {showEditModal && (
        <EditPriceModal
          price={price}
          onClose={() => setShowEditModal(false)}
          onSave={handleSave}
        />
      )}
    </>
  );
}
