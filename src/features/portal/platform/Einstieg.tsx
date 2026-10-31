import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
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
import { Zwischentitel } from '@/components/ui/Zwischentitel';
import { EINGABETEXTE, useTextverlustschutz } from '@/app/Textverlustschutz';
import { ENDPUNKT_SCHLUESSEL, eigenerEndpunkt, pushErlauben, pushStand } from '@/lib/push';
import {
  befundbogenSchluessel,
  benachrichtigungSchluessel,
  checkinsSchluessel,
  einstiegSchluessel,
  einwilligungenSchluessel,
  plaeneSchluessel,
  einstiegBeenden,
  einwilligungSchreiben,
  ladeBefundbogen,
  ladeBenachrichtigungen,
  ladeCheckins,
  ladeEinwilligungen,
  ladePlaene,
  registriereGeraet,
  speichereBenachrichtigungen,
  type Benachrichtigungswahl,
  type Einstiegsstand,
  type Einwilligung,
  type Plattformzugang,
} from './api';
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
import { Vertretungsband } from './Vertretungsband';

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

export function Einstieg({
  zugang,
  praxis,
  email,
}: {
  zugang: Plattformzugang;
  praxis: string;
  /** Die Adresse des Kontos, an die Mitteilungen per E-Mail gehen. */
  email?: string | undefined;
}) {
  const begleitung = zugang.access_kind === 'companion';
  // Wie viele Fragen kommen, hängt an den offenen Einwilligungen (ANN-693):
  // erst laden, dann zählen. Lädt es nicht, entfällt die Seite - einwilligen
  // geht auch unter „Ich“, und der Einstieg versperrt nichts.
  const einwilligungen = useQuery({
    queryKey: einwilligungenSchluessel(zugang.access_id),
    queryFn: () => ladeEinwilligungen(zugang.access_id),
    enabled: !begleitung,
  });
  if (!begleitung && einwilligungen.isPending) return null;
  return (
    <Ablauf
      zugang={zugang}
      praxis={praxis}
      email={email}
      offen={begleitung ? [] : offeneEinwilligungen(einwilligungen.data ?? [])}
    />
  );
}

