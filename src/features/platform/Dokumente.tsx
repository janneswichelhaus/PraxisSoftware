import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Dateiansicht } from '@/features/files/Dateiansicht';
import {
  dokumenteSchluessel,
  ladeDokumentHerunter,
  ladeDokumentZumAnzeigen,
  ladeDokumente,
  type Dokument,
  type Plattformzugang,
} from './api';
import { PLATTFORM_PFAD } from './pfade';
import { datum } from './zeit';

/** Die Dokumentarten in der Sprache der Person. */
const ART: Record<string, string> = {
  verordnungsscan: 'Verordnung',
  befund: 'Befund',
  arztbrief: 'Arztbrief',
  klinisches_bild: 'Bild aus der Untersuchung',
  einwilligung: 'Einwilligung',
  vertrag: 'Vertrag',
};

const GROESSE = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 });
function groesse(bytes: number): string {
  if (bytes < 1024 * 1024) return `${GROESSE.format(Math.max(1, bytes / 1024))} KB`;
  return `${GROESSE.format(bytes / (1024 * 1024))} MB`;
}

/**
 * „Ich → Dokumente" (POR-014, DSN-001 D3): was die Praxis einzeln für die
 * Person freigegeben hat - nichts ist voreingestellt sichtbar, Fotos nie.
 * Bilder öffnen sich in der Anwendung, ein PDF wird heruntergeladen
 * (ADR-017 Punkte 54, 55). Der Abruf steht nicht im Protokoll (BEF-138,
 * ADR-010 Punkt 22); nachgewiesen ist die Freigabe.
 */
export function Dokumente({ zugang }: { zugang: Plattformzugang }) {
  const dokumente = useQuery({
    queryKey: dokumenteSchluessel(zugang.access_id),
    queryFn: () => ladeDokumente(zugang.access_id),
    enabled: zugang.relationship_kind === 'treatment',
  });
  return (
    <>
      <Link
        to={`${PLATTFORM_PFAD}/ich`}
        className="text-ink-muted hover:text-ink mb-4 inline-flex min-h-11 items-center text-sm"
      >
        ← Zu „Ich“
      </Link>
      <h1 className="text-accent text-h3 font-bold">Dokumente</h1>
      {zugang.relationship_kind !== 'treatment' ? (
        <p className="text-ink mt-4 max-w-prose text-base leading-relaxed">
          Im Training gibt es keine Dokumente.
        </p>
      ) : dokumente.isPending ? (
        <LoadingState label="Ihre Dokumente werden geladen …" />
      ) : dokumente.data === undefined ? (
        <ErrorState
          title="Ihre Dokumente konnten nicht geladen werden."
          description="Bitte die Verbindung prüfen und erneut versuchen."
          onErneut={() => dokumente.refetch()}
        />
      ) : dokumente.data.length === 0 ? (
        <p className="text-ink mt-4 max-w-prose text-base leading-relaxed">
          Die Praxis hat noch kein Dokument für Sie freigegeben. Was Sie hier sehen, entscheidet
          Ihre Therapeut:in Stück für Stück.
        </p>
      ) : (
        <Section titel="Freigegebene Dokumente" rahmen>
          <ul className="flex flex-col">
            {dokumente.data.map((d) => (
              <Dokumentzeile key={d.id} zugang={zugang} dokument={d} />
            ))}
          </ul>
        </Section>
      )}
    </>
  );
}

function Dokumentzeile({ zugang, dokument: d }: { zugang: Plattformzugang; dokument: Dokument }) {
  const [laeuft, setLaeuft] = useState<'oeffnen' | 'herunterladen' | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ansicht, setAnsicht] = useState<Blob | null>(null);
  const ansichtRef = useRef<HTMLElement>(null);
  const bild = d.mime_type === 'image/jpeg' || d.mime_type === 'image/png';

  useEffect(() => {
    if (!ansicht) return;
    ansichtRef.current?.scrollIntoView?.({ block: 'nearest' });
    ansichtRef.current?.focus();
  }, [ansicht]);

  async function ausfuehren(aktion: 'oeffnen' | 'herunterladen') {
    setFehler(null);
    setLaeuft(aktion);
    try {
      if (aktion === 'oeffnen') {
        setAnsicht((await ladeDokumentZumAnzeigen(zugang.access_id, d.id)).bild);
      } else {
        await ladeDokumentHerunter(zugang.access_id, d.id);
      }
    } catch (ursache) {
      setFehler((ursache as Error).message);
    } finally {
      setLaeuft(null);
    }
  }

  return (
    <li className="border-line border-t py-3 first:border-t-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 wrap-anywhere">
          <p className="text-ink text-base font-medium">{d.display_name}</p>
          <p className="text-ink-muted mt-0.5 text-sm">
            {ART[d.document_type] ?? 'Dokument'} · {groesse(d.byte_size)} · freigegeben am{' '}
            {datum(d.released_at)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {bild ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => void ausfuehren('oeffnen')}
              disabled={laeuft !== null}
            >
              {laeuft === 'oeffnen' ? 'Wird geöffnet …' : 'Ansehen'}
              <span className="sr-only">: {d.display_name}</span>
            </Button>
          ) : null}
          <Button
            type="button"
            variant={bild ? 'quiet' : 'secondary'}
            onClick={() => void ausfuehren('herunterladen')}
            disabled={laeuft !== null}
          >
            {laeuft === 'herunterladen' ? 'Wird heruntergeladen …' : 'Herunterladen'}
            <span className="sr-only">: {d.display_name}</span>
          </Button>
        </div>
      </div>
      {fehler ? (
        <Statusmeldung ton="fehler" className="mt-2">
          {fehler}
        </Statusmeldung>
      ) : null}
      {ansicht ? (
        <Dateiansicht
          ref={ansichtRef}
          bild={ansicht}
          name={d.display_name}
          onSchliessen={() => setAnsicht(null)}
        />
      ) : null}
    </li>
  );
}
