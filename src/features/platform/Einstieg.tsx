import { useEffect, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { MARKE } from '@/app/tabtitel';
import { Button } from '@/components/ui/Button';
import { GefuehrterAblauf } from '@/components/ui/GefuehrterAblauf';
import { HakenSymbol } from '@/components/ui/HakenSymbol';
import { Kleingedrucktes } from '@/components/ui/Kleingedrucktes';
import { Laufrad } from '@/components/ui/Laufrad';
import { Rueckmeldung } from '@/components/ui/Rueckmeldung';
import { Schalter } from '@/components/ui/Schalter';
import { Skelett, SkelettBereich } from '@/components/ui/Skelett';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Wahlreihe } from '@/components/ui/Wahlreihe';
import {
  ENDPUNKT_SCHLUESSEL,
  eigenerEndpunkt,
  pushAbmelden,
  pushErlauben,
  pushStand,
} from '@/lib/push';
import { VERTRETUNGSART } from '@/lib/vertretung';
import {
  befundbogenSchluessel,
  benachrichtigungSchluessel,
  checkinsSchluessel,
  einstiegSchluessel,
  einwilligungenSchluessel,
  plaeneSchluessel,
  type Benachrichtigungswahl,
  type Einstiegsstand,
  type Einwilligung,
  type Plattformzugang,
} from './api';
import { usePlattformApi } from './einsicht';
import { useEinmaligeRueckmeldung } from './einmaligeRueckmeldung';
import {
  bereitSatz,
  einstiegsseiten,
  einwilligungstitel,
  freiwilligkeit,
  mitArten,
  mitteilungenAn,
  mitteilungsarten,
  nochFragen,
  offeneEinwilligungen,
  vertretenePerson,
  willkommenssatz,
  willkommenstitel,
  type Einstiegsseite,
} from './einstiegsablauf';
import { EINWILLIGUNGSFASSUNG, EINWILLIGUNGSTEXTE, FREIWILLIG } from './einwilligungstexte';
import { useRechner } from './geruestbreite';
import { ersteAufgabe, handlung, type Aufgabe } from './hauptsache';
import { fuerDiePlattform } from './instrumentwahl';
import { bereichParameter } from './pfade';

/**
 * Der Einstieg nach der ersten Anmeldung (POR-019, DSN-001 4.3,
 * IDEA-LZK-005): Willkommen, Einwilligungen, Benachrichtigungen, fertig.
 *
 * Seit DRP-EPIC-005 (Handoff 2026-10-22, Abschnitt 5.3) ein geführter Ablauf
 * im Fenster, ohne Reiterleiste: oben „← Zurück“ und „Später“, darunter ein
 * Balken je Schritt, eine Frage je Seite und ein Hauptknopf im festen Fuß -
 * keine zweite Knopfebene (DR-109, DR-110). „Später“ beendet den Einstieg wie
 * bisher (DSN-001 Abschnitt 7 Punkt 7); keine Einwilligung ist nötig, um
 * weiterzukommen.
 *
 * Die Praxis kann den Einstieg für die Person überspringen; dann erscheint
 * er nicht. Benachrichtigungen schaltet die Person hier oder später unter
 * „Ich" ein (KOM-011, ADR-024 Punkt 15) - auch eine Begleitung, für ihren
 * eigenen Zugang.
 */

/** Der Tab während des Einstiegs (DR-115): fest, nie mit dem Namen. */
const TABTITEL = `Willkommen – ${MARKE}`;

const TITEL: Record<Exclude<Einstiegsseite, 'willkommen' | 'einwilligungen'>, string> = {
  mitteilungen: 'Sollen wir Ihnen Bescheid geben?',
  bereit: 'Alles bereit',
};

type Zweck = Einwilligung['purpose'];
type JaNein = 'ja' | 'nein';

const JA_NEIN = [
  { wert: 'ja', text: 'Ja, erlauben' },
  { wert: 'nein', text: 'Nein' },
] as const;

