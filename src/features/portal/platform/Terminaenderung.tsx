import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Disclosure } from '@/components/ui/Card';
import { GefuehrterAblauf } from '@/components/ui/GefuehrterAblauf';
import { HakenSymbol } from '@/components/ui/HakenSymbol';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Terminliste } from '@/components/ui/Terminliste';
import { aendern, kannZurueck, zurueck, type Abfolge } from '@/components/ui/abfolge';
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
import { PLATTFORM_PFAD, bereichParameter } from './pfade';
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
  Angabe,
  Nachricht,
  Sendefuss,
  Wannangabe,
  Wunschfelder,
  Zusammenfassungsanfang,
} from './Wunschfelder';
import { Terminseite } from './Terminseite';
import { WUNSCHSCHUTZ } from './wunschtexte';
import { naechsteWerktage } from './zeit';

/**
 * Ändern oder Absagen in zwei Schritten ab der Seite des Termins (ANN-778), beides ein Wunsch, den
 * die Praxis bestätigt (§8); die Frist zum Ausfallhonorar rechnet der Server (`late_notice`). Ohne
 * gültiges `?art=` oder ohne änderbaren Termin steht die Seite des Termins da.
 */
export function Terminaenderung({ zugang }: { zugang: Plattformzugang }) {
  // Die Kennung aus dem Pfad `/p/termine/<id>` - nicht aus `useParams`, damit
  // die Seite auch in einer Platzhalterroute funktioniert.
  const { pathname } = useLocation();
  const terminId = pathname.slice(pathname.lastIndexOf('/') + 1);
  const [suche] = useSearchParams();
  const art = artAusAdresse(suche.get('art'));

  const termine = useQuery({
    queryKey: termineSchluessel(zugang.access_id),
    queryFn: () => ladeTermine(zugang.access_id),
  });
  const termin = termine.data?.find((t) => t.id === terminId);
  const aenderbar =
    termin !== undefined &&
    termin.status === 'confirmed' &&
    new Date(termin.starts_at).getTime() > Date.now() &&
    !termin.open_request_kind;
  if (!termin || !aenderbar || !art) return <Terminseite zugang={zugang} />;

  // ✕ führt zur Seite des Termins, wie sie war: mit Bereich und Rückweg, ohne `art` (ANN-782).
  const seiteDesTermins = new URLSearchParams(suche);
  seiteDesTermins.delete('art');
  // `toString` statt `size`: Das kennt Safari erst ab Version 17.
  const rest = seiteDesTermins.toString();
  const bereich = bereichParameter(suche);
  return (
    <Aenderungsablauf
      zugang={zugang}
      termin={termin}
      art={art}
      terminseite={`${pathname}${rest ? `?${rest}` : ''}`}
      terminliste={`${PLATTFORM_PFAD}/termine?${bereich ? `${bereich}&` : ''}gesendet=1`}
    />
  );
}

const FRAGEN: Record<Seite, string> = {
  ausfallhonorar: 'Ausfallhonorar',
  wann: 'Wann passt es Ihnen?',
  zusammenfassung: 'Ist alles richtig?',
};

/**
 * Der geführte Ablauf zu einem bestätigten künftigen Termin ohne offenen Wunsch; wo der Handoff mehr
 * zeigt, als 375 × 667 fasst, rollt der Inhalt, Frage und Fuß stehen (ANN-783).
 */
