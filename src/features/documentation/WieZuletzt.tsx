import { useState } from 'react';
import { Chip } from '@/components/ui/Chip';
import { fetchKurzblick } from '@/features/appointments/kurzblick-api';

/**
 * „Wie zuletzt“ (K6, ANN-502): den letzten Eintrag als Ausgangspunkt
 * übernehmen - Jane und Cliniko tun dasselbe mit „Copy previous note“.
 *
 * Gelesen wird erst auf den Tipp, über denselben Lesepfad wie der Kurzblick
 * (`get_appointment_brief`): Er liefert den letzten Haupteintrag eines
 * früheren Behandlungstermins derselben Person und protokolliert das Lesen
 * als „Akte geöffnet“, einmal je Akte und Tag (ANN-230). Kein neuer
 * Lesepfad, keine neue Protokollierung.
 *
 * Der Text landet wie ein Textbaustein im Feld (`einfuegen`, mit
 * „Rückgängig“) und ist danach gewöhnlicher, ungespeicherter Text: Er wird
 * gelesen und angepasst, bevor er festgeschrieben wird (ADR-016 Punkt 4).
 * Ein Vermerk „ohne Behandlung“ ist kein Behandlungstext und wird nicht
 * übernommen.
 */
export function WieZuletzt({
  appointmentId,
  gesperrt,
  onUebernehmen,
  onHinweis,
}: {
  appointmentId: string;
  /** Während eines Schreibvorgangs fügt nichts ein (FIX-014). */
  gesperrt: boolean;
  onUebernehmen: (titel: string, text: string) => void;
  /**
   * Warum nichts übernommen wurde - die Seite zeigt es als Zeile unter der
   * Chipreihe, die waagerecht läuft und keinen Satz umbrechen kann.
   */
  onHinweis: (hinweis: string | null) => void;
}) {
  const [laedt, setLaedt] = useState(false);
  const setHinweis = onHinweis;

  async function uebernehmen() {
    setLaedt(true);
    setHinweis(null);
    try {
      const blick = await fetchKurzblick(appointmentId);
      const text = blick?.last_note_content?.trim();
      // Null Zeilen heißt: Der Server gibt den Blick nicht heraus - das ist
      // etwas anderes als „noch kein Eintrag“.
      if (!blick) {
        setHinweis('Der letzte Eintrag ist hier nicht zu sehen.');
        return;
      }
      if (!text || !blick.last_note_appointment_start) {
        setHinweis('Noch kein Eintrag vor diesem Termin.');
        return;
      }
      if (blick.last_note_visit_without_treatment) {
        setHinweis('Der letzte Eintrag ist ein Vermerk ohne Behandlung.');
        return;
      }
      const tag = new Intl.DateTimeFormat('de-DE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        timeZone: blick.organization_time_zone,
      }).format(new Date(blick.last_note_appointment_start));
      onUebernehmen(
        `Eintrag vom ${tag}${blick.last_note_status === 'draft' ? ' (Entwurf)' : ''}`,
        text,
      );
    } catch {
      setHinweis('Der letzte Eintrag konnte nicht geladen werden.');
    } finally {
      setLaedt(false);
    }
  }

  return (
    <Chip onClick={() => void uebernehmen()} disabled={gesperrt || laedt}>
      {laedt ? 'Wird geladen …' : 'Wie zuletzt'}
    </Chip>
  );
}
