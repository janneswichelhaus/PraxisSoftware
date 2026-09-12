import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
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
 * **Die Anwendung versendet nichts.** B15 ist vorläufig entschieden: In Stufe 1
 * und 2 gibt es keine automatische Terminerinnerung, die Anrufliste bleibt der
 * Weg. Diese Auswahl hält fest, was die Praxis selbst getan hat — auch
 * „Per E-Mail mitgeteilt" heißt, dass jemand die Nachricht selbst geschrieben
 * hat (ANN-040).
 *
 * Eine Mehrfachauswahl und kein Knopf je Weg: Gespeichert wird der Stand, den
 * man sieht. Alles abwählen nimmt den Vermerk zurück — der Fall „der Drucker
 * ging nicht". Verbindlich prüft und setzt die Serverfunktion
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
    onSuccess: async (kanaele) => {
      setAuswahl(kanaele);
      setGespeichert(true);
      await queryClient.invalidateQueries({ queryKey: ['appointment', appointment.id] });
      await queryClient.invalidateQueries({ queryKey: ['patient-upcoming-appointments'] });
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
    <Section
      titel="Mitteilung an die Patient:in"
      ebene={3}
      hinweis="Festgehalten wird, was die Praxis selbst getan hat. Die Anwendung verschickt nichts."
    >
      <div className="flex flex-col gap-1">
        {notificationChannelOrder.map((kanal) => (
          <Checkbox
            key={kanal}
            label={notificationChannelLabels[kanal].lang}
            checked={auswahl.includes(kanal)}
            onChange={(e) => umschalten(kanal, e.target.checked)}
          />
        ))}
      </div>

      <p className="text-ink-subtle mt-3 max-w-prose text-xs leading-relaxed">
        Sobald der Termin verschoben oder anders geändert wird, verfällt der Vermerk — die neue Zeit
        ist dann noch nicht mitgeteilt.
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
        {mutation.isError ? (
          <Statusmeldung ton="fehler">{mutation.error.message}</Statusmeldung>
        ) : gespeichert ? (
          <Statusmeldung>
            {auswahl.length === 0 ? 'Vermerk zurückgenommen.' : 'Vermerk gespeichert.'}
          </Statusmeldung>
        ) : null}
      </div>
    </Section>
  );
}