function Aenderungsablauf({
  zugang,
  termin,
  art,
  terminseite,
  terminliste,
}: {
  zugang: Plattformzugang;
  termin: Termin;
  art: Art;
  /** Die Seite des Termins: Ziel von ✕. */
  terminseite: string;
  /** Die Liste mit der Rückmeldung nach dem Senden. */
  terminliste: string;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [abfolge, setAbfolge] = useState(() => beginneAenderung(art));
  const [wann, setWann] = useState<Wann>(NICHTS_GEWAEHLT);
  const [notiz, setNotiz] = useState('');
  // Was auf dieser Seite noch fehlt oder nicht passt, als Satz über dem Knopf.
  const [hinweis, setHinweis] = useState<string | null>(null);
  // Einmal je Ablauf: Was die Zusammenfassung zeigt, geht so auch an den Server.
  const [werktage] = useState(() => naechsteWerktage(WUNSCHTAGE));
  const { seite } = abfolge;
  const spaet = termin.late_notice === true;
  const bereich = zugang.relationship_kind;

  const { freigeben, schutz } = useTextverlustschutz({
    ungespeichert: ungespeichert(abfolge, wann, notiz),
    kompakt: true,
    texte: WUNSCHSCHUTZ,
    ohneVerbindungImFuss: true,
    // Der Ablauf hängt an `?art=`: Auch der Weg zur Seite des Termins verlässt ihn.
    auchSuchparameter: true,
    // Die Zurückgeste des Telefons geht einen Schritt zurück, nicht aus dem Ablauf.
    schrittZurueck: kannZurueck(abfolge) ? () => zurueckGehen() : undefined,
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
      // Wunsch, und diese Seite zeigte sonst kurz die Seite des Termins.
      freigeben();
      void navigate(terminliste, { replace: true });
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

  function zurZusammenfassungGehen() {
    const fehlt = art === 'change' ? wannFehlt(wann) : null;
    if (fehlt) {
      setHinweis(fehlt);
      return;
    }
    gehe(zurZusammenfassung(abfolge));
  }

  function absenden() {
    // Die Seite davor lässt ohne Tag nicht weiter; geprüft wird trotzdem hier,
    // bevor etwas das Gerät verlässt.
    const fehlt = (art === 'change' ? wannFehlt(wann) : null) ?? notizFehler(notiz);
    if (fehlt) {
      setHinweis(fehlt);
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

  return (
    <GefuehrterAblauf
      titel={FRAGEN[seite]}
      objekt={terminKurz(termin)}
      schliessen="Abbrechen"
      onSchliessen={() => void navigate(terminseite)}
      seite={seite}
      stand={stand('aenderung', art, seite)}
      onZurueck={kannZurueck(abfolge) ? zurueckGehen : undefined}
      schutz={schutz}
      abschluss={seite === 'zusammenfassung'}
      balkenJeSchritt
      plattform
      schmal
      fuss={
        seite === 'zusammenfassung' ? (
          <>
            {fehlerzeile}
            <Sendefuss
              hinweis={
                art === 'cancel' ? (
                  <Absagehinweis spaet={spaet} />
                ) : (
                  <Freigabehinweis spaet={spaet} />
                )
              }
              knopf={art === 'cancel' ? 'Absage senden' : 'Änderungswunsch senden'}
              laeuft={senden.isPending}
              onSenden={absenden}
            />
          </>
        ) : (
          <>
            {fehlerzeile}
            <Button className="w-full" onClick={zurZusammenfassungGehen}>
              {seite === 'ausfallhonorar' ? 'Verstanden, weiter' : 'Weiter'}
            </Button>
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
        <div className="flex flex-col gap-5">
          <Zusammenfassungsanfang />
          <Terminliste>
            {art === 'cancel' ? (
              <Absagezeile termin={termin} bereich={bereich} />
            ) : (
              <>
                <Angabe
                  titel="Ihr Termin"
                  wert={`${tagInWorten(termin.starts_at)}, ${vonBis(termin)}`}
                  zusatz={artUndPerson(termin, bereich)}
                />
                <Wannangabe
                  titel="Lieber am"
                  wann={wann}
                  werktage={werktage}
                  onAendern={() => gehe(aendern(abfolge, 'wann'))}
                />
              </>
            )}
          </Terminliste>
          <Nachricht
            frage={
              art === 'cancel'
                ? 'Möchten Sie der Praxis etwas mitteilen?'
                : 'Was sollen wir noch wissen?'
            }
            alsTitel
            wert={notiz}
            onWert={setNotiz}
          />
        </div>
      )}
    </GefuehrterAblauf>
  );
}

/** Die Absage als Angabe: Kreis mit ×, „Termin absagen“, Tag und Zeit, darunter leise Art und Person. */
function Absagezeile({
  termin,
  bereich,
}: {
  termin: Termin;
  bereich: Plattformzugang['relationship_kind'];
}) {
  return (
    <li className="flex items-start gap-4 px-4 py-3.5 max-[23rem]:flex-col max-[23rem]:gap-2 max-[23rem]:px-3">
      <span
        aria-hidden="true"
        className="bg-danger-soft text-danger rounded-pill inline-flex size-10 shrink-0 items-center justify-center"
      >
        <svg
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.25}
          strokeLinecap="round"
          className="size-5"
        >
          <path d="M5 5l10 10M15 5L5 15" />
        </svg>
      </span>
      <span className="flex min-w-0 flex-col hyphens-manual">
        <span className="font-semibold">Termin absagen</span>
        <span>
          {tagInWorten(termin.starts_at)}, {vonBis(termin)}
        </span>
        <span className="text-ink-muted">{artUndPerson(termin, bereich)}</span>
      </span>
    </li>
  );
}

/**
 * Der Hinweis zum Ausfallhonorar als erste Seite der Absage, fester Wortlaut: rechtzeitig als Karte
 * mit Haken, unter 24 Stunden als Warnung, dann mit der ganzen Regel offen darunter. Die Frist steht
 * vor dem Knopf, nicht dahinter.
 */
function Ausfallhonorar({ spaet }: { spaet: boolean }) {
  return (
    <>
      {/* Der Fokus beginnt beim Hinweis: Vorlesesoftware liest ihn zuerst. */}
      <div tabIndex={-1} data-autofocus className="focus:outline-none">
        {spaet ? (
          <div
            role="alert"
            className="bg-warnung-soft text-warnung rounded-card flex items-start gap-4 p-5 max-[23rem]:flex-col max-[23rem]:gap-3 max-[23rem]:p-3"
          >
            <span
              aria-hidden="true"
              className="bg-warnung text-warnung-soft rounded-pill inline-flex size-10 shrink-0 items-center justify-center text-xl font-extrabold"
            >
              !
            </span>
            <p className="font-semibold">{AUSFALLHONORAR_SPAET}</p>
          </div>
        ) : (
          <div className="border-line bg-surface rounded-card flex items-start gap-4 border p-5 max-[23rem]:flex-col max-[23rem]:gap-3 max-[23rem]:p-3">
            <span
              aria-hidden="true"
              className="bg-accent-soft text-accent rounded-pill inline-flex size-10 shrink-0 items-center justify-center"
            >
              <HakenSymbol />
            </span>
            <p>{AUSFALLHONORAR_RECHTZEITIG}</p>
          </div>
        )}
      </div>
      <Disclosure summary="Unsere Regel zum Ausfallhonorar" offen={spaet}>
        <ul className="text-ink-muted flex list-disc flex-col gap-2 pl-5 text-sm">
          {AUSFALLHONORAR_REGEL.map((satz) => (
            <li key={satz}>{satz}</li>
          ))}
        </ul>
      </Disclosure>
    </>
  );
}

/**
 * Über „Absage senden“: unter 24 Stunden noch einmal die Warnung - die Frist steht vor dem Knopf, der
 * sendet -, dann der Satz zum Eingang der Absage (ANN-247).
 */
function Absagehinweis({ spaet }: { spaet: boolean }) {
  return (
    <>
      {spaet ? (
        <Statusmeldung ton="warnung" className="font-semibold">
          {AUSFALLHONORAR_SPAET}
        </Statusmeldung>
      ) : null}
      <p className="text-ink-muted">
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
