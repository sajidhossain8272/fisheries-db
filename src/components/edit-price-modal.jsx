"use client";

import { useState } from "react";
import { formatMoney } from "@/lib/number";

export function EditPriceModal({ price, onClose, onSave }) {
  const [sellingPrice, setSellingPrice] = useState(price.sellingPrice);
  const [notes, setNotes] = useState(price.notes || "");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    const formData = new FormData();
    formData.append("id", price._id);
    formData.append("sellingPrice", sellingPrice);
    formData.append("notes", notes);

    try {
      const result = await onSave(formData);
      if (result.success) {
        onClose();
      } else {
        setError(result.error || "Failed to update price");
      }
    } catch (err) {
      setError(err.message || "An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-lg max-w-md w-full">
        <div className="flex justify-between items-center p-5 border-b">
          <h2 className="text-lg font-semibold">Edit Price: {price.fishName}</h2>
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

          <div>
            <label className="label">Fish Name</label>
            <input
              type="text"
              value={price.fishName}
              className="input"
              disabled
            />
          </div>

          <div>
            <label className="label">Selling Price/kg</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={sellingPrice}
              onChange={(e) => setSellingPrice(parseFloat(e.target.value))}
              className="input"
              required
            />
            <p className="text-xs text-zinc-600 mt-1">Previous: {formatMoney(price.sellingPrice)}</p>
          </div>

          <div>
            <label className="label">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="input min-h-20"
              placeholder="Optional notes about this price change"
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
