import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Disclosure } from '@/components/ui/Card';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Formularfuss } from '@/components/ui/Formularfuss';
import { GefuehrterAblauf } from '@/components/ui/GefuehrterAblauf';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { kannZurueck, aendern, zurueck, type Abfolge } from '@/components/ui/abfolge';
import { useTextverlustschutz } from '@/app/Textverlustschutz';
import {
  AUSFALLHONORAR_RECHTZEITIG,
  AUSFALLHONORAR_REGEL,
  AUSFALLHONORAR_SPAET,
} from '@/lib/ausfallhonorar';
import { termineSchluessel, wuenscheSchluessel, type Plattformzugang, type Termin } from './api';
import { usePlattformApi } from './einsicht';
import { PLATTFORM_PFAD } from './pfade';
import {
  NICHTS_GEWAEHLT,
  WUNSCHTAGE,
  artAusAdresse,
  beginneAenderung,
  nachDerArt,
  notizFehler,
  stand,
  ungespeichert,
  wannFehlt,
  wunschtage,
  wunschzeiten,
  zurZusammenfassung,
  type Angaben,
  type Art,
  type Seite,
} from './terminablauf';
import { terminBeschreibung, terminKurz } from './terminbeschreibung';
import { Angabe, Nachricht, Wannzeile, Wunschfelder, Zusammenfassungsanfang } from './Wunschfelder';
import { WUNSCHSCHUTZ } from './wunschtexte';
import { naechsteWerktage, tagKurz, tagLang, zeitraum } from './zeit';

/**
 * Ein eigener Termin mit den zwei Wünschen (POR-010, DSN-001 4.1, D4):
 * **ändern** oder **absagen**. Beides ist ein Wunsch, den die Praxis
 * bestätigt (§8).
 *
 * Seit Überholung 6 (G6) ein geführter Ablauf im Fenster, in 18 px wie die
 * ganze Plattform: „Was möchten Sie?“ → beim Absagen der Hinweis zum
 * Ausfallhonorar als eigene Seite im festen Wortlaut, unter 24 Stunden
 * deutlich (ADR-018 Punkt 8; ob das so ist, hat der Server gerechnet,
 * `late_notice`, nie der Browser) → beim Ändern „Wann passt es Ihnen?“ →
 * Zusammenfassung mit „Ändern“ je Angabe, die Nachricht eingeklappt, ein
 * Hauptknopf. Die Frist steht vor dem Knopf, nicht dahinter (BEF-079). Mit
 * `?art=cancel` oder `?art=change` beginnt gleich die passende Seite.
 *
 * Ist der Termin nicht mehr änderbar oder liegt schon ein Wunsch vor, sagt
 * die Seite das wie bisher.
 */
export function Terminaenderung({ zugang }: { zugang: Plattformzugang }) {
  const api = usePlattformApi();
  // Die Kennung aus dem Pfad `/p/termine/<id>` - nicht aus `useParams`, damit
  // die Seite auch in einer Platzhalterroute funktioniert.
  const { pathname } = useLocation();
  const terminId = pathname.slice(pathname.lastIndexOf('/') + 1);
  const [suche] = useSearchParams();
  const bereich = new URLSearchParams(
    Object.fromEntries([...suche.entries()].filter(([k]) => k === 'bereich' || k === 'zugang')),
  ).toString();
  const terminliste = `${PLATTFORM_PFAD}/termine${bereich ? `?${bereich}` : ''}`;

  const termine = useQuery({
    queryKey: termineSchluessel(zugang.access_id),
    queryFn: () => api.ladeTermine(zugang.access_id),
  });
  const termin = termine.data?.find((t) => t.id === terminId);

  if (termine.isPending) {
    return (
      <>
        <Rueckweg standard={terminliste} beschriftung="Zu den Terminen" />
        <LoadingState label="Ihr Termin wird geladen …" />
      </>
    );
  }
  if (!termin) {
    return (
      <>
        <Rueckweg standard={terminliste} beschriftung="Zu den Terminen" />
        <ErrorState
          title="Dieser Termin wurde nicht gefunden."
          description="Vielleicht hat die Praxis ihn geändert. Bitte sehen Sie in Ihre Terminliste."
        />
      </>
    );
  }
  const aenderbar =
    termin.status === 'confirmed' && new Date(termin.starts_at).getTime() > Date.now();
  if (!aenderbar || termin.open_request_kind) {
    return (
      <>
        <Rueckweg standard={terminliste} beschriftung="Zu den Terminen" />
        <Terminkopf termin={termin} />
        {!aenderbar ? (
          <p className="text-ink max-w-prose text-base leading-relaxed">
            Dieser Termin lässt sich hier nicht mehr ändern. Bei Fragen rufen Sie bitte die Praxis
            an.
          </p>
        ) : (
          <Statusmeldung ton="neutral">
            {termin.open_request_kind === 'cancel'
              ? 'Ihr Absagewunsch ist bei der Praxis. Sie meldet sich bei Ihnen.'
              : 'Ihr Änderungswunsch ist bei der Praxis. Sie meldet sich bei Ihnen.'}
          </Statusmeldung>
        )}
      </>
    );
  }
  return (
    <Aenderungsablauf
      zugang={zugang}
      termin={termin}
      startArt={artAusAdresse(suche.get('art'))}
      terminliste={terminliste}
    />
  );
}