export function Einstieg({ zugang, praxis }: { zugang: Plattformzugang; praxis: string }) {
  const api = usePlattformApi();
  const begleitung = zugang.access_kind === 'companion';
  // Wie viele Fragen kommen, hängt an den offenen Einwilligungen (ANN-693):
  // erst laden, dann zählen. Lädt es nicht, entfällt die Seite - einwilligen
  // geht auch unter „Ich“, und der Einstieg versperrt nichts.
  const einwilligungen = useQuery({
    queryKey: einwilligungenSchluessel(zugang.access_id),
    queryFn: () => api.ladeEinwilligungen(zugang.access_id),
    enabled: !begleitung,
  });
  if (!begleitung && einwilligungen.isPending) return null;
  return (
    <Ablauf
      zugang={zugang}
      praxis={praxis}
      offen={begleitung ? [] : offeneEinwilligungen(einwilligungen.data ?? [])}
    />
  );
}

function Ablauf({
  zugang,
  praxis,
  offen,
}: {
  zugang: Plattformzugang;
  praxis: string;
  offen: Zweck[];
}) {
  const api = usePlattformApi();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [suche] = useSearchParams();
  // Die Fragen stehen fest, sobald der Einstieg beginnt: Ein Ja macht aus der
  // offenen eine erteilte Einwilligung - die Karte bleibt trotzdem stehen.
  const [fragen] = useState(offen);
  // Die Wahl je Zweck überdauert „Zurück“ und „Weiter“; ein Nein bleibt nur hier.
  const [wahlen, setWahlen] = useState<Partial<Record<Zweck, JaNein>>>({});
  const seiten = einstiegsseiten(zugang, fragen.length);
  // „Alles bereit“ ist das Ende, kein Schritt.
  const schritte = seiten.length - 1;
  const [nummer, setNummer] = useState(0);
  const seite = seiten[nummer] ?? 'bereit';
  const vertretung = zugang.access_kind !== 'self';

  // Einmal nach der Einrichtung (1c: `?eingerichtet=1`), nur bis zur nächsten
  // Seite - die Einrichtung hat keine eigene Fertig-Seite (ANN-695).
  const eingerichtet = useEinmaligeRueckmeldung('eingerichtet') === '1';
  const [ersterBlick, setErsterBlick] = useState(true);

  // Was „Alles bereit“ als erste Aufgabe nennt (ANN-692) - nur der Person
  // selbst. Geladen wird gleich zu Beginn; bis zur letzten Seite steht es.
  const selbst = zugang.access_kind === 'self';
  const boegen = useQuery({
    queryKey: befundbogenSchluessel(zugang.access_id),
    queryFn: () => api.ladeBefundbogen(zugang.access_id),
    enabled: selbst && zugang.relationship_kind === 'treatment',
  });
  const checkins = useQuery({
    queryKey: checkinsSchluessel(zugang.access_id),
    queryFn: () => api.ladeCheckins(zugang.access_id),
    enabled: selbst,
  });
  const plaene = useQuery({
    queryKey: plaeneSchluessel(zugang.access_id),
    queryFn: () => api.ladePlaene(zugang.access_id),
    enabled: selbst,
  });
  const [aufgabe, setAufgabe] = useState<Aufgabe | null>(null);
  /** Die Aufgabe beim Betreten von „Alles bereit“; lädt noch etwas, keine. */
  const aufgabeJetzt = (): Aufgabe | null => {
    const laedt = [boegen, checkins, plaene].some((a) => a.fetchStatus === 'fetching' && !a.data);
    if (!selbst || laedt) return null;
    return ersteAufgabe({
      zugang,
      bogenId: fuerDiePlattform()[0]?.meta.id,
      boegen: boegen.data,
      checkins: checkins.data,
      plaene: plaene.data,
    });
  };

  const beenden = useMutation({ mutationFn: () => api.einstiegBeenden(zugang.access_id) });
  // Beendet ist beendet: Der Stand gilt sofort, bevor der Server ihn noch
  // einmal sagt - sonst stünde der Einstieg kurz wieder da.
  const beendet = () => {
    queryClient.setQueryData<Einstiegsstand | null>(einstiegSchluessel(zugang.access_id), (alt) =>
      alt ? { ...alt, pending: false } : alt,
    );
    void queryClient.invalidateQueries({ queryKey: einstiegSchluessel(zugang.access_id) });
  };
  const spaeter = () => {
    if (!beenden.isPending) beenden.mutate(undefined, { onSuccess: beendet });
  };
  // Die Handlung der künftigen Hauptsache: erst beenden, dann direkt dorthin -
  // ohne Umweg über die Übersicht.
  const beginnen = (ziel: string) => {
    if (beenden.isPending) return;
    const bereich = bereichParameter(suche);
    beenden.mutate(undefined, {
      onSuccess: () => {
        void navigate(`${ziel}${bereich ? `?${bereich}` : ''}`);
        beendet();
      },
    });
  };

  useEffect(() => {
    const vorher = document.title;
    document.title = TABTITEL;
    return () => {
      document.title = vorher;
    };
  }, []);

  const weiter = () => {
    setErsterBlick(false);
    if (seiten[nummer + 1] === 'bereit') setAufgabe(aufgabeJetzt());
    setNummer((n) => Math.min(n + 1, seiten.length - 1));
  };
  const naechste = seite === 'bereit' && aufgabe ? handlung(aufgabe) : null;

  const titel =
    seite === 'willkommen'
      ? willkommenstitel(zugang)
      : seite === 'einwilligungen'
        ? einwilligungstitel(fragen.length, zugang)
        : TITEL[seite];
  const fehler = beenden.error ? (
    <Statusmeldung ton="fehler" className="mb-3">
      {beenden.error.message}
    </Statusmeldung>
  ) : null;

  return (
    <GefuehrterAblauf
      titel={titel}
      schliessen="Später"
      onSchliessen={spaeter}
      seite={seite}
      stand={
        seite === 'bereit'
          ? undefined
          : { text: `Schritt ${nummer + 1} von ${schritte}`, wert: nummer + 1, von: schritte }
      }
      onZurueck={nummer > 0 ? () => setNummer(nummer - 1) : undefined}
      spaeter
      balkenJeSchritt
      plattformSchmal
      titelStufe={seite === 'willkommen' || seite === 'bereit' ? 'gruss' : 'seite'}
      abschluss={seite === 'bereit'}
      vorDemTitel={
        <>
          {/* „Sie handeln für …“ wie im Gerüst, unter dem Fortschritt (5.3). */}
          {vertretung ? <Vertretungsband zugang={zugang} /> : null}
          {seite === 'willkommen' && eingerichtet && ersterBlick ? (
            <Rueckmeldung>Anmeldung eingerichtet</Rueckmeldung>
          ) : null}
          {seite === 'willkommen' ? <Willkommensbild /> : null}
          {seite === 'bereit' ? (
            <span
              aria-hidden="true"
              className="bg-surface-inverse text-surface rounded-pill flex size-24 shrink-0 items-center justify-center"
            >
              <HakenSymbol className="size-12" />
            </span>
          ) : null}
        </>
      }
      fuss={
        <>
          {fehler}
          {naechste ? (
            // Ein Hauptknopf, darunter leise der Weg zur Übersicht (5.3).
            <div className="flex flex-col gap-2">
              <Button
                type="button"
                className="w-full"
                data-autofocus
                onClick={() => beginnen(naechste.pfad)}
                disabled={beenden.isPending}
              >
                {beenden.isPending ? 'Einen Moment …' : naechste.text}
              </Button>
              <Button
                type="button"
                variant="quiet"
                className="w-full"
                onClick={spaeter}
                disabled={beenden.isPending}
              >
                Zur Übersicht
              </Button>
            </div>
          ) : seite === 'bereit' ? (
            <Button
              type="button"
              className="w-full"
              data-autofocus
              onClick={spaeter}
              disabled={beenden.isPending}
            >
              {beenden.isPending ? 'Einen Moment …' : 'Zur Übersicht'}
            </Button>
          ) : (
            <Button type="button" className="w-full" data-autofocus onClick={weiter}>
              Weiter
            </Button>
          )}
        </>
      }
    >
      {seite === 'willkommen' ? (
        <Willkommen zugang={zugang} praxis={praxis} fragen={schritte - 1} />
      ) : null}
      {seite === 'einwilligungen' ? (
        <>
          <p className="text-ink max-w-prose">{freiwilligkeit(fragen.length, zugang)}</p>
          {fragen.map((zweck) => (
            <Einwilligungsfrage
              key={zweck}
              zugang={zugang}
              zweck={zweck}
              wahl={wahlen[zweck]}
              onWahl={(wahl) => setWahlen((bisher) => ({ ...bisher, [zweck]: wahl }))}
            />
          ))}
          <Kleingedrucktes>{FREIWILLIG}</Kleingedrucktes>
        </>
      ) : null}
      {seite === 'mitteilungen' ? <Mitteilungen zugang={zugang} /> : null}
      {seite === 'bereit' ? (
        <p className="text-ink max-w-prose">{bereitSatz(zugang, aufgabe)}</p>
      ) : null}
    </GefuehrterAblauf>
  );
}

