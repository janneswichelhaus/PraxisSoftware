import { useEffect, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MARKE } from '@/app/tabtitel';
import { Button } from '@/components/ui/Button';
import { GefuehrterAblauf } from '@/components/ui/GefuehrterAblauf';
import { Kleingedrucktes } from '@/components/ui/Kleingedrucktes';
import { Laufrad } from '@/components/ui/Laufrad';
import { Rueckmeldung } from '@/components/ui/Rueckmeldung';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Wahlreihe } from '@/components/ui/Wahlreihe';
import { VERTRETUNGSART } from '@/lib/vertretung';
import {
  einstiegSchluessel,
  einwilligungenSchluessel,
  type Einwilligung,
  type Plattformzugang,
} from './api';
import { usePlattformApi } from './einsicht';
import { useEinmaligeRueckmeldung } from './einmaligeRueckmeldung';
import {
  einstiegsseiten,
  einwilligungstitel,
  freiwilligkeit,
  nochFragen,
  offeneEinwilligungen,
  vertretenePerson,
  willkommenssatz,
  willkommenstitel,
  type Einstiegsseite,
} from './einstiegsablauf';
import { EINWILLIGUNGSFASSUNG, EINWILLIGUNGSTEXTE, FREIWILLIG } from './einwilligungstexte';
import { Benachrichtigungen } from './Benachrichtigungen';

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
  mitteilungen: 'Benachrichtigungen',
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

  // Einmal nach der Einrichtung (1c: `?eingerichtet=1`), nur bis zur nächsten Seite.
  const eingerichtet = useEinmaligeRueckmeldung('eingerichtet') === '1';
  const [ersterBlick, setErsterBlick] = useState(true);

  const beenden = useMutation({
    mutationFn: () => api.einstiegBeenden(zugang.access_id),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: einstiegSchluessel(zugang.access_id) }),
  });
  const spaeter = () => {
    if (!beenden.isPending) beenden.mutate();
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
    setNummer((n) => Math.min(n + 1, seiten.length - 1));
  };

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
        </>
      }
      fuss={
        <>
          {fehler}
          {seite === 'bereit' ? (
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
      {seite === 'mitteilungen' ? <Benachrichtigungen zugaenge={[zugang]} einstieg /> : null}
      {seite === 'bereit' ? (
        <p className="text-ink max-w-prose">
          Sie finden alles in der Übersicht. Wenn Sie Fragen haben, wenden Sie sich an die Praxis.
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
 * nicht (ANN-693). Scheitert das Speichern, steht die Wahl wieder, wie sie war.
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
    mutationFn: (erteilen: boolean) =>
      api.einwilligungSchreiben({
        zugangId: zugang.access_id,
        zweck,
        erteilen,
        fassung: EINWILLIGUNGSFASSUNG,
      }),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: einwilligungenSchluessel(zugang.access_id) }),
  });

  const waehlen = (neu: JaNein) => {
    if (schreiben.isPending || neu === wahl) return;
    const vorher = wahl;
    onWahl(neu);
    if (neu === 'ja' || vorher === 'ja') {
      schreiben.mutate(neu === 'ja', { onError: () => onWahl(vorher) });
    }
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