const FRAGEN: Record<Seite, string> = {
  art: 'Was möchten Sie?',
  ausfallhonorar: 'Ausfallhonorar',
  wann: 'Wann passt es Ihnen?',
  zusammenfassung: 'Ist alles richtig?',
};

/** Der geführte Ablauf zu einem bestätigten künftigen Termin ohne offenen Wunsch. */
function Aenderungsablauf({
  zugang,
  termin,
  startArt,
  terminliste,
}: {
  zugang: Plattformzugang;
  termin: Termin;
  startArt: Art | null;
  terminliste: string;
}) {
  const api = usePlattformApi();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [abfolge, setAbfolge] = useState(() => beginneAenderung(startArt));
  const [angaben, setAngaben] = useState<Angaben>(() => ({
    art: startArt,
    verstanden: false,
    wann: NICHTS_GEWAEHLT,
  }));
  const [notiz, setNotiz] = useState('');
  // Was auf dieser Seite noch fehlt oder nicht passt, als Satz über dem Knopf.
  const [hinweis, setHinweis] = useState<string | null>(null);
  // Einmal je Ablauf: Was die Zusammenfassung zeigt, geht so auch an den Server.
  const [werktage] = useState(() => naechsteWerktage(WUNSCHTAGE));
  const { seite } = abfolge;
  const { art } = angaben;
  const spaet = termin.late_notice === true;

  const { freigeben, schutz } = useTextverlustschutz({
    ungespeichert: ungespeichert(abfolge, angaben.wann, notiz),
    kompakt: true,
    texte: WUNSCHSCHUTZ,
    // Die Zurückgeste des Telefons geht einen Schritt zurück, nicht aus dem Ablauf.
    schrittZurueck: kannZurueck(abfolge) ? () => zurueckGehen() : undefined,
  });

  const senden = useMutation({
    mutationFn: (gewaehlt: Art) =>
      api.terminAendernWuenschen({
        zugangId: zugang.access_id,
        terminId: termin.id,
        art: gewaehlt,
        tage: gewaehlt === 'change' ? wunschtage(angaben.wann.tage, werktage) : [],
        zeiten: gewaehlt === 'change' ? wunschzeiten(angaben.wann.zeiten) : [],
        notiz,
      }),
    onSuccess: () => {
      // Erst zur Liste, dann neu laden: Der neu geladene Termin trägt den
      // Wunsch, und diese Seite zeigte sonst kurz „Ihr Wunsch ist bei der Praxis“.
      freigeben();
      void navigate(`${terminliste}${terminliste.includes('?') ? '&' : '?'}gesendet=1`, {
        replace: true,
      });
      void queryClient.invalidateQueries({ queryKey: wuenscheSchluessel(zugang.access_id) });
      void queryClient.invalidateQueries({ queryKey: termineSchluessel(zugang.access_id) });
    },
  });

  function gehe(neu: Abfolge<Seite>) {
    setHinweis(null);
    senden.reset();
    setAbfolge(neu);
  }

  function zurueckGehen() {
    const vorher = zurueck(abfolge);
    if (vorher) gehe(vorher);
  }

  function waehleArt(neu: Art) {
    gehe(nachDerArt(abfolge, angaben, neu));
    setAngaben((bisher) => ({ ...bisher, art: neu }));
  }

  function verstanden() {
    setAngaben((bisher) => ({ ...bisher, verstanden: true }));
    gehe(zurZusammenfassung(abfolge));
  }

  function wannWeiter() {
    const fehlt = wannFehlt(angaben.wann);
    if (fehlt) {
      setHinweis(fehlt);
      return;
    }
    gehe(zurZusammenfassung(abfolge));
  }

  function absenden() {
    const zuLang = notizFehler(notiz);
    if (zuLang) {
      setHinweis(zuLang);
      return;
    }
    setHinweis(null);
    if (art) senden.mutate(art);
  }

  const fehler = hinweis ?? (senden.isError ? senden.error.message : null);
  const fehlerzeile = fehler ? (
    <Statusmeldung ton="fehler" className="mb-2">
      {fehler}
    </Statusmeldung>
  ) : null;
  const { titel: beschreibung, ort } = terminBeschreibung(termin);

  return (
    <GefuehrterAblauf
      titel={FRAGEN[seite]}
      objekt={terminKurz(termin)}
      schliessen="Abbrechen"
      onSchliessen={() => void navigate(terminliste)}
      seite={seite}
      stand={stand('aenderung', art, seite)}
      onZurueck={kannZurueck(abfolge) ? zurueckGehen : undefined}
      schutz={schutz}
      abschluss={seite === 'zusammenfassung'}
      fuss={
        seite === 'art' ? (
          <div className="flex flex-col gap-3">
            <Button
              className="w-full"
              data-autofocus
              aria-pressed={art ? art === 'change' : undefined}
              onClick={() => waehleArt('change')}
            >
              {art === 'change' ? <span aria-hidden="true">✓ </span> : null}
              Termin ändern
            </Button>
            <Button
              variant="secondary"
              className="w-full"
              aria-pressed={art ? art === 'cancel' : undefined}
              onClick={() => waehleArt('cancel')}
            >
              {art === 'cancel' ? <span aria-hidden="true">✓ </span> : null}
              Termin absagen
            </Button>
          </div>
        ) : seite === 'ausfallhonorar' ? (
          <Button className="w-full" onClick={verstanden}>
            Verstanden, weiter
          </Button>
        ) : seite === 'wann' ? (
          <>
            {fehlerzeile}
            <Button className="w-full" onClick={wannWeiter}>
              Weiter
            </Button>
          </>
        ) : (
          <>
            {fehlerzeile}
            <Formularfuss
              dicht
              zusatz={
                art === 'cancel' ? (
                  <Absagehinweis spaet={spaet} />
                ) : (
                  <Freigabehinweis spaet={spaet} />
                )
              }
            >
              <Button onClick={absenden} disabled={senden.isPending}>
                {senden.isPending
                  ? 'Wird gesendet …'
                  : art === 'cancel'
                    ? 'Absage senden'
                    : 'Änderungswunsch senden'}
              </Button>
            </Formularfuss>
          </>
        )
      }
    >
      {seite === 'art' ? (
        // Derselbe Termin, wie er in der Liste stand.
        <ListRows rahmen={false}>
          <ListRow
            zeit={<Terminzeit termin={termin} />}
            titel={beschreibung}
            meta={ort ?? undefined}
          />
        </ListRows>
      ) : seite === 'ausfallhonorar' ? (
        <Ausfallhonorar spaet={spaet} />
      ) : seite === 'wann' ? (
        <Wunschfelder
          wann={angaben.wann}
          onWann={(wann) => {
            setHinweis(null);
            setAngaben((bisher) => ({ ...bisher, wann }));
          }}
        />
      ) : (
        <div className="flex flex-col gap-3">
          <Zusammenfassungsanfang />
          <ListRows rahmen={false}>
            {/* Der Wunsch an seinem Termin, Tag über Uhrzeit wie in der
                Liste - „Ändern“ führt zurück zu „Was möchten Sie?“. */}
            <Angabe
              zeit={<Terminzeit termin={termin} />}
              titel={art === 'cancel' ? 'Termin absagen' : 'Termin ändern'}
              onAendern={() => gehe(aendern(abfolge, 'art'))}
            />
            {art === 'change' ? (
              <Wannzeile
                wann={angaben.wann}
                werktage={werktage}
                onAendern={() => gehe(aendern(abfolge, 'wann'))}
              />
            ) : null}
          </ListRows>
          <Nachricht
            label={
              art === 'cancel'
                ? 'Möchten Sie der Praxis etwas mitteilen?'
                : 'Was sollen wir noch wissen?'
            }
            wert={notiz}
            onWert={setNotiz}
          />
        </div>
      )}
    </GefuehrterAblauf>
  );
}

