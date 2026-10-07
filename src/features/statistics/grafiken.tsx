import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { aufklappKopfKlassen } from '@/components/ui/aufklappStile';
import { REIHEN, rasterschritte, type Kategorie, type Reihe } from './diagramme';

/**
 * Grafiken der Statistikseite (STA-007) — schlicht, ohne Bibliothek.
 *
 * Regeln nach dem Dataviz-Verfahren: eine Achse, dünne Säulen mit 4 px
 * gerundetem Ende an der Grundlinie, 2 px Fuge zwischen gestapelten Teilen,
 * zurückhaltendes Raster, eine Legende ab zwei Reihen, zu jeder Grafik die
 * Zahlen als Tabelle. Farben kommen aus den festen Reihentokens
 * (`--color-reihe-1` …, `index.css`) in fester Reihenfolge; Text trägt nie
 * eine Reihenfarbe.
 */

function useBreite(standard: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [breite, setBreite] = useState(standard);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const beobachter = new ResizeObserver(([eintrag]) => {
      if (eintrag) setBreite(Math.max(240, Math.round(eintrag.contentRect.width)));
    });
    beobachter.observe(element);
    return () => beobachter.disconnect();
  }, []);
  return { ref, breite };
}

/** Pfad einer Säule mit gerundetem oberem Ende (4 px) und flacher Grundlinie. */
function saeulenpfad(x: number, y: number, b: number, h: number, rund: boolean): string {
  if (h <= 0) return '';
  const r = rund ? Math.min(4, b / 2, h) : 0;
  return (
    `M${x},${y + h}V${y + r}` +
    (r ? `Q${x},${y} ${x + r},${y}` : '') +
    `H${x + b - r}` +
    (r ? `Q${x + b},${y} ${x + b},${y + r}` : '') +
    `V${y + h}Z`
  );
}

