import { Link } from 'react-router-dom';

const STRICH = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: false,
} as const;

/** „+“ als Zeichen, 22 ohne Angabe; das Wort daneben oder der Name des Knopfs trägt die Bedeutung. */
export function Pluszeichen({ className = 'size-5.5' }: { className?: string }) {
  return (
    <svg {...STRICH} strokeWidth={2.5} className={`shrink-0 ${className}`}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function Minuszeichen({ className = 'size-5.5' }: { className?: string }) {
  return (
    <svg {...STRICH} strokeWidth={2.5} className={`shrink-0 ${className}`}>
      <path d="M5 12h14" />
    </svg>
  );
}

export function Pfeilzeichen({
  richtung,
  className = 'size-5.5',
}: {
  richtung: 'links' | 'rechts';
  className?: string;
}) {
  return (
    <svg {...STRICH} strokeWidth={2} className={`shrink-0 ${className}`}>
      <path d={richtung === 'links' ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6'} />
    </svg>
  );
}

/** Druck wie an jeder Zeile der Plattform: vertiefte Fläche und 98 %, bei „Bewegung reduzieren“ nur die Fläche. */
const DRUCK =
  'hover:bg-surface-sunken active:bg-surface-sunken motion-safe:active:scale-98 transition-[background-color,scale] duration-120 ease-druck';
const FOKUS = 'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ink';

/**
 * Ohne Netz gesperrt, aber mit dem Fokus erreichbar, damit der Satz dazu vorgelesen wird: das Bild
 * eines abgeschalteten Knopfs, gestrichelt (ANN-802). Dazu `aria-disabled` und ein Riegel im Handler.
 */
export const GESPERRT =
  'aria-disabled:cursor-not-allowed aria-disabled:border-dashed aria-disabled:border-line-strong aria-disabled:bg-transparent aria-disabled:text-ink-muted aria-disabled:hover:bg-transparent [.plattform-schrift_&]:aria-disabled:active:bg-transparent motion-safe:[.plattform-schrift_&]:aria-disabled:active:scale-100';

/** Um ein Kästchen (`Checkbox`) ohne Netz: leise wie gesperrt; einen gestrichelten Rand nimmt es nicht an. */
export const KAESTCHEN_GESPERRT =
  '[&_input]:accent-ink-muted [&_input]:cursor-not-allowed [&_label]:cursor-not-allowed [&_label>span]:text-ink-muted';

/**
 * Der Weg zum Eintragen an einer Mahlzeit des Tagebuchs (Handoff 2026-10-29, Abschnitt 3): rund mit
 * „+“ an einer Mahlzeit mit Einträgen, als Pille mit dem Namen an einer leeren. Gesperrt (ohne Netz)
 * ein gestrichelter Knopf, mit dem Fokus erreichbar, der über `beschreibung` sagt, warum.
 */
export function Mahlzeitziel({
  form,
  name,
  to,
  gesperrt = false,
  beschreibung,
}: {
  form: 'rund' | 'pille';
  /** Die Mahlzeit, etwa „Mittagessen“; vorgelesen „Mittagessen eintragen“. */
  name: string;
  to: string;
  gesperrt?: boolean;
  /** Die Kennung des Satzes, der sagt, warum gesperrt ist. */
  beschreibung?: string;
}) {
  const grund =
    form === 'rund'
      ? 'rounded-pill border-line-strong inline-flex size-12 shrink-0 items-center justify-center border'
      : 'rounded-pill border-line-strong inline-flex min-h-12 items-center gap-1.5 border px-4 font-semibold wrap-break-word hyphens-manual max-[23rem]:px-3';
  const inhalt =
    form === 'rund' ? (
      <Pluszeichen />
    ) : (
      <>
        <Pluszeichen className={`size-4.5 ${gesperrt ? '' : 'text-accent'}`} />
        {name}
      </>
    );
  if (gesperrt) {
    return (
      <button
        type="button"
        aria-disabled="true"
        aria-label={`${name} eintragen`}
        aria-describedby={beschreibung}
        className={`${grund} text-ink-muted cursor-not-allowed border-dashed ${FOKUS}`}
      >
        {inhalt}
      </button>
    );
  }
  return (
    <Link
      to={to}
      aria-label={`${name} eintragen`}
      className={`${grund} ${form === 'rund' ? 'text-accent' : 'text-ink'} ${DRUCK} ${FOKUS}`}
    >
      {inhalt}
    </Link>
  );
}

/**
 * Ein Eintrag des Tagebuchs als Zeile, mindestens 44 hoch: Name und Menge links, die Energie rechts
 * in Leise. Mit `onOeffnen` ein Knopf, sonst zum Lesen; unter 23rem untereinander. Ein Lebensmittel
 * bricht nur zwischen Wörtern.
 */
export function Eintragszeile({
  name,
  menge,
  energie,
  onOeffnen,
}: {
  name: string;
  menge: string;
  /** Etwa „185 kcal“; ohne Angabe keine Zahl (Zahlen ausgeblendet). */
  energie?: string | undefined;
  onOeffnen?: (() => void) | undefined;
}) {
  const zeile =
    'flex min-h-11 w-full items-center justify-between gap-3 py-1.5 text-left hyphens-manual max-[23rem]:flex-col max-[23rem]:items-start max-[23rem]:justify-center max-[23rem]:gap-0';
  const inhalt = (
    <>
      <span className="min-w-0 wrap-break-word">
        {name} <span className="text-ink-muted">· {menge}</span>
      </span>{' '}
      {energie === undefined ? null : (
        <span className="text-ink-muted shrink-0 whitespace-nowrap tabular-nums">{energie}</span>
      )}
    </>
  );
  return onOeffnen ? (
    <button type="button" onClick={onOeffnen} className={`${zeile} ${DRUCK} ${FOKUS}`}>
      {inhalt}
    </button>
  ) : (
    <div className={zeile}>{inhalt}</div>
  );
}
