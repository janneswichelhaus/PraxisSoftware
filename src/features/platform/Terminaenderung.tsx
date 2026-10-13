import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Disclosure } from '@/components/ui/Card';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Formularfuss } from '@/components/ui/Formularfuss';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { Feldgruppe, Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { TextArea } from '@/components/ui/TextArea';
import {
  AUSFALLHONORAR_RECHTZEITIG,
  AUSFALLHONORAR_REGEL,
  AUSFALLHONORAR_SPAET,
} from '@/lib/ausfallhonorar';
import {
  ladeTermine,
  terminAendernWuenschen,
  termineSchluessel,
  wuenscheSchluessel,
  type Plattformzugang,
  type Tageszeit,
  type Termin,
} from './api';
import { PLATTFORM_PFAD } from './pfade';
import { terminBeschreibung } from './terminbeschreibung';
import { Wunschfelder } from './Wunschfelder';
import { tagLang, zeitraum } from './zeit';

const NOTIZ_MAX = 500;

/**
 * Ein eigener Termin mit den zwei Wünschen (POR-010, DSN-001 4.1, D4):
 * **ändern** oder **absagen**. Beides ist ein Wunsch, den die Praxis
 * bestätigt (§8). Vor dem Absenden steht der Hinweis zum Ausfallhonorar im
 * festen Wortlaut; liegt der Termin unter 24 Stunden, deutlich über dem Knopf
 * (ADR-018 Punkt 8). Ob das so ist, hat der Server gerechnet (`late_notice`),
 * nie der Browser.
 *
 * Ein Hauptknopf je Ansicht, Abbrechen immer sichtbar (Abschnitt 7).
 */
export function Terminaenderung({ zugang }: { zugang: Plattformzugang }) {
  // Die Kennung aus dem Pfad `/p/termine/<id>` - nicht aus `useParams`, damit
  // die Seite auch in einer Platzhalterroute funktioniert.
  const { pathname } = useLocation();
  const terminId = pathname.slice(pathname.lastIndexOf('/') + 1);
  const [suche] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const bereich = new URLSearchParams(
    Object.fromEntries([...suche.entries()].filter(([k]) => k === 'bereich' || k === 'zugang')),
  ).toString();
  const zurueck = `${PLATTFORM_PFAD}/termine${bereich ? `?${bereich}` : ''}`;

  const termine = useQuery({
    queryKey: termineSchluessel(zugang.access_id),
    queryFn: () => ladeTermine(zugang.access_id),
  });
  const termin = termine.data?.find((t) => t.id === terminId);

  const [art, setArt] = useState<'change' | 'cancel' | null>(
    suche.get('art') === 'cancel' ? 'cancel' : suche.get('art') === 'change' ? 'change' : null,
  );
  const [tage, setTage] = useState<string[]>([]);
  const [zeiten, setZeiten] = useState<Tageszeit[]>([]);
  const [notiz, setNotiz] = useState('');
  const [pruefung, setPruefung] = useState<string | null>(null);

  const senden = useMutation({
    mutationFn: (gewaehlt: 'change' | 'cancel') =>
      terminAendernWuenschen({
        zugangId: zugang.access_id,
        terminId,
        art: gewaehlt,
        tage: gewaehlt === 'change' ? tage : [],
        zeiten: gewaehlt === 'change' ? zeiten : [],
        notiz,
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: wuenscheSchluessel(zugang.access_id) }),
        queryClient.invalidateQueries({ queryKey: termineSchluessel(zugang.access_id) }),
      ]);
      void navigate(`${zurueck}${bereich ? '&' : '?'}gesendet=1`, { replace: true });
    },
  });

  function absenden(e: React.FormEvent, gewaehlt: 'change' | 'cancel') {
    e.preventDefault();
    if (notiz.trim().length > NOTIZ_MAX) {
      setPruefung(`Ihre Nachricht darf höchstens ${NOTIZ_MAX} Zeichen lang sein.`);
      return;
    }
    setPruefung(null);
    senden.mutate(gewaehlt);
  }

  const fehler = pruefung ?? (senden.isError ? senden.error.message : null);

  return (
    <>
      <Rueckweg standard={zurueck} beschriftung="Zu den Terminen" />
      {termine.isPending ? (
        <LoadingState label="Ihr Termin wird geladen …" />
      ) : !termin ? (
        <ErrorState
          title="Dieser Termin wurde nicht gefunden."
          description="Vielleicht hat die Praxis ihn geändert. Bitte sehen Sie in Ihre Terminliste."
        />
      ) : (
        <>
          <Terminkopf termin={termin} />
          {termin.status !== 'confirmed' || new Date(termin.starts_at).getTime() <= Date.now() ? (
            <p className="text-ink max-w-prose text-base leading-relaxed">
              Dieser Termin lässt sich hier nicht mehr ändern. Bei Fragen rufen Sie bitte die Praxis
              an.
            </p>
          ) : termin.open_request_kind ? (
            <Statusmeldung ton="neutral">
              {termin.open_request_kind === 'cancel'
                ? 'Ihr Absagewunsch ist bei der Praxis. Sie meldet sich bei Ihnen.'
                : 'Ihr Änderungswunsch ist bei der Praxis. Sie meldet sich bei Ihnen.'}
            </Statusmeldung>
          ) : art === null ? (
            <div className="flex flex-col gap-3 *:w-full sm:flex-row sm:*:w-auto">
              <Button type="button" onClick={() => setArt('change')}>
                Termin ändern
              </Button>
              <Button type="button" variant="secondary" onClick={() => setArt('cancel')}>
                Termin absagen
              </Button>
            </div>
          ) : art === 'cancel' ? (
            <form onSubmit={(e) => absenden(e, 'cancel')} noValidate>
              <Section titel="Termin absagen">
                <Feldgruppe>
                  <Ausfallhonorar spaet={termin.late_notice === true} />
                  <TextArea
                    label="Möchten Sie der Praxis etwas mitteilen? (freiwillig)"
                    hint={`${notiz.trim().length} von ${NOTIZ_MAX} Zeichen`}
                    rows={3}
                    value={notiz}
                    onChange={(e) => setNotiz(e.target.value)}
                  />
                  {fehler ? <Statusmeldung ton="fehler">{fehler}</Statusmeldung> : null}
                </Feldgruppe>
              </Section>
              <Formularfuss zusatz="Die Praxis trägt die Absage ein. Als Eingang Ihrer Absage gilt der Zeitpunkt, zu dem Sie diesen Wunsch senden.">
                <Button type="submit" disabled={senden.isPending}>
                  {senden.isPending ? 'Wird gesendet …' : 'Absagewunsch senden'}
                </Button>
                <Button type="button" variant="quiet" onClick={() => setArt(null)}>
                  Abbrechen
                </Button>
              </Formularfuss>
            </form>
          ) : (
            <form onSubmit={(e) => absenden(e, 'change')} noValidate>
              <Section titel="Termin ändern">
                <div className="flex flex-col gap-8">
                  <p className="text-ink max-w-prose text-base leading-relaxed">
                    Sagen Sie uns, wann es Ihnen stattdessen passt. Die Praxis sucht einen neuen
                    Termin und meldet sich bei Ihnen; bis dahin bleibt der Termin oben bestehen.
                  </p>
                  <Wunschfelder tage={tage} zeiten={zeiten} onTage={setTage} onZeiten={setZeiten} />
                  <TextArea
                    label="Was sollen wir noch wissen? (freiwillig)"
                    hint={`${notiz.trim().length} von ${NOTIZ_MAX} Zeichen`}
                    rows={3}
                    value={notiz}
                    onChange={(e) => setNotiz(e.target.value)}
                  />
                  <Statusmeldung ton={termin.late_notice ? 'warnung' : 'neutral'}>
                    {termin.late_notice
                      ? 'Ihr Termin beginnt in weniger als 24 Stunden. Gibt die Praxis ihn auf Ihren Wunsch frei, gilt das wie eine kurzfristige Absage, und wir berechnen ein Ausfallhonorar nach unserer Preisliste.'
                      : 'Gibt die Praxis den Termin auf Ihren Wunsch frei, gilt das wie eine Absage. Ihr Wunsch geht rechtzeitig ein, es entsteht kein Ausfallhonorar.'}
                  </Statusmeldung>
                  {fehler ? <Statusmeldung ton="fehler">{fehler}</Statusmeldung> : null}
                </div>
              </Section>
              <Formularfuss>
                <Button type="submit" disabled={senden.isPending}>
                  {senden.isPending ? 'Wird gesendet …' : 'Änderungswunsch senden'}
                </Button>
                <Button type="button" variant="quiet" onClick={() => setArt(null)}>
                  Abbrechen
                </Button>
              </Formularfuss>
            </form>
          )}
        </>
      )}
    </>
  );
}