/** Tag über Uhrzeit, wie an der Zeile der Terminliste. */
function Terminzeit({ termin }: { termin: Termin }) {
  return (
    <span className="flex flex-col leading-tight">
      <span>{tagKurz(termin.starts_at)}</span>
      <span className="text-sm font-medium">{zeitraum(termin.starts_at, termin.ends_at)}</span>
    </span>
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
 * Der Hinweis zum Ausfallhonorar vor dem Absagewunsch (DSN-001 4.1) als eigene
 * Seite: fester Wortlaut, unter 24 Stunden deutlich als Warnung. Derselbe
 * Mangel wie BEF-079 in der Praxis darf hier nicht entstehen - die Frist steht
 * vor dem Knopf, nicht dahinter. Die ganze Regel steht auf Abruf darunter.
 */
function Ausfallhonorar({ spaet }: { spaet: boolean }) {
  return (
    <>
      {/* Der Fokus beginnt beim Hinweis: Vorlesesoftware liest ihn zuerst. */}
      <div tabIndex={-1} data-autofocus className="focus:outline-none">
        <Statusmeldung ton={spaet ? 'warnung' : 'neutral'} className={spaet ? 'font-semibold' : ''}>
          {spaet ? AUSFALLHONORAR_SPAET : AUSFALLHONORAR_RECHTZEITIG}
        </Statusmeldung>
      </div>
      <Disclosure summary="Unsere Regel zum Ausfallhonorar">
        <ul className="text-ink-muted flex flex-col gap-2 text-sm">
          {AUSFALLHONORAR_REGEL.map((satz) => (
            <li key={satz}>{satz}</li>
          ))}
        </ul>
      </Disclosure>
    </>
  );
}

/**
 * Über „Absage senden“, im festen Fuß: unter 24 Stunden noch einmal die
 * Warnung - die Frist steht vor dem Knopf, der sendet (BEF-079) -, dann der
 * Satz zum Eingang der Absage (ANN-247).
 */
function Absagehinweis({ spaet }: { spaet: boolean }) {
  return (
    <>
      {spaet ? (
        <Statusmeldung ton="warnung" className="mb-2 font-semibold">
          {AUSFALLHONORAR_SPAET}
        </Statusmeldung>
      ) : null}
      <p>
        Die Praxis trägt die Absage ein. Als Eingang Ihrer Absage gilt der Zeitpunkt, zu dem Sie
        diesen Wunsch senden.
      </p>
    </>
  );
}

/**
 * Über „Änderungswunsch senden“: was gilt, wenn die Praxis den Termin auf den
 * Wunsch hin freigibt - unter 24 Stunden als Warnung (ADR-018 Punkt 8,
 * `late_notice` vom Server).
 */
function Freigabehinweis({ spaet }: { spaet: boolean }) {
  return (
    <Statusmeldung ton={spaet ? 'warnung' : 'neutral'} className={spaet ? 'font-semibold' : ''}>
      {spaet
        ? 'Ihr Termin beginnt in weniger als 24 Stunden. Gibt die Praxis ihn auf Ihren Wunsch frei, gilt das wie eine kurzfristige Absage, und wir berechnen ein Ausfallhonorar nach unserer Preisliste.'
        : 'Gibt die Praxis den Termin auf Ihren Wunsch frei, gilt das wie eine Absage. Ihr Wunsch geht rechtzeitig ein, es entsteht kein Ausfallhonorar.'}
    </Statusmeldung>
  );
}