/**
 * „Willkommen“ (1 von 3, für eine Begleitung 1 von 2): wofür die Plattform da
 * ist und wie viel noch kommt. Was wo liegt, sagt das Gerüst selbst - die
 * Sätze „Unten finden Sie …“ und „Dieser Zugang gilt für …“ entfallen
 * (DR-108).
 */
function Willkommen({
  zugang,
  praxis,
  fragen,
}: {
  zugang: Plattformzugang;
  praxis: string;
  fragen: number;
}) {
  return (
    <>
      <p className="text-ink max-w-prose">{willkommenssatz(zugang, praxis)}</p>
      <p className="text-ink-muted max-w-prose">
        {zugang.access_kind === 'companion'
          ? `Einwilligungen gibt nur ${vertretenePerson(zugang)} selbst. ${nochFragen(fragen)}`
          : nochFragen(fragen)}
      </p>
    </>
  );
}

/**
 * Eine Einwilligung als Frage (5.3): Titel, Text unverändert aus
 * `einwilligungstexte.ts`, darunter „Ja, erlauben“ und „Nein“ gleich gewichtet
 * und nichts vorgewählt. Die Wahl gilt sofort, wie bisher der Knopf: Ein Ja
 * erteilt mit der Fassung des Texts, ein Nein danach widerruft es wieder. Ein
 * Nein zu einer offenen Einwilligung lässt sie offen - gespeichert wird es
 * nicht (ANN-693). Scheitert das Speichern, steht die Wahl wieder, wie sie war -
 * auch wenn die Person schon weitergetippt hat; deshalb am Hook, nicht am Aufruf.
 */
