import { useQuery } from '@tanstack/react-query';
import { DetailList, DetailRow } from '@/components/ui/DetailList';
import { Section } from '@/components/ui/Section';
import { Textlink } from '@/components/ui/Textlink';
import { Tile } from '@/components/ui/Tile';
import { formatDate } from '@/lib/datum';
import { formatEuro } from '@/lib/geld';
import { mitRueckweg } from '@/lib/rueckweg';
import { empfaengerartLabels } from '@/features/billing/api';
import { grundlageBezeichnung } from '@/features/treatment-bases/api';
import { Deckungszeichen } from './Deckungszeichen';
import { fetchAbrechnungslage, positionText, type Abrechnungslage } from './abrechnungslage-api';
import type { Appointment } from './api';

function OffeneRechnungen({ lage }: { lage: Abrechnungslage }) {
  const anzahl = lage.open_invoice_count ?? 0;
  if (anzahl === 0) return <>keine</>;
  return (
    <span className="flex flex-wrap items-center gap-x-2">
      <span>
        {anzahl === 1 ? '1 Rechnung' : `${anzahl} Rechnungen`},{' '}
        {formatEuro(lage.open_outstanding_cents ?? 0)} offen
        {lage.open_overdue ? ' – davon überfällig' : ''}
      </span>
      <Textlink alleinstehend className="text-sm" to="/abrechnung">
        Zu den offenen Posten
      </Textlink>
    </span>
  );
}

function useAbrechnungslage(appointmentId: string) {
  return useQuery({
    // Unter dem Schlüssel des Termins: Was den Termin neu lädt, lädt auch dies.
    queryKey: ['appointment', appointmentId, 'abrechnungslage'],
    queryFn: () => fetchAbrechnungslage(appointmentId),
    retry: false,
  });
}

/**
 * Die Kachel „Grundlage" am Termin (PRX-008, UX-005a): „Termin 8 von 10" mit
 * Bauart und Datum der Grundlage - für alle Rollen der Terminverwaltung.
 *
 * Seit CAL-022 steht hier auch die Deckung, wenn sie fehlt: Der Termin ist
 * geplant und gilt, aber er erzeugt keine Leistung gegen diese Grundlage
 * (§19, ADR-009). Das gehört an den Termin selbst, und der Weg zur Abhilfe
 * steht gleich daneben (TER-15). Bis UX-005a waren das zwei Tabellenzeilen an
 * verschiedenen Stellen.
 *
 * Lädt der Stand nicht, fehlt die Kachel - der Termin bleibt bedienbar.
 */
export function TreatmentBasisTile({
  appointment,
  darfVerwalten,
  zumTermin,
}: {
  appointment: Appointment;
  /** Darf die Person Termine übertragen? Nur Darstellung, der Server prüft. */
  darfVerwalten: boolean;
  /** Der Rückweg zu diesem Termin - für den Weg zum Übertragen. */
  zumTermin: string;
}) {
  const { data } = useAbrechnungslage(appointment.id);
  const ungedeckt = appointment.treatment_basis_covered === false;

  // Die fehlende Deckung kommt mit dem Termin selbst und steht auch dann da,
  // wenn der Zähler nicht lädt: Sie ist die Abrechnungsfrage, nicht der Zähler.
  if (!data && !ungedeckt) return null;
  const position = data ? positionText(data) : null;
  const grundlage =
    data?.treatment_basis_kind && data.treatment_basis_issued_on
      ? (() => {
          const { bauart, praeposition } = grundlageBezeichnung({
            treatment_basis_kind: data.treatment_basis_kind,
          });
          return `${bauart} ${praeposition} ${formatDate(data.treatment_basis_issued_on)}`;
        })()
      : null;

  return (
    <Tile label="Grundlage" ton={ungedeckt ? 'warnung' : 'neutral'}>
      {grundlage ? (
        <>
          {position ? <span className="block font-semibold">{position}</span> : null}
          <span className="block">{grundlage}</span>
        </>
      ) : data ? (
        'Keine Behandlungsgrundlage zugeordnet'
      ) : null}
      {ungedeckt ? (
        <span className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
          <Deckungszeichen gedeckt={appointment.treatment_basis_covered} />
          <span className="text-ink-muted text-sm">
            Die Behandlungsgrundlage deckt diesen Termin nicht.
          </span>
          {darfVerwalten && appointment.patient_id ? (
            <Textlink
              alleinstehend
              className="text-sm"
              to={mitRueckweg(
                `/patienten/${appointment.patient_id}/termine-uebertragen`,
                zumTermin,
              )}
            >
              Auf andere Grundlage übertragen
            </Textlink>
          ) : null}
        </span>
      ) : null}
    </Tile>
  );
}

/**
 * Ein eigener Abschnitt „Abrechnung" am Termin (BEF-081): Empfänger und
 * offene Rechnungen, nur für owner und office (ANN-139).
 *
 * Bis zur Sichtung standen beide als zwei unauffällige Zeilen zwischen Art,
 * Status und Grundlage - Jannes fand sie als office nicht. Ob sie da sind,
 * entscheidet weiter der Server (`billing_visible`); die Oberfläche blendet
 * nichts aus, was sie bekommen hat (ADR-004).
 */
export function AbrechnungAbschnitt({ appointmentId }: { appointmentId: string }) {
  const { data } = useAbrechnungslage(appointmentId);
  if (!data?.billing_visible) return null;

  return (
    <Section titel="Abrechnung" rahmen>
      <DetailList>
        <DetailRow label="Rechnung an">
          {empfaengerartLabels[data.recipient_kind ?? 'self'] ?? data.recipient_kind}
        </DetailRow>
        <DetailRow label="Offene Rechnungen">
          <OffeneRechnungen lage={data} />
        </DetailRow>
      </DetailList>
    </Section>
  );
}
