const TENANTS = [
  { name: "NairaWave", mark: "N", color: "#00a86b" },
  { name: "GidiExpress", mark: "G", color: "#f59e0b" },
  { name: "BoltPay", mark: "B", color: "#2563eb" },
  { name: "SolarHub", mark: "S", color: "#7c3aed" },
  { name: "MediQuick", mark: "M", color: "#e11d48" },
];

/** Trust strip — the demo instance ships five live tenants, shown as marks
 *  only. No borders, no category labels; the monogram carries the brand. */
export function TrustStrip() {
  return (
    <section className="bg-surface">
      <div className="mx-auto max-w-6xl px-6 pb-20 lg:px-8">
        <p className="text-center text-[12px] font-semibold text-text-3">
          One demo instance, five live brands, one console
        </p>
        <ul className="mt-7 flex flex-wrap items-center justify-center gap-x-12 gap-y-5">
          {TENANTS.map((t) => (
            <li
              key={t.name}
              aria-label={t.name}
              title={t.name}
              className="flex items-center gap-2.5"
            >
              <span
                aria-hidden="true"
                className="flex h-8 w-8 items-center justify-center rounded-[9px] font-display text-[14px] font-bold text-white"
                style={{ backgroundColor: t.color }}
              >
                {t.mark}
              </span>
              <span className="text-[14px] font-bold text-text-2">{t.name}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
