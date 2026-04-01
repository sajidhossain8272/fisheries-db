"use client";

import { useState } from "react";
import { SalesReceipt } from "@/components/sales-receipt";
import { formatKg, formatMoney } from "@/lib/number";

export function SalesTableRow({ sale }) {
  const [showReceipt, setShowReceipt] = useState(false);

  return (
    <>
      <tr className="border-b border-zinc-200 text-sm">
        <td className="py-2">{new Date(sale.saleDate).toLocaleString()}</td>
        <td className="py-2 font-medium">{sale.fishName}</td>
        <td className="py-2">{formatKg(sale.quantityKg)}</td>
        <td className="py-2">{formatMoney(sale.revenue)}</td>
        <td className="py-2">{formatMoney(sale.cogs)}</td>
        <td className="py-2">{formatMoney(sale.grossProfit)}</td>
        <td className="py-2">{formatMoney(sale.donationAmount)}</td>
        <td className="py-2 font-medium">{formatMoney(sale.netProfit)}</td>
        <td className="py-2">
          <button
            onClick={() => setShowReceipt(true)}
            className="px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
          >
            🖨️ Receipt
          </button>
        </td>
      </tr>

      {showReceipt && (
        <SalesReceipt
          sale={sale}
          onClose={() => setShowReceipt(false)}
        />
      )}
    </>
  );
}
