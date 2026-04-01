"use client";

export function LowInventoryAlert({ message, variant = "warning" }) {
  const bgColor = variant === "error" ? "bg-red-50" : "bg-yellow-50";
  const borderColor = variant === "error" ? "border-red-300" : "border-yellow-300";
  const textColor = variant === "error" ? "text-red-800" : "text-yellow-800";
  const iconColor = variant === "error" ? "text-red-500" : "text-yellow-500";

  return (
    <div className={`rounded-md border ${borderColor} ${bgColor} p-3 flex items-start gap-2`}>
      <svg
        className={`w-5 h-5 flex-shrink-0 mt-0.5 ${iconColor}`}
        fill="currentColor"
        viewBox="0 0 20 20"
      >
        <path
          fillRule="evenodd"
          d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
          clipRule="evenodd"
        />
      </svg>
      <p className={`text-sm ${textColor}`}>{message}</p>
    </div>
  );
}
