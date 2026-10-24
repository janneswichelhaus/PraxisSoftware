import { useId, type Ref } from 'react';
import { Laufrad } from './Laufrad';

/**
 * Die Bühne einer Übung auf der Plattform (Handoff 2026-10-24, Abschnitt 3):
 * der Name groß auf Tiefgrün, darunter die Hauptzahl - wie oft oder wie lange
 * je Durchgang -, aus Armlänge lesbar, die Einheit in einer eigenen Zeile. In
 * der Durchführung ist der Name der Seitentitel (`h1`), im Fenster „Übung zum
 * Nachlesen“ ein `h2`. Zahl und Einheit liefert die Seite
 * (`hauptzahl` in `features/platform`); Durchgänge, Pause und Last stehen als
 * `Dosierungsmarken` darunter.
 *
 * Kein Schatten: Die Bühne ist keine Karte zum Antippen (ANN-678). Das Laufrad
 * ist Markenform ohne Bedeutung; unter 23rem (200 %) fällt es weg, damit der
 * Name die ganze Breite hat. Lange Namen trennen nur dort an der Silbe
 * (`trennen-schmal`, ANN-707). Die Rechnermaße gelten unter `data-rechner`
 * wie bei der Hero-Karte.
 *
 * Ohne Medium. Ein Video der Praxis nimmt später denselben Platz ein - erst
 * mit eigenen Medien (ANN-539).
 */
export function Buehne({
  name,
  zahl,
  einheit,
  ebene = 1,
  titelRef,
}: {
  /** Der Name der Übung, wie die Person ihn liest. */
  name: string;
  /** „8 bis 12“, „10“, „30“. */
  zahl: string;
  /** „Wiederholungen je Durchgang“, „Sekunden je Seite“. */
  einheit: string;
  /** `h1` in der Durchführung, `h2` im Fenster. */
  ebene?: 1 | 2;
  /** Beim Wechsel der Übung geht der Fokus auf den Namen (Abschnitt 5.3). */
  titelRef?: Ref<HTMLHeadingElement>;
}) {
  const titelId = useId();
  const Titel = ebene === 1 ? 'h1' : 'h2';
  return (
    <section
      aria-labelledby={titelId}
      className="bg-surface-inverse text-surface rounded-image relative flex flex-col gap-4 overflow-hidden p-6 max-[23rem]:p-4 [[data-rechner]_&]:p-8"
    >
      <Laufrad className="text-accent pointer-events-none absolute -right-17.5 -bottom-17.5 size-50 max-[23rem]:hidden [[data-rechner]_&]:-right-22.5 [[data-rechner]_&]:-bottom-22.5 [[data-rechner]_&]:size-75" />
      <Titel
        id={titelId}
        ref={titelRef}
        tabIndex={titelRef ? -1 : undefined}
        className="text-hero [[data-rechner]_&]:text-hero-rechner max-[23rem]:text-hero-schmal trennen-schmal relative text-balance focus:outline-none"
      >
        {name}
      </Titel>
      <p className="relative flex flex-col gap-1">
        <span className="text-hauptzahl [[data-rechner]_&]:text-hauptzahl-rechner max-[23rem]:text-hauptzahl-schmal tabular-nums">
          {zahl}
        </span>
        <span className="font-semibold">{einheit}</span>
      </p>
    </section>
  );
}
