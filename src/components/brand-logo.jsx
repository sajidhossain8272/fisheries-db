export default function BrandLogo({ compact = false }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-full border border-black bg-white">
        <svg
          viewBox="0 0 64 64"
          className="h-6 w-6"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <path
            d="M12 34C17.5 25.5 26.5 20 36.5 20C45.5 20 52.5 24.5 57 31.5C52.5 38.5 45.5 43 36.5 43C26.5 43 17.5 37.5 12 29"
            stroke="black"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="38" cy="31.5" r="3" fill="black" />
          <path d="M8 43H56" stroke="black" strokeWidth="4" strokeLinecap="round" />
        </svg>
      </div>
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.22em] text-zinc-500">Central Kitchen</p>
        <p className={`font-semibold text-black ${compact ? "text-base" : "text-lg"}`}>Khulna Fisheries</p>
      </div>
    </div>
  );
}
