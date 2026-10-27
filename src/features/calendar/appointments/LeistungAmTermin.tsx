import { useQuery } from '@tanstack/react-query';
import { Kleingedrucktes } from '@/components/ui/Kleingedrucktes';
import { Section } from '@/components/ui/Section';
import { StatusMark } from '@/components/ui/StatusMark';
import { Zwischentitel } from '@/components/ui/Zwischentitel';
import { formatEuro } from '@/lib/geld';
import { fetchHonorar } from '@/features/billing';
import { canRecordBillableServices, type CurrentUser } from '@/features/core';
import { FreigabeStand, FreigabeVorschlag } from '@/features/patients';
import type { Abrechnungslage } from './abrechnungslage-api';
import type { Appointment } from './api';
import { istAbgehakt } from './haken';
import { fetchLeistungenAmTermin, type LeistungenAmTermin as Stand } from './leistungenAmTermin';
import { useAbrechnungslage } from './useAbrechnungslage';

/** „2. von 10 Terminen“ - oder `null` ohne Grundlage und an einer Absage. */
function leistungsPosition(lage: Abrechnungslage): string | null {
  if (lage.basis_position === null || lage.basis_appointment_count === null) return null;
  return `${lage.basis_position}. von ${lage.basis_appointment_count} Terminen`;
}

/**
 * Die Heilmittel zur Kontrolle: was erfasst ist, sonst was die Grundlage mit
 * dem Haken erfasst - je Heilmittel mit Restmenge eine Einheit (ANN-513).
 */
function heilmittelText(stand: Stand | null | undefined): string | null {
  if (!stand) return null;
  if (stand.services.length > 0) {
    return stand.services
      .map((s) => (s.quantity > 1 ? `${s.label} × ${s.quantity}` : s.label))
      .join(', ');
  }
  const offen = (stand.basis_items ?? []).filter((p) => p.used_quantity < p.prescribed_quantity);
  return offen.length > 0 ? offen.map((p) => p.remedy).join(', ') : null;
}

/**
 * Die Leistung am Termin (B7, BEF-157, ADR-009 Fassung 6): zur Kontrolle, nicht
 * zum Abhaken. Mit dem Haken gilt sie als erbracht; mit festgeschriebener Doku
 * entsteht sie von selbst (ANN-513). Die Therapeut:in bestätigt keine
 * Heilmittel mehr (ersetzt ANN-475).
 *
 *   * Mit Grundlage: „2. von 10 Terminen · KG, MT“.
 *   * Ohne Grundlage: der errechnete Betrag - für die Rollen der Abrechnung
 *     (ABR-031); alle anderen sehen, dass das Büro abrechnet.
 *
 * Ist die Grundlage mit diesem Termin vollständig erbracht und dokumentiert,
 * steht darunter der Vorschlag „In die Abrechnung stellen“ (ein Tipp).
 * Welche Zahlen ankommen, entscheidet der Server (ANN-139, ANN-140).
 */
export function LeistungAmTermin({
  appointment,
  user,
  amAbschluss = false,
}: {
  appointment: Appointment;
  user: CurrentUser;
  /** Auf der Schreibseite nach dem Festschreiben: Zwischentitel statt Abschnitt. */
  amAbschluss?: boolean;
}) {
  const lage = useAbrechnungslage(appointment.id);
  const stand = useQuery({
    queryKey: ['appointment', appointment.id, 'leistungen'],
    queryFn: () => fetchLeistungenAmTermin(appointment.id),
    retry: false,
  });
  const abrechnung = canRecordBillableServices(user.roles);
  const daten = lage.data;
  const mitGrundlage = !!daten?.treatment_basis_id;
  const honorar = useQuery({
    queryKey: ['patient-session-fee', appointment.patient_id],
    queryFn: () => fetchHonorar(appointment.patient_id!),
    enabled:
      abrechnung &&
      !!appointment.patient_id &&
      !!daten &&
      !mitGrundlage &&
      stand.isSuccess &&
      stand.data?.session_fee_cents === null,
    retry: false,
  });

  if (appointment.kind !== 'therapy' || appointment.status === 'cancelled') return null;
  if (appointment.status === 'no_show') return null;
  if (!daten) return null;

  const abgehakt = istAbgehakt(appointment.status, daten.checked_at ?? appointment.completed_at);
  const dokumentiert = appointment.status === 'documented' || appointment.status === 'invoiced';
  const erfasst = (stand.data?.services.length ?? 0) > 0;

  let zeile: string;
  if (mitGrundlage) {
    zeile = [leistungsPosition(daten), heilmittelText(stand.data)].filter(Boolean).join(' · ');
  } else {
    const betrag = stand.data?.session_fee_cents ?? honorar.data?.current_cents ?? null;
    zeile =
      abrechnung && betrag !== null
        ? `Ohne Verordnung · ${formatEuro(betrag)}`
        : 'Ohne Verordnung · rechnet das Büro ab';
  }

  const titelId = `leistung-${appointment.id}`;
  const inhalt = (
    <div className="flex flex-col gap-2">
      <p className="text-ink text-liste font-semibold">{zeile}</p>
      {abgehakt ? (
        <StatusMark ton="positiv">Erbracht</StatusMark>
      ) : (
        <StatusMark ton="warnung">Haken fehlt</StatusMark>
      )}
      {abgehakt && !dokumentiert ? (
        <Kleingedrucktes>Abrechenbar mit der festgeschriebenen Doku.</Kleingedrucktes>
      ) : null}
      {abgehakt && dokumentiert && mitGrundlage && stand.isSuccess && !erfasst ? (
        <StatusMark ton="warnung">Im Büro erfassen</StatusMark>
      ) : null}
      {daten.treatment_basis_id && daten.basis_released_at ? (
        <FreigabeStand
          treatmentBasisId={daten.treatment_basis_id}
          patientId={appointment.patient_id}
          freigegebenAm={daten.basis_released_at}
          abgerechnet={daten.basis_invoiced === true}
          darfZurueckholen={false}
          zeitzone={user.organizationTimeZone}
        />
      ) : daten.treatment_basis_id && daten.can_release && daten.basis_complete ? (
        <FreigabeVorschlag
          treatmentBasisId={daten.treatment_basis_id}
          patientId={appointment.patient_id}
        />
      ) : null}
    </div>
  );

  if (amAbschluss) {
    return (
      <section aria-labelledby={titelId}>
        <Zwischentitel id={titelId}>Leistung</Zwischentitel>
        {inhalt}
      </section>
    );
  }
  return <Section titel="Leistung">{inhalt}</Section>;
}