export function Saeulendiagramm({
  titel,
  kategorien,
  reihen,
  format,
  achsenformat = format,
  gestapelt = false,
  hoehe = 220,
}: {
  /** Name der Grafik für Vorlesesoftware und Tabelle. */
  titel: string;
  kategorien: Kategorie[];
  reihen: Reihe[];
  format: (wert: number) => string;
  achsenformat?: (wert: number) => string;
  gestapelt?: boolean;
  hoehe?: number;
}) {
  const { ref, breite } = useBreite(640);
  const [aktiv, setAktiv] = useState<number | null>(null);
  const tooltipId = useId();

  const saeulen = reihen.filter((r) => (r.art ?? 'saeule') === 'saeule');
  const punkte = reihen.filter((r) => r.art === 'punkt');
  const n = kategorien.length;

  // Gestapelt zeigt jede Säule die Summe ihrer positiven Teile; ein negativer
  // Monat (nur Stornos) steht dann in der Tabelle, nicht als Säule nach unten.
  const hoechster = Math.max(
    0,
    ...kategorien.map((_, i) =>
      gestapelt
        ? saeulen.reduce((s, r) => s + Math.max(0, r.werte[i] ?? 0), 0)
        : Math.max(0, ...saeulen.map((r) => r.werte[i] ?? 0)),
    ),
    ...punkte.flatMap((r) => r.werte.map((w) => Math.max(0, w))),
  );
  const raster = rasterschritte(hoechster);
  const oben = raster.at(-1) || 1;

  const links = 60;
  const rechts = 8;
  const kopf = 12;
  const fuss = 26;
  const flaeche = hoehe - kopf - fuss;
  const band = (breite - links - rechts) / Math.max(1, n);
  const y = (wert: number) => kopf + flaeche - (Math.max(0, wert) / oben) * flaeche;
  // Unter 72 px je Monat steht an der Achse nur der Monat, ohne Jahr.
  const eng = band < 72;

  const saeulenbreite = gestapelt
    ? Math.min(40, band * 0.6)
    : Math.min(28, (band * 0.7) / Math.max(1, saeulen.length));

  return (
    <figure className="m-0">
      <div ref={ref} className="relative">
        <svg
          width={breite}
          height={hoehe}
          role="group"
          aria-label={titel}
          className="block max-w-full"
          onMouseLeave={() => setAktiv(null)}
        >
          {raster.map((wert) => (
            <g key={wert}>
              <line
                x1={links}
                x2={breite - rechts}
                y1={y(wert)}
                y2={y(wert)}
                stroke="var(--color-line)"
                strokeWidth={wert === 0 ? 1.5 : 1}
              />
              <text
                x={links - 8}
                y={y(wert)}
                dy="0.32em"
                textAnchor="end"
                className="fill-ink-muted text-xs tabular-nums"
              >
                {achsenformat(wert)}
              </text>
            </g>
          ))}

          {kategorien.map((kategorie, i) => {
            const mitte = links + band * i + band / 2;
            let stapel = 0;
            return (
              <g key={kategorie.label}>
                {aktiv === i ? (
                  <rect
                    x={links + band * i + 1}
                    y={kopf}
                    width={band - 2}
                    height={flaeche}
                    fill="var(--color-surface-sunken)"
                  />
                ) : null}
                {saeulen.map((reihe, r) => {
                  const wert = Math.max(0, reihe.werte[i] ?? 0);
                  if (gestapelt) {
                    const unten = y(stapel);
                    const darunter = stapel > 0;
                    stapel += wert;
                    const obenY = y(stapel);
                    const letzte = !saeulen.slice(r + 1).some((w) => (w.werte[i] ?? 0) > 0);
                    // 2 px Fuge zum Teil darunter.
                    const fuge = darunter ? 2 : 0;
                    return (
                      <path
                        key={reihe.schluessel ?? reihe.name}
                        d={saeulenpfad(
                          mitte - saeulenbreite / 2,
                          obenY,
                          saeulenbreite,
                          Math.max(0, unten - obenY - fuge),
                          letzte,
                        )}
                        fill={reihe.farbe}
                      />
                    );
                  }
                  const x =
                    mitte -
                    (saeulenbreite * saeulen.length + 2 * (saeulen.length - 1)) / 2 +
                    r * (saeulenbreite + 2);
                  return (
                    <path
                      key={reihe.schluessel ?? reihe.name}
                      d={saeulenpfad(x, y(wert), saeulenbreite, y(0) - y(wert), true)}
                      fill={reihe.farbe}
                    />
                  );
                })}
                {punkte.map((reihe) => (
                  <circle
                    key={reihe.schluessel ?? reihe.name}
                    cx={mitte}
                    cy={y(reihe.werte[i] ?? 0)}
                    r={4.5}
                    fill={reihe.farbe}
                    stroke="var(--color-surface)"
                    strokeWidth={2}
                  />
                ))}
                {/* Unter 34 px je Monat nur jede zweite Beschriftung, vom
                    letzten Monat rückwärts - sonst laufen sie ineinander. */}
                {band >= 34 || (n - 1 - i) % 2 === 0 ? (
                  <text
                    x={mitte}
                    y={hoehe - 8}
                    textAnchor="middle"
                    className="fill-ink-muted text-xs"
                  >
                    {eng ? (kategorie.kurz ?? kategorie.label) : kategorie.label}
                  </text>
                ) : null}
                {/* Trefferfläche größer als die Säule: das ganze Band. */}
                <rect
                  x={links + band * i}
                  y={kopf}
                  width={band}
                  height={flaeche}
                  fill="transparent"
                  tabIndex={0}
                  aria-describedby={aktiv === i ? tooltipId : undefined}
                  aria-label={`${kategorie.label}: ${reihen
                    .map((r) => `${r.name} ${format(r.werte[i] ?? 0)}`)
                    .join(', ')}`}
                  onMouseEnter={() => setAktiv(i)}
                  onFocus={() => setAktiv(i)}
                  onBlur={() => setAktiv(null)}
                  className="outline-none focus-visible:stroke-[var(--color-accent)] focus-visible:stroke-2"
                />
              </g>
            );
          })}
        </svg>

        {aktiv !== null && kategorien[aktiv] ? (
          <div
            id={tooltipId}
            role="tooltip"
            className="border-line bg-surface rounded-field pointer-events-none absolute top-0 z-10 border px-3 py-2 text-sm"
            style={{
              left: Math.min(
                Math.max(0, links + band * aktiv + band / 2 - 90),
                Math.max(0, breite - 180),
              ),
            }}
          >
            <p className="text-ink font-semibold">{kategorien[aktiv].label}</p>
            {reihen.map((reihe) => (
              <p
                key={reihe.schluessel ?? reihe.name}
                className="text-ink-muted flex items-center gap-2 tabular-nums"
              >
                <Farbfeld farbe={reihe.farbe} rund={reihe.art === 'punkt'} />
                {reihe.name}: <span className="text-ink">{format(reihe.werte[aktiv] ?? 0)}</span>
              </p>
            ))}
          </div>
        ) : null}
      </div>

      {reihen.length > 1 ? <Legende reihen={reihen} /> : null}
      <Tabelle titel={titel} kategorien={kategorien} reihen={reihen} format={format} />
    </figure>
  );
}

