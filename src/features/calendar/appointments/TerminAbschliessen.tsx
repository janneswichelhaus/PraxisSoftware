import { useMutation, useQueryClient } from '@tanstack/react-query';
import { HakenSymbol } from '@/components/ui/HakenSymbol';
import { Button } from '@/components/ui/Button';
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
  beschriftung,
  variant = 'secondary',
  groesse = 'normal',
  onAbgeschlossen,
  onFehler,
  text,
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
  /**
   * Der zugängliche Name, wo der Zusammenhang die Person schon nennt - die
   * Tageskarte: „Behandlung abschließen" (Jannes 2026-10-03).
   */
  beschriftung?: string;
  variant?: Variant;
  groesse?: SymbolGroesse;
  onAbgeschlossen?: () => void;
  onFehler?: (meldung: string) => void;
  /**
   * Als Knopf mit Haken und Wort statt als Symbol (BEF-055): im Terminfenster,
   * wo der Abschluss ohne Dokumentation „Nur Termin abschließen“ heißt bzw.
   * für Rollen ohne Doku-Recht „Termin abschließen“.
   */
  text?: string;
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

  if (text) {
    return (
      <Button
        type="button"
        variant={variant === 'primary' ? 'primary' : 'secondary'}
        groesse="kompakt"
        disabled={mutation.isPending}
        aria-busy={mutation.isPending || undefined}
        className={className}
        onClick={() => {
          if (mutation.isPending) return;
          mutation.mutate();
        }}
      >
        <HakenSymbol />
        {mutation.isPending ? 'Wird abgeschlossen …' : text}
      </Button>
    );
  }

  return (
    <Symbolknopf
      beschriftung={beschriftung ?? (name ? `Termin abschließen: ${name}` : 'Termin abschließen')}
      title={beschriftung ?? 'Termin abschließen'}
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
