import { useQuery } from '@tanstack/react-query';
import { Disclosure } from '@/components/ui/Card';
import { DetailList, DetailRow } from '@/components/ui/DetailList';
import { Zwischentitel } from '@/components/ui/Zwischentitel';
import { useSession } from '@/features/auth/sessionContext';
import { useCurrentUser } from '@/features/session/useCurrentUser';
import { fetchTreatmentBasisVersions, type TreatmentBasisDetail } from './api';
import { aktuellerInhalt, verlauf } from './verlauf';
import { formatLocalDate, formatLocalTime } from '@/lib/datum';

/**
 * Der Verlauf einer Grundlage auf ihrer Bearbeiten-Seite (BEF-124, ANN-562).
 *
 * Eingeklappt, weil er selten gebraucht wird (DESIGN.md: Seltenes auf Abruf);
 * ohne frühere Stände steht er gar nicht da. Je Änderung: wann, wer und je
 * Feld der Wert davor - der ursprüngliche Inhalt nach § 630f Abs. 1 BGB.
 */
export function GrundlagenVerlauf({ grundlage }: { grundlage: TreatmentBasisDetail }) {
  const { session } = useSession();
  const user = useCurrentUser(session?.user.id);
  const zone = user.data?.organizationTimeZone ?? 'Europe/Berlin';

  const fassungen = useQuery({
    queryKey: ['treatment-basis-versions', grundlage.id],
    queryFn: () => fetchTreatmentBasisVersions(grundlage.id),
    retry: false,
  });

  if (!fassungen.data || fassungen.data.length === 0) return null;
  const eintraege = verlauf(fassungen.data, aktuellerInhalt(grundlage));

  return (
    <div className="max-w-formular mt-8">
      <Disclosure summary="Verlauf" anzahl={eintraege.length} kopf="label">
        {eintraege.map((eintrag) => (
          <section key={eintrag.version_no} aria-label={`Änderung ${eintrag.version_no}`}>
            <Zwischentitel ebene={3}>
              {formatLocalDate(eintrag.replaced_at, zone)},{' '}
              {formatLocalTime(eintrag.replaced_at, zone)} Uhr
            </Zwischentitel>
            <p className="text-ink-muted text-sm">
              Geändert von {eintrag.replaced_by_name ?? 'unbekannt'}. Vorher:
            </p>
            <DetailList>
              {eintrag.aenderungen.length === 0 ? (
                <DetailRow label="Inhalt">ohne sichtbaren Unterschied</DetailRow>
              ) : (
                eintrag.aenderungen.map((a) => (
                  <DetailRow key={a.feld} label={a.feld}>
                    {a.vorher}
                  </DetailRow>
                ))
              )}
            </DetailList>
          </section>
        ))}
      </Disclosure>
    </div>
  );
}
