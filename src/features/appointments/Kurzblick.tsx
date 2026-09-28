import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Aufklappzeichen } from '@/components/ui/Card';
import { aufklappKopfKlassen } from '@/components/ui/aufklappStile';
import { Badge } from '@/components/ui/Badge';
import { DetailList, DetailRow } from '@/components/ui/DetailList';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { formatDate } from '@/lib/datum';
import { FREITEXT } from '@/features/documentation/format';
import { grundlageBezeichnung } from '@/features/treatment-bases/api';
import { formatLocalDate } from './api';
import { fetchKurzblick, type Kurzblick as KurzblickDaten } from './kurzblick-api';

/**
 * Der Inhalt - erst gezeichnet und gelesen, wenn der Blick offen ist.
 *
 * Jede Abfrage schreibt einen Auditeintrag (ANN-137). Die Abfrage lebt deshalb
 * nur so lange wie das offene Aufklappen: `gcTime: 0` wirft sie beim Zuklappen
 * weg, und das nächste Aufklappen liest und protokolliert neu.
 */
function KurzblickInhalt({ appointmentId }: { appointmentId: string }) {
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['appointment-brief', appointmentId],
    queryFn: () => fetchKurzblick(appointmentId),
    retry: false,
    gcTime: 0,
    staleTime: Infinity,
  });

  if (isPending) return <LoadingState label="Kurzblick wird geladen …" />;
  if (isError) {
    return (
      <ErrorState
        title="Der Kurzblick konnte nicht geladen werden."
        description="Bitte die Verbindung prüfen und erneut versuchen."
        onErneut={() => refetch()}
      />
    );
  }
  if (!data) {
    return <p className="text-ink-muted text-liste">Für diesen Termin gibt es keinen Kurzblick.</p>;
  }
  return <KurzblickAnzeige blick={data} />;
}

function Grundlage({ blick }: { blick: KurzblickDaten }) {
  if (!blick.treatment_basis_kind || !blick.treatment_basis_issued_on) {
    return <span className="text-ink-muted">Keine Behandlungsgrundlage zugeordnet.</span>;
  }
  const { bauart, praeposition } = grundlageBezeichnung({
    treatment_basis_kind: blick.treatment_basis_kind,
  });
  return (
    <>
      <span>
        {bauart} {praeposition} {formatDate(blick.treatment_basis_issued_on)}
      </span>
      {blick.basis_appointment_count !== null ? (
        <span className="text-ink-muted mt-1 block text-sm">
          {blick.basis_used ?? 0} von {blick.basis_appointment_count} Terminen genutzt,{' '}
          {blick.basis_planned ?? 0} geplant
        </span>
      ) : null}
      {/* Die Mengen je Heilmittel, wie sie gespeichert sind - keine Bewertung
          (ADR-006 Punkt 2). */}
      {blick.basis_items && blick.basis_items.length > 0 ? (
        <ul className="text-ink-muted mt-1 text-sm">
          {blick.basis_items.map((position) => (
            <li key={position.remedy}>
              {position.remedy}: {position.used_quantity} von {position.prescribed_quantity}
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}

function KurzblickAnzeige({ blick }: { blick: KurzblickDaten }) {
  const zone = blick.organization_time_zone;
  return (
    <DetailList>
      <DetailRow label="Zugang">{blick.home_visit_access_note ?? '—'}</DetailRow>
      <DetailRow label="Besonderheit">{blick.special_note ?? '—'}</DetailRow>
      {/* PRX-007: von Hand an der Person gepflegt, nie abgeleitet (ANN-138). */}
      <DetailRow label="Material">
        {blick.take_along_items.length > 0 ? blick.take_along_items.join(', ') : '—'}
      </DetailRow>
      <DetailRow label="Feste Therapeut:in">{blick.primary_therapist_name ?? '—'}</DetailRow>
      <DetailRow label="Grundlage">
        <Grundlage blick={blick} />
      </DetailRow>
      <DetailRow label="Letzter Eintrag">
        {blick.last_note_content !== null && blick.last_note_appointment_start ? (
          <>
            <span className="flex flex-wrap items-center gap-2">
              <span>{formatLocalDate(blick.last_note_appointment_start, zone)}</span>
              {blick.last_note_status === 'draft' ? <Badge>Entwurf</Badge> : null}
              {blick.last_note_visit_without_treatment ? <Badge>Ohne Behandlung</Badge> : null}
            </span>
            {/* Der Wortlaut, unverändert - keine Kürzung, keine Hervorhebung
                (ADR-006). */}
            <span className={`text-ink mt-2 block max-w-prose leading-relaxed ${FREITEXT}`}>
              {blick.last_note_content}
            </span>
            {blick.last_note_author_name ? (
              <span className="text-ink-muted mt-1 block text-xs">
                Verfasst von {blick.last_note_author_name}. Nachträge stehen in der Akte.
              </span>
            ) : null}
          </>
        ) : (
          <span className="text-ink-muted">Noch kein Eintrag vor diesem Termin.</span>
        )}
      </DetailRow>
    </DetailList>
  );
}

/**
 * Vertretungs-Kurzblick (PRX-006, `IDEA-PRX-016`).
 *
 * Zugeklappt, weil die Seite im Treppenhaus mitgelesen wird; geöffnet zeigt er
 * Zugang, Besonderheit, feste Therapeut:in, Grundlage und den letzten Eintrag.
 * Ob jemand ihn sehen darf, entscheidet `get_appointment_brief`; die Seite
 * zeigt ihn nur den Rollen, die ihn lesen dürfen, damit niemand einen Knopf
 * sieht, der ins Leere führt.
 */
export function Kurzblick({ appointmentId }: { appointmentId: string }) {
  const [offen, setOffen] = useState(false);
  return (
    <details
      className="group border-line rounded-card border px-4 py-1"
      onToggle={(event) => setOffen(event.currentTarget.open)}
    >
      <summary className={`${aufklappKopfKlassen} text-ink font-medium`}>
        <Aufklappzeichen />
        Kurzblick für die Vertretung
      </summary>
      {offen ? (
        <div className="pb-3">
          <p className="text-ink-muted mb-2 text-xs">
            Das Öffnen wird wie jedes Lesen der Dokumentation protokolliert.
          </p>
          <KurzblickInhalt appointmentId={appointmentId} />
        </div>
      ) : null}
    </details>
  );
}
