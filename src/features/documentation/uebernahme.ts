import type { RefObject } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { mitRueckweg } from '@/lib/rueckweg';
import type { Textverlustschutz } from './Textverlustschutz';
import {
  createTreatmentNoteAddendum,
  finalizeTreatmentNote,
  findeEintrag,
  inhaltFehler,
  type TreatmentDocumentation,
  type TreatmentNote,
} from './api';

/**
 * Übernahme getippten Texts im Konfliktfall und das Festschreiben eines
 * Nachtrags auf seiner eigenen Seite (BEF-056, UX-EPIC-007; ANN-320).
 *
 * **Übergabe nur im Arbeitsspeicher.** Wer im Konfliktfall „In Korrektur
 * übernehmen“ wählt, wechselt die Seite; der Text muss mit. Der
 * Navigationszustand des Browsers (`history.state`) wäre der bequeme Weg,
 * aber Browser schreiben ihn für die Sitzungswiederherstellung auf das
 * Gerät - ein lokaler Zwischenspeicher für Gesundheitsdaten, den ADR-015 und
 * ANN-015 ausschließen. Die Übergabe liegt deshalb in einer Tabelle dieses
 * Moduls: Sie überlebt kein Neuladen, und die Korrekturseite holt sie beim
 * ersten Zeichnen ab.
 */
const uebergaben = new Map<string, string>();

/** Legt den Text für die Korrektur des Eintrags `noteId` bereit. */
export function textUebergeben(noteId: string, text: string): void {
  uebergaben.set(noteId, text);
}

/**
 * Liest den bereitgelegten Text, ohne ihn zu entfernen.
 *
 * Entfernt wird er mit `uebergabeErledigt` nach dem Einhängen der Seite: Im
 * Strict Mode zeichnet React einen Anfangszustand zweimal, und ein Lesen,
 * das zugleich löscht, gäbe beim zweiten Mal nichts mehr zurück.
 */
export function uebergebenerText(noteId: string): string | undefined {
  return uebergaben.get(noteId);
}

export function uebergabeErledigt(noteId: string): void {
  uebergaben.delete(noteId);
}

/** Beim Sitzungsende: nichts bleibt im Arbeitsspeicher liegen. */
export function uebergabenLeeren(): void {
  uebergaben.clear();
}

/**
 * Schreibt einen Nachtrag fest, nachdem sein Text gesichert ist (BEF-056).
 *
 * Der Stand, auf dem die Finalisierung beruht, kommt aus dem gerade
 * nachgeladenen Zwischenspeicher der Abfrage: Das Sichern davor hat
 * `updated_at` verändert, und der Server weist eine Finalisierung auf
 * veraltetem Stand ab. Derselbe Serverweg wie „Finalisieren“ am Termin
 * (`finalize_treatment_note`, ADR-016 Punkt 4) - nur an der Stelle, an der
 * der Nachtrag geschrieben wird.
 */
export async function nachtragFestschreiben(
  queryClient: QueryClient,
  appointmentId: string,
  noteId: string,
): Promise<void> {
  const dokumentation = queryClient.getQueryData<TreatmentDocumentation>([
    'treatment-note',
    appointmentId,
  ]);
  const eintrag = dokumentation ? findeEintrag(dokumentation, noteId) : null;
  if (!eintrag) throw new Error('Der Nachtrag wurde nicht gefunden.');
  if (eintrag.status === 'final') {
    throw new Error('Dieser Nachtrag ist bereits finalisiert.');
  }
  await finalizeTreatmentNote(eintrag.id, eintrag.updated_at);
  await queryClient.invalidateQueries({ queryKey: ['treatment-note', appointmentId] });
  await queryClient.invalidateQueries({ queryKey: ['appointment', appointmentId] });
}

/**
 * Die beiden Wege aus dem Konfliktfall (BEF-056, ADR-016 Punkt 6).
 *
 * „Als Nachtrag übernehmen“ legt einen Nachtrag-Entwurf mit dem Feldinhalt
 * an und öffnet ihn - dort wird er weiter bearbeitet und festgeschrieben.
 * „In Korrektur übernehmen“ öffnet die Korrektur mit dem Feldinhalt; die
 * Begründung schreibt die Person dort. Beides läuft durch den einen
 * Schreibweg der Seite (FIX-014).
 */
export function useTextUebernahme({
  appointmentId,
  note,
  eingehend,
  wertRef,
  setFehler,
  schutz,
}: {
  appointmentId: string;
  note: TreatmentNote | null;
  eingehend: string;
  /** Der Text, wie er in diesem Augenblick im Feld steht. */
  wertRef: RefObject<string>;
  setFehler: (meldung: string | undefined) => void;
  schutz: Pick<Textverlustschutz, 'schreiben' | 'freigeben'>;
}): { alsNachtrag: () => void; inKorrektur: () => void } {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  function alsNachtrag() {
    if (!note) return;
    const meldung = inhaltFehler(wertRef.current);
    setFehler(meldung);
    if (meldung) return;
    let neu = '';
    void schutz.schreiben({
      ausfuehren: async () => {
        neu = await createTreatmentNoteAddendum(note.id, wertRef.current);
        await queryClient.invalidateQueries({ queryKey: ['treatment-note', appointmentId] });
        return true;
      },
      fehlertitel: 'Nicht übernommen',
      danach: () => {
        schutz.freigeben();
        void navigate(
          mitRueckweg(`/termine/${appointmentId}/dokumentation/${neu}/bearbeiten`, eingehend),
          { state: { meldung: 'Ihr Text ist als Nachtrag-Entwurf gesichert.' } },
        );
      },
    });
  }

  function inKorrektur() {
    if (!note) return;
    textUebergeben(note.id, wertRef.current);
    schutz.freigeben();
    void navigate(
      mitRueckweg(`/termine/${appointmentId}/dokumentation/${note.id}/korrektur`, eingehend),
    );
  }

  return { alsNachtrag, inKorrektur };
}
