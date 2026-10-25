import { useId, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { symbolknopfKlassen, type SymbolGroesse } from '@/components/ui/buttonStile';
import { mitRueckweg } from '@/lib/rueckweg';
import { fetchAppointment, reopenAppointment } from '@/features/appointments/api';
import { hakenZuruecknehmbar } from '@/features/appointments/haken';
import { HomeVisitFlow } from '@/features/appointments/HomeVisitFlow';
import { NichtAngetroffenAktion } from '@/features/appointments/NichtAngetroffen';
import {
  VERSPAETUNG_MINUTEN,
  anrufNummer,
  smsHref,
  smsNummer,
  verspaetungsText,
} from './besuchswege';
import { terminName } from './tagesstart';
import { formatLocalTime } from '@/lib/datum';
import { kalenderZumTermin } from '@/lib/termin';
import type { DayPlanEntry } from '@/lib/tagesplan';

/** Hörer im 20er-Raster, Strich 1,75, runde Enden (DESIGN.md 9.15). */
function TelefonSymbol() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className="size-5"
    >
      <path d="M5.4 3.25h2.3l1.15 3.35-1.65 1.1a9.6 9.6 0 0 0 5.1 5.1l1.1-1.65 3.35 1.15v2.3a1.5 1.5 0 0 1-1.6 1.5A13.1 13.1 0 0 1 3.9 4.85a1.5 1.5 0 0 1 1.5-1.6Z" />
    </svg>
  );
}

/**
 * Anrufen mit einem Tipp (Auftrag C1): ein Symbol, keine Nummer im Bild.
 *
 * Die Nummer steht nur im Ziel des Links, nicht auf dem Bildschirm - die
 * Gründe für das „i“ (Umstehende lesen mit, AKTE-008) bleiben gewahrt. Gewählt
 * wird zuerst Mobil (`anrufNummer`); beide Nummern stehen weiter hinter dem
 * „i“ der Karte. Ohne Nummer gibt es keinen Knopf.
 */
export function AnrufKnopf({
  termin,
  groesse = 'normal',
}: {
  termin: DayPlanEntry;
  groesse?: SymbolGroesse;
}) {
  const nummer = anrufNummer(termin);
  if (!nummer) return null;
  return (
    <a
      href={nummer.href}
      aria-label={`Anrufen: ${terminName(termin)}`}
      title="Anrufen"
      className={symbolknopfKlassen('secondary', 'shrink-0', groesse)}
    >
      <TelefonSymbol />
    </a>
  );
}

/**
 * „Später da?“ - die Verspätung als SMS vom Diensttelefon (ANN-476).
 *
 * Ein Tipp öffnet drei Chips mit den Minuten, der zweite übergibt Nummer und
 * Vorlagentext an die SMS-App; abgeschickt wird dort, von Hand. Steht in einer
 * umbrechenden Knopfreihe: Die Chips rücken als eigene Zeile darunter.
 */
export function SpaeterDa({ termin, praxis }: { termin: DayPlanEntry; praxis: string }) {
  const [offen, setOffen] = useState(false);
  const bereichId = useId();
  const nummer = smsNummer(termin);
  if (!nummer) return null;
  return (
    <>
      <Button
        type="button"
        variant="quiet"
        groesse="kompakt"
        aria-expanded={offen}
        aria-controls={offen ? bereichId : undefined}
        onClick={() => setOffen((bisher) => !bisher)}
      >
        Später da?
      </Button>
      {offen ? (
        <div
          id={bereichId}
          role="group"
          aria-label="Verspätung per SMS ankündigen"
          className="order-last flex w-full flex-wrap gap-2"
        >
          {VERSPAETUNG_MINUTEN.map((minuten) => (
            <Chip key={minuten} href={smsHref(nummer, verspaetungsText(praxis, minuten))}>
              <span aria-hidden="true">+</span>
              {minuten} min
              <span className="sr-only"> per SMS ankündigen</span>
            </Chip>
          ))}
        </div>
      ) : null}
    </>
  );
}

/**
 * „Ausfall“ an Zeile und Karte der Übersicht (B12; wann, sagt
 * `ausfallMoeglich`). Ein Name für dasselbe an jeder Stelle - auch an der
 * Karte des nächsten Wegs, wo der Einstieg bis dahin „Niemand öffnet?“ hieß:
 * Jannes nennt ihn „Ausfall“, er passt an jede Terminart und in die schmale
 * Zeile, und das Feld darunter führt durch die Fälle (ADR-018 Punkt 9.3).
 *
 * Am Hausbesuch das Protokoll im geführten Fenster - geklingelt, angerufen,
 * 15 Minuten gewartet mit der Uhr; das Ausfallhonorar erst nach allen drei
 * Schritten (ANN-479, ANN-573). Am Praxis- und Videotermin dieselbe Rückfrage ohne Gebühr wie
 * im Terminfenster (`NichtAngetroffenAktion`, ANN-055); sie öffnet sich unter
 * den Knöpfen der Reihe. An der Zeile leise, an der Karte mit Rahmen.
 *
 * Für Vorlesesoftware trägt jeder Knopf, wessen Termin er meint - das
 * sichtbare Wort zuerst wie „Doku“ und der Haken daneben (UEB-10).
 */