function Ablauf({
  zugang,
  praxis,
  email,
  offen,
}: {
  zugang: Plattformzugang;
  praxis: string;
  email: string | undefined;
  offen: Zweck[];
}) {
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
    queryFn: () => ladeBefundbogen(zugang.access_id),
    enabled: selbst && zugang.relationship_kind === 'treatment',
  });
  const checkins = useQuery({
    queryKey: checkinsSchluessel(zugang.access_id),
    queryFn: () => ladeCheckins(zugang.access_id),
    enabled: selbst,
  });
  const plaene = useQuery({
    queryKey: plaeneSchluessel(zugang.access_id),
    queryFn: () => ladePlaene(zugang.access_id),
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

  // Steht der Einstieg noch da? Nach einer Zurückgeste während des Beendens nicht.
  const steht = useRef(true);
  useEffect(() => {
    steht.current = true;
    return () => {
      steht.current = false;
    };
  }, []);
  const beenden = useMutation({
    // `ziel`: die Handlung der künftigen Hauptsache, sonst die Übersicht.
    mutationFn: (_ziel: string | null) => einstiegBeenden(zugang.access_id),
    // Am Hook, nicht am Aufruf: Der Stand gilt auch, wenn die Person während
    // der Anfrage schon woandershin gegangen ist.
    onSuccess: (_daten, ziel) => {
      // Erst dorthin, dann beendet - sonst stünde die Übersicht einen
      // Augenblick da und nähme den Markenmoment mit.
      if (ziel !== null && steht.current) void navigate(ziel, { flushSync: true });
      // Beendet ist beendet: Der Stand gilt sofort, bevor der Server ihn noch
      // einmal sagt - sonst stünde der Einstieg kurz wieder da.
      queryClient.setQueryData<Einstiegsstand | null>(
        einstiegSchluessel(zugang.access_id),
        (alt) => (alt ? { ...alt, pending: false } : alt),
      );
      void queryClient.invalidateQueries({ queryKey: einstiegSchluessel(zugang.access_id) });
    },
  });
  const spaeter = () => {
    if (!beenden.isPending) beenden.mutate(null);
  };
  const beginnen = (ziel: string) => {
    if (beenden.isPending) return;
    const bereich = bereichParameter(suche);
    beenden.mutate(`${ziel}${bereich ? `?${bereich}` : ''}`);
  };

  // BEF-175: Die Zurückgeste des Telefons geht einen Schritt zurück wie
  // „← Zurück“, statt den Einstieg zu verlassen. Ungespeichertes gibt es hier
  // nicht - jede Wahl gilt sofort.
  const { schutz } = useTextverlustschutz({
    ungespeichert: false,
    texte: EINGABETEXTE,
    kompakt: true,
    schrittZurueck: nummer > 0 ? () => setNummer(nummer - 1) : undefined,
  });

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
      schutz={schutz}
      // „Sie handeln für …“ wie im Gerüst, unter dem Fortschritt (5.3): eine
      // Leiste über die ganze Breite, der Text an der Kante der Spalte.
      band={
        vertretung ? (
          <Vertretungsband
            zugang={zugang}
            innen="max-w-formular mx-auto box-content px-5 max-[23rem]:px-3"
          />
        ) : undefined
      }
      spaeter
      balkenJeSchritt
      plattform
      titelStufe={seite === 'willkommen' || seite === 'bereit' ? 'gruss' : 'seite'}
      abschluss={seite === 'bereit'}
      // Ohne Auswahl bleibt „Weiter“ auch bei „Sehr groß“ fest unten (ANN-819).
      fussFest={seite === 'willkommen' || seite === 'bereit'}
      vorDemTitel={
        <>
          {seite === 'willkommen' && eingerichtet && ersterBlick ? (
            <Rueckmeldung imFenster>Anmeldung eingerichtet</Rueckmeldung>
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
          <p className="text-ink max-w-prose">
            <MitNamen
              satz={freiwilligkeit(fragen.length, zugang)}
              namen={[zugang.represented_name]}
            />
          </p>
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
      {seite === 'mitteilungen' ? <Mitteilungen zugang={zugang} email={email} /> : null}
      {seite === 'bereit' ? (
        <p className="text-ink max-w-prose">
          <MitNamen satz={bereitSatz(zugang, aufgabe)} namen={[zugang.represented_name]} />
        </p>
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
  const namen = [praxis, zugang.represented_name];
  return (
    <>
      <p className="text-ink max-w-prose">
        <MitNamen satz={willkommenssatz(zugang, praxis)} namen={namen} />
      </p>
      <p className="text-ink-muted max-w-prose">
        <MitNamen
          satz={
            zugang.access_kind === 'companion'
              ? `Einwilligungen gibt nur ${vertretenePerson(zugang)} selbst. ${nochFragen(fragen)}`
              : nochFragen(fragen)
          }
          namen={namen}
        />
      </p>
    </>
  );
}

/**
 * Eine E-Mail-Adresse, die nach „@“ und vor einem Punkt umbricht, nicht
 * mitten im Wort („@patie-nt“) und ohne Trennstrich. Nur ein Teil, der allein
 * nicht in die Zeile passt, bricht, wo er muss.
 */
function Adresse({ adresse }: { adresse: string }) {
  // Teile ohne Lookbehind: Ältere Safari (vor iOS 16.4) laden ein Modul damit nicht.
  const teile: string[] = [];
  let teil = '';
  for (const zeichen of adresse) {
    if (zeichen === '.' && teil) {
      teile.push(teil);
      teil = '';
    }
    teil += zeichen;
    if (zeichen === '@') {
      teile.push(teil);
      teil = '';
    }
  }
  if (teil) teile.push(teil);
  return (
    <span className="wrap-break-word hyphens-manual">
      {teile.map((teil, index) => (
        <Fragment key={index}>
          {index > 0 ? <wbr /> : null}
          {teil}
        </Fragment>
      ))}
    </span>
  );
}

/**
 * Ein Satz mit Namen: Namen trennt der Browser nie (DR-114) - im Fließtext
 * sonst schon ab zwölf Buchstaben („Mustermann-Langen-scheidt“). Am Bindestrich
 * darf der Name weiter umbrechen.
 */
function MitNamen({ satz, namen }: { satz: string; namen: readonly (string | null)[] }) {
  const gesucht = namen.filter((name): name is string => Boolean(name));
  const teile: ReactNode[] = [];
  let rest = satz;
  for (;;) {
    // Der früheste Name zuerst; an derselben Stelle der längere.
    const treffer = gesucht
      .map((name) => ({ name, stelle: rest.indexOf(name) }))
      .filter((t) => t.stelle >= 0)
      .sort((a, b) => a.stelle - b.stelle || b.name.length - a.name.length)[0];
    if (!treffer) break;
    if (treffer.stelle > 0) teile.push(rest.slice(0, treffer.stelle));
    teile.push(
      <span key={teile.length} className="hyphens-manual">
        {treffer.name}
      </span>,
    );
    rest = rest.slice(treffer.stelle + treffer.name.length);
  }
  if (rest) teile.push(rest);
  return teile;
}

/**
 * Eine Einwilligung als Frage (5.3): Titel, Text unverändert aus
 * `einwilligungstexte.ts`, darunter „Ja, erlauben“ und „Nein“ gleich gewichtet
 * und nichts vorgewählt. Die Wahl gilt sofort, wie bisher der Knopf: Ein Ja
 * erteilt mit der Fassung des Texts, ein Nein danach widerruft es wieder. Ein
 * Nein zu einer offenen Einwilligung lässt sie offen - gespeichert wird es
 * nicht (ANN-693). Gewählt wird nur mit Tippen, Enter oder Leertaste, nie mit
 * den Pfeiltasten (`Wahlreihe sofort`).
 *
 * Die letzte Wahl gilt: Wer während des Speicherns umentscheidet, wird danach
 * gespeichert, nicht verworfen. Je Zweck läuft eine Anfrage nach der anderen
 * (`scope`) - auch, was ohne Netz wartet und danach weiterläuft, und auch über
 * „Weiter“ und „← Zurück“ hinweg. Scheitert die letzte, zeigt die Karte den
 * Stand des Servers, nicht die Wahl.
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
  const queryClient = useQueryClient();
  const text = EINWILLIGUNGSTEXTE[zweck];
  const liste = einwilligungenSchluessel(zugang.access_id);
  const schluessel = ['einwilligung-schreiben', zugang.access_id, zweck];
  const schreiben = useMutation({
    mutationKey: schluessel,
    scope: { id: schluessel.join(':') },
    mutationFn: (erteilen: boolean) =>
      einwilligungSchreiben({
        zugangId: zugang.access_id,
        zweck,
        erteilen,
        fassung: EINWILLIGUNGSFASSUNG,
      }),
    // Am Hook, nicht am Aufruf: Das läuft auch, wenn die Karte schon weg ist.
    onSettled: async (_daten, fehler) => {
      // Noch eine Wahl danach? Dann zählt deren Ausgang.
      const letzte = queryClient.isMutating({ mutationKey: schluessel }) <= 1;
      if (!fehler || !letzte) {
        void queryClient.invalidateQueries({ queryKey: liste });
        return;
      }
      await queryClient.invalidateQueries({ queryKey: liste });
      const stand = queryClient
        .getQueryData<Einwilligung[]>(liste)
        ?.find((e) => e.purpose === zweck)?.state;
      onWahl(stand === 'granted' ? 'ja' : undefined);
    },
  });

  const waehlen = (neu: JaNein) => {
    if (neu === wahl) return;
    onWahl(neu);
    if (neu === 'ja' || wahl === 'ja') schreiben.mutate(neu === 'ja');
  };

  return (
    // Eine Karte mit Linie, ohne Schatten; die Wahl darin ist die benannte Gruppe.
    <div className="border-line rounded-card flex flex-col border p-5">
      <Zwischentitel stufe="abschnitt">{text.titel}</Zwischentitel>
      <p className="text-ink max-w-prose">{text.text}</p>
      <div className="mt-3">
        <Wahlreihe
          legende={text.titel}
          legendeSichtbar={false}
          wahlen={JA_NEIN}
          gewaehlt={wahl ?? null}
          onWaehlen={waehlen}
          gleichgewichtet
          sofort
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
    </div>
  );
}

/**
 * „Sollen wir Ihnen Bescheid geben?“ (5.3): ein Schalter statt der Liste je Art
 * mit Ruhezeit - die bleibt unter „Ich“ → „Einstellungen“ (DR-111). An schaltet
 * die Arten aus `MITTEILUNGSARTEN` ein (ANN-694): auf diesem Telefon per Push,
 * nach der einen Abfrage des Telefons; wo Push hier nicht geht, per E-Mail an
 * die Adresse des Kontos, dem Regelweg (ADR-024 Punkt 11). Aus nimmt dieselben
 * Arten wieder heraus. Die Wahl gilt für den eigenen Zugang, auch einer
 * Begleitung (Punkt 15) - das Telefon bleibt für andere Zugänge eingetragen;
 * herausnehmen lässt es sich unter „Ich“.
 */
function Mitteilungen({ zugang, email }: { zugang: Plattformzugang; email: string | undefined }) {
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
    queryFn: () => ladeBenachrichtigungen(zugang.access_id, geraet),
    enabled: !endpunkt.isPending,
    retry: false,
    // Wechselt das Gerät (das erste An), bleibt der Schalter stehen, bis der
    // neue Stand da ist - sonst nähme das Skelett ihm den Fokus.
    placeholderData: (vorher) => vorher,
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
        await speichereBenachrichtigungen(zugang.access_id, {
          ...bisher,
          email_kinds: mitArten(stand.email_kinds, arten, einschalten),
        });
        return;
      }
      if (!einschalten) {
        // Nur dieser Zugang: Die Arten gehen heraus, das Telefon bleibt für
        // andere Zugänge eingetragen.
        await speichereBenachrichtigungen(zugang.access_id, {
          ...bisher,
          push_kinds: mitArten(stand.push_kinds, arten, false),
        });
        return;
      }
      if (geraet === null || !stand.device_registered) {
        await registriereGeraet([zugang.access_id], await pushErlauben());
      }
      await speichereBenachrichtigungen(zugang.access_id, {
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
        <MitNamen
          satz={
            vertretung
              ? `Zum Beispiel am Vortag eines Termins von ${vertretenePerson(zugang)} oder wenn die Praxis antwortet.`
              : 'Zum Beispiel am Vortag eines Termins oder wenn die Praxis antwortet.'
          }
          namen={[zugang.represented_name]}
        />
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
              weg === 'push' ? (
                `${rechner ? 'Ihr Browser' : 'Ihr Telefon'} fragt einmal um Erlaubnis.`
              ) : email ? (
                <>
                  An <Adresse adresse={email} />
                </>
              ) : (
                'An die Adresse Ihres Kontos.'
              )
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
 * Das Bild über „Willkommen“ (5.3), bis zum eigenen Foto die Markenfläche: Schmuck in 4:3 im Platz
 * neben den Sätzen, höchstens 18rem. Unter 6rem entfällt es, ebenso unter 23rem und bei „Sehr
 * groß“, wo es die Sätze aus dem ersten Bild drängte (ANN-682, ANN-816).
 */
function Willkommensbild() {
  return (
    <div
      aria-hidden="true"
      data-willkommensbild=""
      className="[container-type:size] aspect-[4/3] max-h-72 min-h-0 w-full shrink max-[23rem]:hidden [[data-schrift=sehr-gross]_&]:hidden"
    >
      <div className="bg-surface-inverse rounded-image relative aspect-[4/3] w-[min(100cqw,calc(100cqh*4/3))] overflow-hidden [@container_(max-height:6rem)]:hidden">
        <Laufrad className="text-accent absolute -right-[14%] -bottom-[25%] aspect-square h-[115%]" />
      </div>
    </div>
  );
}