function Einwilligungsfrage({
  zugang,
  zweck,
  wahl,
  onWahl,
}: {
  zugang: Plattformzugang;
  zweck: Zweck;
  wahl: JaNein | undefined;
  onWahl: (wahl: JaNein | undefined) => void;
}) {
  const api = usePlattformApi();
  const queryClient = useQueryClient();
  const text = EINWILLIGUNGSTEXTE[zweck];
  const schreiben = useMutation({
    mutationFn: ({ erteilen }: { erteilen: boolean; vorher: JaNein | undefined }) =>
      api.einwilligungSchreiben({
        zugangId: zugang.access_id,
        zweck,
        erteilen,
        fassung: EINWILLIGUNGSFASSUNG,
      }),
    onError: (_fehler, { vorher }) => onWahl(vorher),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: einwilligungenSchluessel(zugang.access_id) }),
  });

  const waehlen = (neu: JaNein) => {
    if (schreiben.isPending || neu === wahl) return;
    onWahl(neu);
    if (neu === 'ja' || wahl === 'ja') schreiben.mutate({ erteilen: neu === 'ja', vorher: wahl });
  };

  return (
    // Eine Karte mit Linie, ohne Schatten; die Wahl darin ist die benannte Gruppe.
    <div className="border-line rounded-card flex flex-col gap-3 border p-5">
      <h3 className="text-ink text-abschnitt">{text.titel}</h3>
      <p className="text-ink max-w-prose">{text.text}</p>
      <Wahlreihe
        legende={text.titel}
        legendeSichtbar={false}
        wahlen={JA_NEIN}
        gewaehlt={wahl ?? null}
        onWaehlen={waehlen}
        gleichgewichtet
        zusatz={
          schreiben.isPending ? (
            <Statusmeldung>Wird gespeichert …</Statusmeldung>
          ) : schreiben.isError ? (
            <Statusmeldung ton="fehler">{schreiben.error.message}</Statusmeldung>
          ) : schreiben.isSuccess ? (
            <Statusmeldung ton="erfolg">Gespeichert.</Statusmeldung>
          ) : null
        }
      />
    </div>
  );
}

