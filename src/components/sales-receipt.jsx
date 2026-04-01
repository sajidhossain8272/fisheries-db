"use client";

import { formatKg, formatMoney } from "@/lib/number";

export function SalesReceipt({ sale, onClose }) {
  if (!sale) return null;

  const handlePrint = () => {
    window.print();
  };

  const formatDateTime = (date) => {
    return new Date(date).toLocaleString();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-lg max-w-sm w-full">
        {/* Print Styles */}
        <style>{`
          @media print {
            body {
              margin: 0;
              padding: 0;
              background: white;
            }
            .receipt-container {
              max-width: 320px;
              margin: 0 auto;
              padding: 0;
              font-family: monospace;
            }
            .receipt-modal {
              display: none;
            }
            .no-print {
              display: none !important;
            }
          }
        `}</style>

        {/* Modal Controls */}
        <div className="flex justify-between items-center p-4 border-b no-print">
          <h3 className="font-semibold">Sales Receipt</h3>
          <div className="flex gap-2">
            <button
              onClick={handlePrint}
              className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
            >
              🖨️ Print
            </button>
            <button
              onClick={onClose}
              className="px-3 py-1 bg-zinc-300 text-black text-sm rounded hover:bg-zinc-400"
            >
              Close
            </button>
          </div>
        </div>

        {/* Receipt Content */}
        <div className="receipt-container p-6 max-w-sm mx-auto" style={{ fontFamily: "monospace", fontSize: "12px" }}>
          {/* Header */}
          <div className="text-center mb-4 border-b pb-3">
            <p className="font-bold text-lg">FISHERIES</p>
            <p className="text-xs text-zinc-600">Sales Receipt</p>
          </div>

          {/* Transaction Details */}
          <div className="mb-4 space-y-1 text-xs">
            <div className="flex justify-between">
              <span>Date:</span>
              <span>{formatDateTime(sale.saleDate)}</span>
            </div>
            <div className="flex justify-between">
              <span>Receipt #:</span>
              <span>{sale._id.toString().slice(-8).toUpperCase()}</span>
            </div>
            {sale.createdBy && (
              <div className="flex justify-between">
                <span>Cashier:</span>
                <span>{sale.createdBy}</span>
              </div>
            )}
          </div>

          <div className="border-t border-b py-3 mb-4">
            {/* Customer Info (if provided) */}
            {(sale.customerName || sale.customerPhone || sale.customerAddress) && (
              <div className="mb-3 pb-3 border-b">
                <p className="font-bold text-xs mb-1">CUSTOMER</p>
                {sale.customerName && (
                  <p className="text-xs">{sale.customerName}</p>
                )}
                {sale.customerPhone && (
                  <p className="text-xs">{sale.customerPhone}</p>
                )}
                {sale.customerAddress && (
                  <p className="text-xs">{sale.customerAddress}</p>
                )}
              </div>
            )}

            {/* Item Details */}
            <div className="mb-2">
              <p className="font-bold mb-1">{sale.fishName}</p>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span>Quantity:</span>
                  <span>{formatKg(sale.quantityKg)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Price/kg:</span>
                  <span>{formatMoney(sale.salePricePerKg)}</span>
                </div>
                <div className="flex justify-between font-bold border-t pt-1 mt-1">
                  <span>Subtotal:</span>
                  <span>{formatMoney(sale.revenue)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Cost Breakdown */}
          <div className="mb-4 space-y-1 text-xs">
            <div className="flex justify-between">
              <span>Revenue:</span>
              <span>{formatMoney(sale.revenue)}</span>
            </div>
            <div className="flex justify-between">
              <span>COGS:</span>
              <span>({formatMoney(sale.cogs)})</span>
            </div>
            <div className="flex justify-between">
              <span>Gross Profit:</span>
              <span>{formatMoney(sale.grossProfit)}</span>
            </div>
            <div className="flex justify-between text-zinc-600">
              <span>Donation (5%):</span>
              <span>({formatMoney(sale.donationAmount)})</span>
            </div>
          </div>

          {/* Final Total */}
          <div className="border-t border-b py-2 mb-4">
            <div className="flex justify-between font-bold">
              <span>NET PROFIT:</span>
              <span style={{ color: sale.netProfit >= 0 ? "green" : "red" }}>
                {formatMoney(sale.netProfit)}
              </span>
            </div>
          </div>

          {/* Footer */}
          <div className="text-center text-xs text-zinc-600 mt-4">
            <p>Thank you for your business!</p>
            <p className="mt-1">{new Date().toLocaleString()}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
