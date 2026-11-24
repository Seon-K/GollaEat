export function MapPlaceholder({
  pins = [],
  caption,
}: {
  pins?: string[];
  caption?: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-primary-light h-40">
      <div className="absolute inset-0 opacity-70">
        <div className="absolute left-4 top-6 h-16 w-20 rounded-lg bg-[#d7ebe0]" />
        <div className="absolute right-8 top-10 h-12 w-24 rounded-lg bg-[#cfe5d9]" />
        <div className="absolute left-16 bottom-8 h-14 w-28 rounded-lg bg-[#ddeee5]" />
        <div className="absolute inset-x-0 top-1/2 h-px bg-white/70" />
        <div className="absolute inset-y-0 left-1/3 w-px bg-white/70" />
        <div className="absolute inset-y-0 left-2/3 w-px bg-white/60" />
      </div>
      <div className="relative z-10 flex flex-wrap gap-2 p-4">
        {pins.map((pin) => (
          <span
            key={pin}
            className="inline-flex items-center gap-1 rounded-full bg-card px-2.5 py-1 text-[12px] font-semibold text-primary shadow-sm"
          >
            <span className="size-1.5 rounded-full bg-primary" />
            {pin}
          </span>
        ))}
      </div>
      {caption && (
        <p className="absolute bottom-2 left-3 text-[11px] text-muted">{caption}</p>
      )}
    </div>
  );
}