function Terminkopf({ termin }: { termin: Termin }) {
  const { titel, ort } = terminBeschreibung(termin);
  return (
    <PageHeader
      kicker="Termin"
      title={tagLang(termin.starts_at)}
      description={
        <>
          <span className="text-ink block font-semibold">
            {zeitraum(termin.starts_at, termin.ends_at)} · {titel}
          </span>
          {ort ? <span className="block">{ort}</span> : null}
        </>
      }
    />
  );
}

/**
 * Der Hinweis zum Ausfallhonorar vor dem Absagewunsch (DSN-001 4.1): fester
 * Wortlaut, unter 24 Stunden deutlich. Derselbe Mangel wie BEF-079 in der
 * Praxis darf hier nicht entstehen - die Frist steht vor dem Knopf, nicht
 * dahinter. Die ganze Regel steht auf Abruf darunter.
 */
function Ausfallhonorar({ spaet }: { spaet: boolean }) {
  return (
    <div>
      <Statusmeldung ton={spaet ? 'warnung' : 'neutral'}>
        {spaet ? AUSFALLHONORAR_SPAET : AUSFALLHONORAR_RECHTZEITIG}
      </Statusmeldung>
      <Disclosure summary="Unsere Regel zum Ausfallhonorar">
        <ul className="text-ink-muted flex flex-col gap-2 text-sm">
          {AUSFALLHONORAR_REGEL.map((satz) => (
            <li key={satz}>{satz}</li>
          ))}
        </ul>
      </Disclosure>
    </div>
  );
}
