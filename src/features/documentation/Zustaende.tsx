import { ButtonLink } from '@/components/ui/ButtonLink';
import { EmptyState } from '@/components/ui/Feedback';
import { mitRueckweg } from '@/lib/rueckweg';
import type { TreatmentNote } from './api';

/**
 * Erwartbare Zustände der Dokumentationsseiten (DOK-12).
 *
 * „Bereits finalisiert" oder „Noch ein Entwurf" sind keine Fehler: Wer über
 * eine ältere Tagesliste oder einen Link aus der Akte kommt, trifft genau
 * darauf. Bis UXR-008 standen sie als roter Alarm (`ErrorState`,
 * `role="alert"`) da, nannten Korrektur und Nachtrag im Satz, verlinkten sie
 * aber nicht - der einzige Weg war zurück. Jetzt steht der Zustand ruhig da,
 * mit dem nächsten Schritt als Knopf.
 *
 * Die Wege tragen den mitgereisten Rückweg weiter (DOK-01). Wer hier landet,
 * darf schreiben - sonst zeigte der Rahmen „Nicht freigegeben"; verbindlich
 * prüft ohnehin der Server.
 */

function eintragsweg(appointmentId: string, eintrag: TreatmentNote): string {
  return `/termine/${appointmentId}/dokumentation/${eintrag.id}`;
}

/**
 * Der Eintrag ist Bestandteil der Akte. Ergänzen ist der Regelfall (ADR-016
 * Punkt 6) und steht deshalb vorn, die Korrektur leise daneben (DOK-14).
 */
export function BereitsFinalisiert({
  appointmentId,
  eintrag,
  eingehend,
}: {
  appointmentId: string;
  eintrag: TreatmentNote;
  eingehend: string;
}) {
  const weg = eintragsweg(appointmentId, eintrag);
  const istNachtrag = eintrag.addendum_to_note_id !== null;

  return (
    <EmptyState
      title="Bereits finalisiert"
      description={
        istNachtrag
          ? 'Dieser Nachtrag ist Bestandteil der Akte. Eine Änderung ist nur als Korrektur mit Begründung möglich.'
          : 'Dieser Eintrag ist Bestandteil der Akte. Eine Ergänzung ist als Nachtrag möglich, eine Änderung nur als Korrektur mit Begründung.'
      }
      aktion={
        <>
          {/* Zu einem Nachtrag gibt es keinen weiteren (ADR-016 Punkt 6). */}
          {istNachtrag ? null : (
            <ButtonLink to={mitRueckweg(`${weg}/nachtrag`, eingehend)} variant="secondary">
              Nachtrag hinzufügen
            </ButtonLink>
          )}
          <ButtonLink to={mitRueckweg(`${weg}/korrektur`, eingehend)} variant="quiet">
            Korrigieren
          </ButtonLink>
        </>
      }
    />
  );
}

/** Der Eintrag ist noch ein Entwurf: Er wird schlicht bearbeitet. */
export function NochEinEntwurf({
  appointmentId,
  eintrag,
  eingehend,
  beschreibung,
}: {
  appointmentId: string;
  eintrag: TreatmentNote;
  eingehend: string;
  beschreibung: string;
}) {
  // Der Haupteintrag hat seine eigene Adresse, ein Nachtrag die mit Kennung
  // (DOK-002) - dieselben Wege wie am Termin.
  const ziel =
    eintrag.addendum_to_note_id === null
      ? `/termine/${appointmentId}/dokumentation`
      : `${eintragsweg(appointmentId, eintrag)}/bearbeiten`;

  return (
    <EmptyState
      title="Noch ein Entwurf"
      description={beschreibung}
      aktion={
        <ButtonLink to={mitRueckweg(ziel, eingehend)} variant="secondary">
          Entwurf bearbeiten
        </ButtonLink>
      }
    />
  );
}
