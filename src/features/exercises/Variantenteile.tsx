import { Disclosure } from '@/components/ui/Card';
import { Schrittliste } from '@/components/ui/Schrittliste';
import { Section } from '@/components/ui/Section';
import { Tile, TileGrid } from '@/components/ui/Tile';
import { zeilen } from '@/components/ui/zeilen';
import { Zwischentitel } from '@/components/ui/Zwischentitel';
import { FREITEXT } from '@/features/documentation/format';
import { BEGRIFFE } from '@/lib/begriffe';
import type { Standarddosierung, Variante } from './api';

/**
 * Die Teile einer Variante, wie Übungsseite und Durchsicht sie zeigen
 * (UEB-001, UEB-012; Durchsicht UEB-015): Standarddosierung als Kacheln,
 * Anleitung in Schritten mit Fehlern, Hinweisen und Ausrüstung, die
 * Alltagsansicht. Eine Zeichnung gibt es nicht (ANN-539).
 */

function dauer(sekunden: number): string {
  return sekunden >= 120 && sekunden % 60 === 0 ? `${sekunden / 60} min` : `${sekunden} s`;
}

/**
 * Die Standarddosierung als Kacheln (ANN-384): Sätze, Wiederholungen oder
 * Dauer - je Seite und Halten als Nebenzeile -, wie oft am Tag. Drei passen
 * am Rechner in eine Reihe.
 */
export function Dosierkacheln({ d }: { d: Standarddosierung }) {
  const wdh =
    d.reps_min === null || d.reps_max === null
      ? null
      : d.reps_min === d.reps_max
        ? `${d.reps_min}`
        : `${d.reps_min}–${d.reps_max}`;
  const zusatz = [
    d.per_side ? 'je Seite' : null,
    wdh && d.hold_seconds ? `${d.hold_seconds} s halten` : null,
  ]
    .filter(Boolean)
    .join(', ');
  return (
    <TileGrid spalte="kachel">
      <Tile label="Sätze">{d.sets}</Tile>
      <Tile label={wdh ? 'Wiederholungen' : 'Dauer'} {...(zusatz ? { zusatz } : {})}>
        {wdh ?? dauer(d.duration_seconds ?? 0)}
      </Tile>
      {d.times_per_day ? <Tile label="Am Tag">{d.times_per_day}-mal</Tile> : null}
    </TileGrid>
  );
}

/** Anleitung, Fehler, Hinweise und Ausrüstung in einer Karte (L2). */
export function Anleitung({ variante }: { variante: Variante }) {
  const fehler = zeilen(variante.common_faults);
  return (
    <Section titel="Anleitung" rahmen>
      <div className="text-liste">
        <Schrittliste text={variante.instruction} leer="Noch keine Anleitung." />
      </div>
      {fehler.length > 0 ? (
        <>
          <Zwischentitel>Typische Fehler</Zwischentitel>
          <ul className="text-liste text-ink flex list-disc flex-col gap-1 pl-5">
            {fehler.map((zeile, index) => (
              <li key={index}>{zeile}</li>
            ))}
          </ul>
        </>
      ) : null}
      {variante.practice_notes ? (
        <>
          <Zwischentitel>Hinweise für die Praxis</Zwischentitel>
          <p className={`text-liste text-ink max-w-prose ${FREITEXT}`}>{variante.practice_notes}</p>
        </>
      ) : null}
      <Zwischentitel>Ausrüstung</Zwischentitel>
      <p className="text-liste text-ink">
        {variante.equipment.length > 0 ? variante.equipment.join(', ') : 'Keine'}
      </p>
    </Section>
  );
}

/**
 * UEB-003 (IDEA-QSN-002): nur die zweite Sprachebene, so wie sie
 * Patient:innen und Kund:innen später lesen - ohne die fachlichen Angaben
 * der Praxis. Eine Vorschau, kein Versand.
 */
export function Alltagsansicht({
  uebungLaie,
  variante,
}: {
  uebungLaie: string;
  variante: Variante;
}) {
  return (
    <Disclosure summary={`Ansicht in ${BEGRIFFE.alltagssprache}`}>
      <div className="bg-surface-sunken rounded-card max-w-prose p-4">
        <p className="text-ink-muted text-sm">{uebungLaie}</p>
        <p className="text-ink text-liste font-semibold">{variante.lay_name}</p>
        {/* Die Schritte wie auf der Plattform (ANN-539). */}
        <div className="text-ink text-liste mt-2">
          <Schrittliste text={variante.instruction} leer="Noch keine Kurzanleitung." />
        </div>
        {variante.equipment.length > 0 ? (
          <p className="text-ink-muted mt-2 text-sm">Ausrüstung: {variante.equipment.join(', ')}</p>
        ) : null}
      </div>
    </Disclosure>
  );
}