/**
 * „Sollen wir Ihnen Bescheid geben?“ (5.3): ein Schalter statt der Liste je Art
 * mit Ruhezeit - die bleibt unter „Ich“ → „Einstellungen“ (DR-111). An schaltet
 * die Arten aus `MITTEILUNGSARTEN` ein (ANN-694): auf diesem Telefon per Push,
 * nach der einen Abfrage des Telefons; wo Push hier nicht geht, per E-Mail, dem
 * Regelweg (ADR-024 Punkt 11). Aus nimmt das Telefon wieder heraus bzw. die
 * Arten aus der Mail. Die Wahl gilt für den eigenen Zugang, auch einer
 * Begleitung (Punkt 15).
 */
function Mitteilungen({ zugang }: { zugang: Plattformzugang }) {
  const api = usePlattformApi();
  const queryClient = useQueryClient();
  const rechner = useRechner();
  const endpunkt = useQuery({
    queryKey: ENDPUNKT_SCHLUESSEL,
    queryFn: eigenerEndpunkt,
    retry: false,
  });
  const geraet = endpunkt.data ?? null;
  const wahl = useQuery({
    queryKey: benachrichtigungSchluessel(zugang.access_id, geraet),
    queryFn: () => api.ladeBenachrichtigungen(zugang.access_id, geraet),
    enabled: !endpunkt.isPending,
    retry: false,
  });
  const weg = pushStand().moeglich || geraet !== null ? 'push' : 'email';
  const daten = wahl.data ?? null;
  const arten = mitteilungsarten(daten?.disabled_kinds ?? []);
  const an =
    daten !== null &&
    (weg === 'push'
      ? geraet !== null && daten.device_registered && mitteilungenAn(daten.push_kinds, arten)
      : mitteilungenAn(daten.email_kinds, arten));

  const umschalten = useMutation({
    mutationFn: async ({
      einschalten,
      stand,
    }: {
      einschalten: boolean;
      stand: Benachrichtigungswahl;
    }) => {
      const bisher = {
        email_kinds: stand.email_kinds,
        push_kinds: stand.push_kinds,
        quiet_from: stand.quiet_from,
        quiet_until: stand.quiet_until,
      };
      if (weg === 'email') {
        await api.speichereBenachrichtigungen(zugang.access_id, {
          ...bisher,
          email_kinds: mitArten(stand.email_kinds, arten, einschalten),
        });
        return;
      }
      if (!einschalten) {
        // Wie „Auf diesem Gerät ausschalten“ unter „Ich“: Das Telefon geht
        // heraus; die Wahl je Art bleibt für andere Geräte des Zugangs.
        if (geraet !== null) await api.entferneGeraet(geraet);
        await pushAbmelden();
        return;
      }
      if (geraet === null || !stand.device_registered) {
        await api.registriereGeraet([zugang.access_id], await pushErlauben());
      }
      await api.speichereBenachrichtigungen(zugang.access_id, {
        ...bisher,
        push_kinds: mitArten(stand.push_kinds, arten, true),
      });
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ENDPUNKT_SCHLUESSEL });
      await queryClient.invalidateQueries({ queryKey: ['platform-notifications'] });
    },
  });

  const vertretung = zugang.access_kind !== 'self';
  const telefon = rechner ? 'Gerät' : 'Telefon';
  return (
    <>
      <p className="text-ink max-w-prose">
        {vertretung
          ? `Zum Beispiel am Vortag eines Termins von ${vertretenePerson(zugang)} oder wenn die Praxis antwortet.`
          : 'Zum Beispiel am Vortag eines Termins oder wenn die Praxis antwortet.'}
      </p>
      {endpunkt.isPending || wahl.isPending ? (
        <SkelettBereich beschriftung="Mitteilungen werden geladen">
          <Skelett form="karte" />
        </SkelettBereich>
      ) : daten === null ? (
        <Statusmeldung ton="fehler">
          Ihre Mitteilungen lassen sich gerade nicht laden. Unter „Ich“ → „Einstellungen“ geht es
          auch später.
        </Statusmeldung>
      ) : (
        <div className="flex flex-col gap-2">
          <Schalter
            beschriftung={
              weg === 'push' ? (
                `Mitteilungen auf diesem ${telefon}`
              ) : (
                <>
                  Mitteilungen per <span className="whitespace-nowrap">E-Mail</span>
                </>
              )
            }
            hinweis={
              weg === 'push'
                ? `${rechner ? 'Ihr Browser' : 'Ihr Telefon'} fragt einmal um Erlaubnis.`
                : 'An die Adresse, mit der Sie sich anmelden.'
            }
            an={an}
            laeuft={umschalten.isPending}
            onUmschalten={(einschalten) => umschalten.mutate({ einschalten, stand: daten })}
          />
          {umschalten.isError ? (
            <Statusmeldung ton="fehler">{umschalten.error.message}</Statusmeldung>
          ) : null}
        </div>
      )}
      <p className="text-ink-muted max-w-prose">
        {vertretung
          ? 'Die Mitteilungen gelten für Ihren Zugang. Feinheiten stellen Sie später unter „Ich“ ein.'
          : weg === 'push'
            ? 'Welche Mitteilungen und ob auch per E-Mail, stellen Sie später unter „Ich“ ein.'
            : 'Welche Mitteilungen, stellen Sie später unter „Ich“ ein.'}
      </p>
    </>
  );
}

