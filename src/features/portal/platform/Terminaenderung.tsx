import { useId, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useIstVerbunden } from '@/app/verbindung';
import { Button } from '@/components/ui/Button';
import { Disclosure } from '@/components/ui/Card';
import { Formularfuss } from '@/components/ui/Formularfuss';
import { GefuehrterAblauf } from '@/components/ui/GefuehrterAblauf';
import { HakenSymbol } from '@/components/ui/HakenSymbol';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { kannZurueck, aendern, zurueck, type Abfolge } from '@/components/ui/abfolge';
import { useTextverlustschutz } from '@/app/Textverlustschutz';
import {
  AUSFALLHONORAR_RECHTZEITIG,
  AUSFALLHONORAR_REGEL,
  AUSFALLHONORAR_SPAET,
} from '@/lib/ausfallhonorar';
import {
  termineSchluessel,
  wuenscheSchluessel,
  ladeTermine,
  terminAendernWuenschen,
  type Plattformzugang,
  type Termin,
} from './api';
import { PLATTFORM_PFAD } from './pfade';
import {
  NICHTS_GEWAEHLT,
  WUNSCHTAGE,
  artAusAdresse,
  beginneAenderung,
  notizFehler,
  stand,
  ungespeichert,
  wannFehlt,
  wunschtage,
  wunschzeiten,
  zurZusammenfassung,
  type Art,
  type Seite,
  type Wann,
} from './terminablauf';
import { terminKurz } from './terminbeschreibung';
import { artUndPerson, tagInWorten, vonBis } from './termintexte';
import {
  Kartenangabe,
  Nachricht,
  OhneNetzHinweis,
  Wannangabe,
  Wunschfelder,
  Zusammenfassungsanfang,
  Zusammenfassungskarte,
} from './Wunschfelder';
import { Terminseite } from './Terminseite';
import { WUNSCHSCHUTZ } from './wunschtexte';
import { naechsteWerktage } from './zeit';

/**
 * Ändern oder Absagen in zwei Schritten, beides ein Wunsch, den die Praxis bestätigt (§8). Die Frist
 * zum Ausfallhonorar rechnet der Server (`late_notice`, ADR-018 Punkt 8), sie steht vor dem Knopf.
 * Beide beginnen auf der Seite des Termins (ANN-778); ✕ führt dorthin zurück (ANN-782).
 */
export function Terminaenderung({ zugang }: { zugang: Plattformzugang }) {
  // Die Kennung aus dem Pfad `/p/termine/<id>` - nicht aus `useParams`, damit
  // die Seite auch in einer Platzhalterroute funktioniert.
  const { pathname } = useLocation();
  const terminId = pathname.slice(pathname.lastIndexOf('/') + 1);
  const [suche] = useSearchParams();
  const bereich = new URLSearchParams(
    Object.fromEntries([...suche.entries()].filter(([k]) => k === 'bereich' || k === 'zugang')),
  ).toString();
  const mitBereich = (pfad: string) => `${pfad}${bereich ? `?${bereich}` : ''}`;
  const art = artAusAdresse(suche.get('art'));

  const termine = useQuery({
    queryKey: termineSchluessel(zugang.access_id),
    queryFn: () => ladeTermine(zugang.access_id),
  });
  const termin = termine.data?.find((t) => t.id === terminId);
  // Lädt der Termin noch, fehlt er, lässt er sich nicht mehr ändern oder fehlt die Art, steht die
  // Seite des Termins da: mit „Praxis anrufen“ statt eines Satzes ohne Nummer.
  const aenderbar =
    termin !== undefined &&
    termin.status === 'confirmed' &&
    new Date(termin.starts_at).getTime() > Date.now() &&
    !termin.open_request_kind;
  if (!termin || !aenderbar || !art) return <Terminseite zugang={zugang} />;
  return (
    <Aenderungsablauf
      zugang={zugang}
      termin={termin}
      art={art}
      terminliste={mitBereich(`${PLATTFORM_PFAD}/termine`)}
      seiteDesTermins={mitBereich(`${PLATTFORM_PFAD}/termine/${termin.id}`)}
    />
  );
}

const FRAGEN: Record<Seite, string> = {
  ausfallhonorar: 'Ausfallhonorar',
  wann: 'Wann passt es Ihnen?',
  zusammenfassung: 'Ist alles richtig?',
};

