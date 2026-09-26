import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { canWriteTreatmentNote, type CurrentUser } from '@/features/session/types';
import { berichtQueryKey, druckVermerken, fetchBericht } from './api';
import { Berichtsblatt } from './Berichtsblatt';

/**
 * Der Therapiebericht als Blatt zum Verschicken (DOK-005, B14 Weg 1).
 *
 * Wie beim Rechnungsblatt: Die Praxis druckt über ihren Browser, zu Papier,
 * Fax oder PDF. Die Datei entsteht auf dem Gerät, die Anwendung sieht sie
 * nie — aufbewahrt wird der Bericht als Datensatz mit seinem Snapshot
 * (ANN-121). Die Anwendung verschickt nichts; wer den Bericht an wen gibt,
 * entscheidet die Praxis (ANN-124).
 *
 * Der Druckknopf vermerkt zuerst den Export im Auditlog (ADR-010 Punkt 2) und
 * öffnet erst danach den Druckdialog. Scheitert der Vermerk, bleibt der
 * Dialog zu.
 */
export function TherapieberichtDruckPage({ user }: { user: CurrentUser }) {
  const { patientId = '', berichtId = '' } = useParams();
  const [druckfehler, setDruckfehler] = useState<string | null>(null);
  const [druckt, setDruckt] = useState(false);

  const bericht = useQuery({
    queryKey: berichtQueryKey(berichtId),
    queryFn: () => fetchBericht(berichtId),
    retry: false,
  });

  if (bericht.isPending) return <LoadingState label="Bericht wird geladen …" />;
  if (bericht.isError || !bericht.data) {
    return (
      <ErrorState
        title="Der Bericht konnte nicht geladen werden."
        description="Bitte später erneut versuchen. Sind Sie noch angemeldet?"
      />
    );
  }

  const entwurf = bericht.data.status === 'entwurf';

  async function drucken() {
    setDruckfehler(null);
    setDruckt(true);
    try {
      await druckVermerken(berichtId);
      window.print();
    } catch (fehler) {
      setDruckfehler(fehler instanceof Error ? fehler.message : 'Der Druck ist fehlgeschlagen.');
    } finally {
      setDruckt(false);
    }
  }

  return (
    <>
      <div className="nicht-drucken">
        <Rueckweg
          standard={`/patienten/${patientId}/verordnungen#verordnung-${bericht.data.treatment_basis_id}`}
          beschriftung="Zurück zur Verordnung"
        />
      </div>

      <Berichtsblatt dokument={bericht.data.document} entwurf={entwurf} />

      <div className="nicht-drucken mt-10 flex max-w-[210mm] flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={() => void drucken()} disabled={druckt}>
            {druckt ? 'Druck wird vorbereitet …' : 'Bericht drucken'}
          </Button>
          {entwurf && canWriteTreatmentNote(user.roles) ? (
            <ButtonLink to={`/patienten/${patientId}/berichte/${berichtId}`} variant="quiet">
              Weiter bearbeiten
            </ButtonLink>
          ) : null}
        </div>
        {druckfehler ? <Statusmeldung ton="fehler">{druckfehler}</Statusmeldung> : null}
        <p className="text-ink-subtle max-w-prose text-xs leading-relaxed">
          Der Druckdialog des Browsers führt zu Papier, Fax oder einer PDF-Datei. Diese Datei
          entsteht auf diesem Gerät; aufbewahrt wird der Bericht als Datensatz
          {entwurf ? ', sobald er abgeschlossen ist' : ' — so, wie er abgeschlossen wurde'}. Die
          Anwendung verschickt nichts.
        </p>
      </div>
    </>
  );
}