function Farbfeld({ farbe, rund = false }: { farbe: string; rund?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block h-2.5 w-2.5 shrink-0${rund ? 'rounded-pill' : ''}`}
      style={{ background: farbe }}
    />
  );
}

export function Legende({
  reihen,
}: {
  reihen: Array<Pick<Reihe, 'schluessel' | 'name' | 'farbe' | 'art'>>;
}) {
  return (
    <ul className="text-ink-muted mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
      {reihen.map((reihe) => (
        <li key={reihe.schluessel ?? reihe.name} className="flex items-center gap-1.5">
          <Farbfeld farbe={reihe.farbe} rund={reihe.art === 'punkt'} />
          {reihe.name}
        </li>
      ))}
    </ul>
  );
}

function Tabelle({
  titel,
  kategorien,
  reihen,
  format,
}: {
  titel: string;
  kategorien: Kategorie[];
  reihen: Reihe[];
  format: (wert: number) => string;
}) {
  return (
    <details className="group mt-1">
      <summary className={`${aufklappKopfKlassen} text-accent text-sm`}>Als Tabelle</summary>
      <div className="overflow-x-auto">
        <table className="text-ink w-full text-sm tabular-nums">
          <caption className="sr-only">{titel}</caption>
          <thead>
            <tr className="text-ink-muted text-left">
              <th scope="col" className="py-1 pr-3 font-medium">
                Zeitraum
              </th>
              {reihen.map((reihe) => (
                <th
                  key={reihe.schluessel ?? reihe.name}
                  scope="col"
                  className="py-1 pr-3 text-right font-medium"
                >
                  {reihe.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {kategorien.map((kategorie, i) => (
              <tr key={kategorie.label} className="border-line border-t">
                <th scope="row" className="py-1 pr-3 text-left font-normal">
                  {kategorie.label}
                </th>
                {reihen.map((reihe) => (
                  <td key={reihe.schluessel ?? reihe.name} className="py-1 pr-3 text-right">
                    {format(reihe.werte[i] ?? 0)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/**
 * Waagerechte Balken für eine Rangfolge oder einen Vergleich weniger Werte.
 * Beschriftung und Wert stehen als Text, der Balken zeigt nur die Größe.
 */
export function Balkenliste({
  titel,
  zeilen,
  format,
  farbe = REIHEN[0],
}: {
  titel: string;
  zeilen: Array<{ label: ReactNode; schluessel: string; wert: number; farbe?: string }>;
  format: (wert: number) => string;
  farbe?: string;
}) {
  const hoechster = Math.max(1, ...zeilen.map((z) => Math.abs(z.wert)));
  return (
    <ul aria-label={titel} className="flex flex-col gap-2">
      {zeilen.map((zeile) => (
        <li key={zeile.schluessel} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 text-sm">
          <span className="text-ink truncate">{zeile.label}</span>
          <span className="text-ink tabular-nums">{format(zeile.wert)}</span>
          <span
            aria-hidden="true"
            className="bg-surface-sunken rounded-pill col-span-2 mt-1 block h-2"
          >
            <span
              className="rounded-pill block h-2"
              style={{
                width: `${(Math.max(0, zeile.wert) / hoechster) * 100}%`,
                background: zeile.farbe ?? farbe,
              }}
            />
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Ein Anteil mit Zielmarke, etwa die Auslastung. */
export function Messbalken({
  titel,
  prozent,
  ziel,
}: {
  titel: string;
  prozent: number | null;
  ziel: number | null;
}) {
  return (
    <div
      role="meter"
      aria-label={titel}
      aria-valuemin={0}
      aria-valuemax={Math.max(100, prozent ?? 0)}
      aria-valuenow={prozent ?? undefined}
      aria-valuetext={
        prozent === null
          ? 'keine Arbeitszeit hinterlegt'
          : `${prozent} Prozent${ziel !== null ? `, Ziel ${ziel} Prozent` : ''}`
      }
      className="bg-surface-sunken rounded-pill relative h-3"
    >
      <span
        className="rounded-pill block h-3"
        style={{ width: `${Math.min(100, prozent ?? 0)}%`, background: REIHEN[0] }}
      />
      {ziel !== null ? (
        <span
          aria-hidden="true"
          className="bg-ink rounded-pill absolute -top-1 h-5 w-0.5"
          style={{ left: `calc(${Math.min(100, ziel)}% - 1px)` }}
        />
      ) : null}
    </div>
  );
}
