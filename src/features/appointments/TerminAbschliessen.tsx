import { useMutation, useQueryClient } from '@tanstack/react-query';
import { HakenSymbol } from '@/components/ui/HakenSymbol';
import { Symbolknopf } from '@/components/ui/Symbolknopf';
import type { SymbolGroesse, Variant } from '@/components/ui/buttonStile';
import { completeAppointment, fetchAppointment } from './api';

/**
 * Der Haken: den Termin abschließen, ohne zu dokumentieren.
 *
 * Abschließen und Dokumentieren sind getrennt (Design-Handoff 2026-10-01,
 * Abschnitt 6a, Entscheidung Jannes): Der Haken stellt fest, dass die
 * Behandlung stattgefunden hat; die Doku folgt über „Doku". Das ist der
 * bestehende Weg `complete_appointment` - ohne Prüfung auf eine
 * Dokumentation (ANN-005, ADR-018). Der Termin steht danach auf
 * „abgeschlossen", bis das Festschreiben ihn auf „dokumentiert" setzt; bis
 * dahin zeigen Übersicht und Kalender „Doku offen".
 *
 * Die Übersicht und der Kalender kennen den Bearbeitungsstand des Termins
 * nicht (`updated_at` steht nicht in ihren Listen). Der Knopf liest ihn daher
 * unmittelbar vor dem Abschluss. Der Server weist trotzdem alles ab, was
 * nicht mehr „bestätigt" ist - ein doppelter Abschluss ist ausgeschlossen.
 *
 * Nur Darstellung: Wer abschließen darf, prüft `app.can_complete_appointment`.
 */
export function TerminAbschliessenKnopf({
  appointmentId,
  stand,
  name,
  variant = 'secondary',
  groesse = 'normal',
  onAbgeschlossen,
  onFehler,
  className = '',
}: {
  appointmentId: string;
  /**
   * Der Bearbeitungsstand (`updated_at`), wenn die Seite ihn kennt - die
   * Terminseite. Ohne Angabe liest der Knopf ihn unmittelbar vorher.
   */
  stand?: string;
  /** Name der Patient:in - unterscheidet die Haken einer Liste für Vorlesesoftware. */
  name?: string | null;
  variant?: Variant;
  groesse?: SymbolGroesse;
  onAbgeschlossen?: () => void;
  onFehler?: (meldung: string) => void;
  className?: string;
}) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async () => {
      if (stand) {
        await completeAppointment(appointmentId, stand);
        return;
      }
      const termin = await fetchAppointment(appointmentId);
      if (!termin) throw new Error('Der Termin wurde nicht gefunden.');
      await completeAppointment(termin.id, termin.updated_at);
    },
    onSuccess: () => {
      for (const queryKey of [['appointment', appointmentId], ['appointments'], ['day-plan']]) {
        void queryClient.invalidateQueries({ queryKey });
      }
      onAbgeschlossen?.();
    },
    onError: (fehler) => {
      onFehler?.(
        fehler instanceof Error ? fehler.message : 'Der Termin konnte nicht abgeschlossen werden.',
      );
    },
  });

  return (
    <Symbolknopf
      beschriftung={name ? `Termin abschließen: ${name}` : 'Termin abschließen'}
      title="Termin abschließen"
      variant={variant}
      groesse={groesse}
      disabled={mutation.isPending}
      aria-busy={mutation.isPending || undefined}
      className={className}
      onClick={() => {
        if (mutation.isPending) return;
        mutation.mutate();
      }}
    >
      <HakenSymbol />
    </Symbolknopf>
  );
}