/**
 * Das Bild über „Willkommen“ (5.3): ein eigenes Foto der Praxis in 4:3 - bis
 * es da ist, die Markenfläche mit dem Laufrad. Schmuck ohne Information, für
 * Vorlesesoftware unsichtbar; unter 23rem (200 %) entfällt es (ANN-682). Am
 * Rechner höchstens 18rem hoch, damit der Text ohne Rollen darunter passt.
 */
function Willkommensbild() {
  return (
    <div
      aria-hidden="true"
      data-willkommensbild=""
      className="bg-surface-inverse rounded-image relative aspect-[4/3] max-h-72 w-full overflow-hidden max-[23rem]:hidden"
    >
      <Laufrad className="text-accent absolute -right-12 -bottom-16 size-72" />
    </div>
  );
}

/** „Sie handeln für …“ - wie das Band im Gerüst (`HandelnFuer`, ADR-023 Punkt 14). */
function Vertretungsband({ zugang }: { zugang: Plattformzugang }): ReactNode {
  if (zugang.access_kind === 'self') return null;
  return (
    <p role="status" className="bg-accent text-surface rounded-card px-4 py-2">
      Sie handeln für <strong>{zugang.represented_name ?? 'eine andere Person'}</strong>
      <span className="opacity-90"> · {VERTRETUNGSART[zugang.access_kind]}</span>
    </p>
  );
}
