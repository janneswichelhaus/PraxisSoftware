import { Section } from '@/components/ui/Section';
import { Textlink } from '@/components/ui/Textlink';
import { Tile } from '@/components/ui/Tile';
import { formatDate } from '@/lib/datum';
import { formatEuro } from '@/lib/geld';
import { mitRueckweg } from '@/lib/rueckweg';
import { empfaengerartLabels } from '@/features/billing/api';
import { grundlageBezeichnung } from '@/features/treatment-bases/api';
import { Deckungszeichen } from './Deckungszeichen';
import { positionText, type Abrechnungslage } from './abrechnungslage-api';
import { useAbrechnungslage } from './useAbrechnungslage';
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

  // Seit dem Design-Handoff vom 2026-10-01 (Abschnitt 6) ist der Zähler der
  // Wert der Kachel und die Grundlage die Nebenzeile; der Weg zum Übertragen
  // steht am Fuß. Die Akzentfläche des Handoffs bekommt sie nicht: Die trägt
  // am Termin die Ausnahme - ein Praxis- oder Videotermin (ANN-192) -, und
  // neben einer grünen Grundlage fiele die nicht mehr auf.
  const wert = position ?? grundlage ?? (data ? 'Keine Behandlungsgrundlage zugeordnet' : null);
  return (
    <Tile
      label="Grundlage"
      ton={ungedeckt ? 'warnung' : 'neutral'}
      zusatz={position && grundlage ? grundlage : undefined}
      aktion={
        ungedeckt && darfVerwalten && appointment.patient_id ? (
          <Textlink
            alleinstehend
            to={mitRueckweg(`/patienten/${appointment.patient_id}/termine-uebertragen`, zumTermin)}
          >
            Auf andere Grundlage übertragen
          </Textlink>
        ) : undefined
      }
    >
      {wert}
      {ungedeckt ? (
        <span className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 font-normal">
          <Deckungszeichen gedeckt={appointment.treatment_basis_covered} />
          <span className="text-ink-muted text-sm">
            Die Behandlungsgrundlage deckt diesen Termin nicht.
          </span>
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

  // Beschriftung über dem Wert statt daneben: Der Abschnitt steht ab 900 px
  // Inhaltsbreite in der schmalen Kontextspalte (Design-Handoff 2026-10-01,
  // Abschnitt 6), und eine Spalte von 176 px für die Beschriftung ließe dem
  // Wert dort kaum Platz.
  return (
    <Section titel="Abrechnung" rahmen>
      <dl className="divide-line divide-y">
        <div className="py-2.5 first:pt-0">
          <dt className="text-ink-muted text-sm">Rechnung an</dt>
          <dd className="text-ink text-liste min-w-0 wrap-anywhere">
            {empfaengerartLabels[data.recipient_kind ?? 'self'] ?? data.recipient_kind}
          </dd>
        </div>
        <div className="py-2.5 last:pb-0">
          <dt className="text-ink-muted text-sm">Offene Rechnungen</dt>
          <dd className="text-ink text-liste min-w-0 wrap-anywhere">
            <OffeneRechnungen lage={data} />
          </dd>
        </div>
      </dl>
    </Section>
  );
}