/** Der geführte Ablauf zu einem bestätigten künftigen Termin ohne offenen Wunsch. */
function Aenderungsablauf({
  zugang,
  termin,
  art,
  terminliste,
  seiteDesTermins,
}: {
  zugang: Plattformzugang;
  termin: Termin;
  art: Art;
  terminliste: string;
  seiteDesTermins: string;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const verbunden = useIstVerbunden();
  const ohneNetzId = useId();
  const [abfolge, setAbfolge] = useState(() => beginneAenderung(art));
  const [wann, setWann] = useState<Wann>(NICHTS_GEWAEHLT);
  const [notiz, setNotiz] = useState('');
  // Was auf dieser Seite noch fehlt oder nicht passt, als Satz über dem Knopf.
  const [hinweis, setHinweis] = useState<string | null>(null);
  // Einmal je Ablauf: Was die Zusammenfassung zeigt, geht so auch an den Server.
  const [werktage] = useState(() => naechsteWerktage(WUNSCHTAGE));
  const [jetzt] = useState(() => new Date());
  const { seite } = abfolge;
  const spaet = termin.late_notice === true;

  const { freigeben, schutz } = useTextverlustschutz({
    ungespeichert: ungespeichert(abfolge, wann, notiz),
    kompakt: true,
    texte: WUNSCHSCHUTZ,
    // Die Zurückgeste des Telefons geht einen Schritt zurück, nicht aus dem Ablauf.
    schrittZurueck: kannZurueck(abfolge) ? () => zurueckGehen() : undefined,
    // Die Seite des Termins hat denselben Pfad, nur ohne `?art=`: Auch dorthin ist es ein Weggehen.
    auchSuchparameter: true,
    ohneVerbindungZeigen: false,
  });

  const senden = useMutation({
    mutationFn: () =>
      terminAendernWuenschen({
        zugangId: zugang.access_id,
        terminId: termin.id,
        art,
        tage: art === 'change' ? wunschtage(wann.tage, werktage) : [],
        zeiten: art === 'change' ? wunschzeiten(wann.zeiten) : [],
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

  function wannWeiter() {
    const fehlt = wannFehlt(wann);
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
    senden.mutate();
  }

  const fehler = hinweis ?? (senden.isError ? senden.error.message : null);
  const fehlerzeile = fehler ? (
    <Statusmeldung ton="fehler" className="mb-2">
      {fehler}
    </Statusmeldung>
  ) : null;
  const tagUndZeit = `${tagInWorten(termin.starts_at, jetzt)}, ${vonBis(termin)}`;
  const artPerson = artUndPerson(termin, zugang.relationship_kind);

  return (
    <GefuehrterAblauf
      titel={FRAGEN[seite]}
      objekt={terminKurz(termin)}
      schliessen="Abbrechen"
      // Zurück zur Seite des Termins, ohne den Ablauf im Verlauf zu lassen (ANN-782).
      onSchliessen={() => void navigate(seiteDesTermins, { replace: true })}
      seite={seite}
      stand={stand('aenderung', art, seite)}
      onZurueck={kannZurueck(abfolge) ? zurueckGehen : undefined}
      schutz={schutz}
      abschluss={seite === 'zusammenfassung'}
      balkenJeSchritt
      plattform
      schmalesFenster
      fuss={
        seite === 'ausfallhonorar' ? (
          <Button className="w-full" onClick={() => gehe(zurZusammenfassung(abfolge))}>
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
            <OhneNetzHinweis id={ohneNetzId} verbunden={verbunden} />
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
              <Button
                onClick={absenden}
                disabled={senden.isPending || !verbunden}
                aria-describedby={verbunden ? undefined : ohneNetzId}
              >
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
      {seite === 'ausfallhonorar' ? (
        <Ausfallhonorar spaet={spaet} />
      ) : seite === 'wann' ? (
        <Wunschfelder
          wann={wann}
          werktage={werktage}
          onWann={(neu) => {
            setHinweis(null);
            setWann(neu);
          }}
        />
      ) : (
        <div className="flex flex-col gap-3">
          <Zusammenfassungsanfang />
          <Zusammenfassungskarte>
            {art === 'cancel' ? (
              <Kartenangabe
                vorn={<Absagekreis />}
                wert="Termin absagen"
                zusatz={[tagUndZeit, artPerson]}
              />
            ) : (
              // Der Termin steht im Kopf; als eigene Zeile rollte die Seite bei 375 × 667 (ANN-785).
              <Wannangabe
                titel="Lieber am"
                wann={wann}
                werktage={werktage}
                onAendern={() => gehe(aendern(abfolge, 'wann'))}
              />
            )}
          </Zusammenfassungskarte>
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

/** Der Kreis der Absage in der Zusammenfassung: ein Kreuz, das Wort steht daneben. */
function Absagekreis() {
  return (
    <span
      aria-hidden="true"
      className="bg-danger-soft text-danger rounded-pill inline-flex size-10 shrink-0 items-center justify-center text-xl font-bold"
    >
      ×
    </span>
  );
}

/**
 * Der Hinweis zum Ausfallhonorar vor dem Absagewunsch als eigene Seite, fester Wortlaut: rechtzeitig
 * mit Haken, unter 24 Stunden als Warnung mit der ganzen Regel offen darunter. Die Frist steht vor
 * dem Knopf, nicht dahinter.
 */
function Ausfallhonorar({ spaet }: { spaet: boolean }) {
  return (
    <>
      {/* Der Fokus beginnt beim Hinweis: Vorlesesoftware liest ihn zuerst. */}
      <div tabIndex={-1} data-autofocus className="focus:outline-none">
        {spaet ? (
          <div
            role="alert"
            className="bg-warnung-soft rounded-card flex items-start gap-4 p-5 max-[23rem]:flex-col max-[23rem]:p-3"
          >
            <span
              aria-hidden="true"
              className="bg-warnung text-warnung-soft rounded-pill inline-flex size-10 shrink-0 items-center justify-center text-xl font-bold"
            >
              !
            </span>
            <p className="text-warnung font-semibold">{AUSFALLHONORAR_SPAET}</p>
          </div>
        ) : (
          <div className="border-line bg-surface rounded-card flex items-start gap-4 border p-5 max-[23rem]:flex-col max-[23rem]:p-3">
            <span
              aria-hidden="true"
              className="bg-accent-soft text-accent rounded-pill inline-flex size-10 shrink-0 items-center justify-center"
            >
              <HakenSymbol className="size-5" />
            </span>
            <p>{AUSFALLHONORAR_RECHTZEITIG}</p>
          </div>
        )}
      </div>
      <Disclosure summary="Unsere Regel zum Ausfallhonorar" offen={spaet}>
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