export function AusfallKnopf({
  termin,
  ort,
  melden,
}: {
  termin: DayPlanEntry;
  /** `zeile` im Zeitstrahl, `karte` aufgeklappt, `tuer` an der Karte des nächsten Wegs. */
  ort: 'zeile' | 'karte' | 'tuer';
  melden: (text: string) => void;
}) {
  const variante = ort === 'zeile' ? 'quiet' : 'secondary';
  const zusatz = `für ${terminName(termin)} um ${formatLocalTime(
    termin.starts_at,
    termin.organization_time_zone,
  )} Uhr`;
  if (termin.appointment_type !== 'home_visit') {
    return (
      <NichtAngetroffenAktion
        appointment={termin}
        ausloeser="Ausfall"
        ausloeserVariante={variante}
        ausloeserGroesse="kompakt"
        ausloeserZusatz={zusatz}
        unterDerReihe
        melden={melden}
      />
    );
  }
  return (
    <HomeVisitFlow
      appointment={termin}
      ausloeser="Ausfall"
      ausloeserVariante={variante}
      ausloeserZusatz={zusatz}
      wege={{
        ohneBehandlung: mitRueckweg(`/termine/${termin.id}/abschluss?ohne-behandlung=1`, '/'),
        absagen: mitRueckweg(kalenderZumTermin(termin.id), '/'),
      }}
      melden={melden}
    />
  );
}

/**
 * „Rückgängig“ nach dem Haken (Praxis-Review R2, P1): Ein Fehltipp auf den
 * Haken schloss den Besuch ab, und zurück ging es nur über Kalender → Termin
 * → „Termin wieder öffnen“. Der Knopf nimmt genau diesen Weg
 * (`reopen_appointment`) - keine neue Serverfunktion; der Server erlaubt ihn
 * denselben Rollen wie den Haken. Seit B4 (BEF-154) jederzeit, auch nach dem
 * Festschreiben, solange die Leistung nicht abgerechnet und die Verordnung
 * nicht in der Abrechnung ist. Den Bearbeitungsstand liest er unmittelbar
 * vorher, wie der Haken, und nimmt nur einen Haken zurück, der noch steht.
 */
export function HakenRueckgaengig({
  appointmentId,
  name,
  beschriftung = 'Rückgängig',
  onWiederOffen,
  onFehler,
}: {
  appointmentId: string;
  name: string;
  /** „Haken zurücknehmen“ an der aufgeklappten Zeile, sonst „Rückgängig“. */
  beschriftung?: string;
  onWiederOffen: () => void;
  onFehler: (meldung: string) => void;
}) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: async () => {
      const termin = await fetchAppointment(appointmentId);
      if (!termin) throw new Error('Der Termin wurde nicht gefunden.');
      // Nur den eigenen Haken zurücknehmen: Steht der Termin inzwischen anders
      // (etwa „nicht angetroffen“), hat ihn jemand geändert - dann nicht
      // wieder öffnen, sondern im Kalender ansehen (Zweitreview, Befund 3).
      if (!hakenZuruecknehmbar(termin.status, termin.completed_at)) {
        throw new Error('Der Termin wurde inzwischen geändert. Bitte im Kalender ansehen.');
      }
      await reopenAppointment(termin.id, termin.updated_at);
    },
    onSuccess: () => {
      for (const queryKey of [['appointment', appointmentId], ['appointments'], ['day-plan']]) {
        void queryClient.invalidateQueries({ queryKey });
      }
      onWiederOffen();
    },
    onError: (fehler) => {
      onFehler(
        fehler instanceof Error ? fehler.message : 'Der Haken konnte nicht zurückgenommen werden.',
      );
    },
  });
  return (
    <Button
      type="button"
      variant="secondary"
      groesse="kompakt"
      className="shrink-0"
      disabled={mutation.isPending}
      aria-busy={mutation.isPending || undefined}
      onClick={() => {
        if (mutation.isPending) return;
        mutation.mutate();
      }}
    >
      {mutation.isPending ? 'Wird zurückgenommen …' : beschriftung}
      <span className="sr-only">: Haken bei {name}</span>
    </Button>
  );
}
