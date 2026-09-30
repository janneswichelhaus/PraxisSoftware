import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Aufklappzeichen } from '@/components/ui/Card';
import { aufklappKopfKlassen } from '@/components/ui/aufklappStile';
import { Checkbox } from '@/components/ui/Checkbox';
import { Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Rueckmeldung } from './Rueckmeldungen';
import {
  notificationChannelLabels,
  notificationChannelOrder,
  setAppointmentNotification,
  type Appointment,
  type NotificationChannel,
} from './api';

/**
 * Vermerken, dass ein Termin der Patient:in mitgeteilt wurde (CAL-012).
 *
 * **Die Nachhut, nicht der Regelweg.** Terminzettel und E-Mail vermerken sich
 * seit UX-012 dort, wo sie entstehen - aber erst, wenn dort bestätigt ist,
 * dass der Zettel ausgehändigt beziehungsweise die Nachricht gesendet wurde
 * (ANN-039 und ANN-041, je Fassung 2). Hier steht, was die Anwendung nicht
 * sehen kann: das Gespräch am Tresen, der Anruf, die Nachricht aus einem
 * fremden Postfach — und die Rücknahme eines Vermerks, dessen Vorgang doch
 * nicht stattgefunden hat (ANN-040, ANN-041).
 *
 * **Automatisch versendet wird weiterhin nichts.** B15 bleibt dabei: keine
 * automatische Terminerinnerung über einen Dienstleister; SMS und Messenger
 * gibt es nicht.
 *
 * Eine Mehrfachauswahl und kein Knopf je Weg: Gespeichert wird der Stand, den
 * man sieht. Alles abwählen nimmt den Vermerk zurück — der Fall „der Drucker
 * ging nicht" und der Fall „den Entwurf habe ich dann doch verworfen".
 * Verbindlich prüft und setzt die Serverfunktion
 * `set_appointment_notification` (ADR-004).
 *
 * Der Vermerk verfällt von selbst, sobald sich der Termin ändert; deshalb gibt
 * es hier nichts zu löschen und keine Frist zu pflegen.
 */
export function MitteilungVermerken({ appointment }: { appointment: Appointment }) {
  const queryClient = useQueryClient();
  const [auswahl, setAuswahl] = useState<NotificationChannel[]>(
    () => appointment.notification_channels,
  );
  const [gespeichert, setGespeichert] = useState(false);

  const mutation = useMutation({
    mutationFn: (kanaele: NotificationChannel[]) =>
      setAppointmentNotification(appointment.id, kanaele),
    onSuccess: (kanaele) => {
      setAuswahl(kanaele);
      setGespeichert(true);
      // Die Bestätigung folgt dem Server, nicht dem Nachladen (ZST-B01).
      void queryClient.invalidateQueries({ queryKey: ['appointment', appointment.id] });
      void queryClient.invalidateQueries({ queryKey: ['patient-upcoming-appointments'] });
    },
  });

  function umschalten(kanal: NotificationChannel, an: boolean) {
    setGespeichert(false);
    if (mutation.isError) mutation.reset();
    setAuswahl((bisher) =>
      an ? [...bisher, kanal] : bisher.filter((vorhanden) => vorhanden !== kanal),
    );
  }

  // Reihenfolgeunabhängiger Vergleich: Der Server sortiert, die Auswahl nicht.
  const gleich =
    auswahl.length === appointment.notification_channels.length &&
    auswahl.every((kanal) => appointment.notification_channels.includes(kanal));

  return (
    // Eine Stufe unter dem Seitentitel: Die Mitteilung gehört nicht zu „Was
    // ist passiert?", sie steht daneben (TER-16).
    //
    // Zugeklappt (UX-005a): Ob und wie der Termin mitgeteilt ist, steht als
    // Zeichen im Kopf der Seite. Die Auswahl hier braucht, wer gerade
    // angerufen hat - vor der Tür braucht sie niemand, und vier Kästchen mit
    // zwei Sätzen kosteten dort einen halben Bildschirm.
    <Section titel="Mitteilung an die Patient:in">
      <details className="group">
        <summary className={`${aufklappKopfKlassen} text-ink text-liste font-medium`}>
          <Aufklappzeichen />
          {appointment.notification_channels.length === 0
            ? 'Mitteilung vermerken'
            : 'Mitteilung ändern'}
        </summary>
        <div className="mt-2">
          <p className="text-ink-muted max-w-prose text-sm">
            Für Gespräch und Anruf. Terminzettel und E-Mail werden vermerkt, sobald Sie dort
            bestätigen, dass sie übergeben bzw. gesendet wurden.
          </p>
          <div className="mt-2 flex flex-col gap-1">
            {notificationChannelOrder.map((kanal) => (
              <Checkbox
                key={kanal}
                label={notificationChannelLabels[kanal].lang}
                checked={auswahl.includes(kanal)}
                onChange={(e) => umschalten(kanal, e.target.checked)}
              />
            ))}
          </div>

          <p className="text-ink-muted mt-3 max-w-prose text-xs leading-relaxed">
            Sobald der Termin verschoben oder anders geändert wird, verfällt der Vermerk – die neue
            Zeit ist dann noch nicht mitgeteilt.
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="secondary"
              disabled={mutation.isPending || gleich}
              onClick={() => mutation.mutate(auswahl)}
            >
              {mutation.isPending ? 'Wird vermerkt …' : 'Vermerk speichern'}
            </Button>
            {/* Im Erfolgston, und mit dem Fokus: Der Knopf ist nach dem
                Speichern abgeschaltet, weil nichts mehr zu speichern ist
                (UIK-21). */}
            {mutation.isError ? (
              <Statusmeldung ton="fehler">{mutation.error.message}</Statusmeldung>
            ) : gespeichert ? (
              <Rueckmeldung>
                {auswahl.length === 0 ? 'Vermerk zurückgenommen.' : 'Vermerk gespeichert.'}
              </Rueckmeldung>
            ) : null}
          </div>
        </div>
      </details>
    </Section>
  );
}
