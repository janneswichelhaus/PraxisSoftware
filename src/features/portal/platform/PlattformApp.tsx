import { useEffect, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Navigate, Route, Routes, matchPath, useLocation, useSearchParams } from 'react-router-dom';
import { Profilhinweis } from '@/app/Profilhinweis';
import { MARKE, tabName, tabTitel } from '@/app/tabtitel';
import { Anrufknoepfe } from '@/components/ui/Anrufknoepfe';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Laufrad } from '@/components/ui/Laufrad';
import { FENSTERZIEL, PortalZielKontext } from '@/components/ui/portalZiel';
import { PageHeader } from '@/components/ui/PageHeader';
import { telHref } from '@/lib/telefon';
import { einstiegSchluessel, ladeEinstieg, type Plattformzugang } from './api';
import { Abo } from './Abo';
import { Angebot } from './Angebot';
import { Vertrag } from './Vertrag';
import { Paket } from './Paket';
import { Befundbogen } from './Befundbogen';
import { Checkin } from './Checkin';
import { AlleAntworten, AngabeSeite, MeineAngaben } from './MeineAngaben';
import { Gewohnheiten } from './Gewohnheiten';
import { Ernaehrung } from './Ernaehrung';
import { EigenesLebensmittelAendern, EigenesLebensmittelNeu, Lebensmittel } from './Lebensmittel';
import { EigenesRezeptAendern, EigenesRezeptNeu, Rezepte } from './Rezepte';
import { Plan } from './Plan';
import { Tagebuch } from './Tagebuch';
import { TagebuchEintragen } from './TagebuchEintragen';
import { Dokumente } from './Dokumente';
import { Datenexport } from './Datenexport';
import { Einstieg } from './Einstieg';
import { Einstellungen } from './Einstellungen';
import { Einwilligungen } from './Einwilligungen';
import { Ich } from './Ich';
import { geruestSpalte, useRechner } from './geruestbreite';
import { Kopf, Reiterleiste } from './Navigation';
import { PLATTFORM_PFAD } from './pfade';
import { Rechnung, Rechnungen } from './Rechnungen';
import { useSchriftgroesseAnwenden } from '@/lib/schriftgroesse';
import { Termine } from './Termine';
import { Verbindungszeile } from './Verbindungszeile';
import { Vertretungsband } from './Vertretungsband';
import { NachrichtDetail, Nachrichten, NeueNachricht } from './Nachrichten';
import { Uebersicht } from './Uebersicht';
import { PlanblattPlattform, Uebungen } from './Uebungen';
import { Durchfuehrung } from './Durchfuehrung';
import { Terminaenderung } from './Terminaenderung';
import { Terminseite } from './Terminseite';
import { Terminwunsch } from './Terminwunsch';
import { useWahl } from './wahl';

/**
 * Das Gerüst der Plattform (POR-004, DSN-001 Abschnitt 3, ADR-023 Punkt 25).
 *
 * Eine Person mit Plattformkonto sieht nie die Praxisoberfläche: keine
 * Seitenleiste, keine Funktionssuche, keine Praxisbegriffe. Oben die Marke
 * der Praxis und „Ich", darunter bei zwei Verhältnissen der Schalter
 * Behandlung | Training (D6), unten die Reiter. Ein Reiter erscheint erst,
 * wenn der Loop gebaut ist, der ihn füllt (ANN-112) - heute ist das nur die
 * Übersicht.
 *
 * Die Weiche im Router dient der Bedienung; der Schutz liegt in den
 * Projektionen (Punkte 19 bis 21). Alles unter dem Präfix `/p`.
 *
 * Seit POR-EPIC-002 füllt der Reiter „Termine" (POR-008); Rechnungen und
 * Dokumente liegen unter „Ich". Seit UEB-EPIC-003 füllt der Reiter „Übungen"
 * bzw. „Training" (UEB-009).
 *
 * Seit POR-EPIC-001b kann ein Konto auch für andere handeln (ADR-023 Punkt
 * 13). Jede Vertretung ist ein eigener Eintrag im Schalter, und solange sie
 * gewählt ist, steht oben dauerhaft „Sie handeln für …" (Punkt 14).
 *
 * Seit DRP-EPIC-003 (Handoff 2026-10-22) stehen Kopf und Reiter in
 * `Navigation.tsx`: die Leiste in drei Stufen, am Rechner die Navigation im
 * Kopf (DR-112, DR-113).
 */
export { PLATTFORM_PFAD };

export function PlattformApp({
  zugaenge,
  email,
  onAbmelden,
}: {
  zugaenge: Plattformzugang[];
  email: string | undefined;
  onAbmelden: () => void;
}) {
  return (
    <MitFensterZiel>
      <Geruest zugaenge={zugaenge} email={email} onAbmelden={onAbmelden} />
    </MitFensterZiel>
  );
}

function Geruest({
  zugaenge,
  email,
  onAbmelden,
}: {
  zugaenge: Plattformzugang[];
  email: string | undefined;
  onAbmelden: () => void;
}) {
  const lesbar = zugaenge.filter((z) => z.readable);
  // POR-016 (D2, ANN-261): Einwilligungen entscheidet die Person selbst oder
  // ihre rechtliche Vertretung - die Person auch nach der Lesefrist, solange
  // ihr Zugang aktiv ist (dann nur noch widerrufen). Den Export (POR-018) nur
  // in der Lesezeit. Verbindlich ist der Server.
  const entscheidend = zugaenge.filter(
    (z) =>
      z.status === 'active' &&
      z.access_kind !== 'companion' &&
      (z.readable || z.access_kind === 'self'),
  );
  // BEF-189 (ADR-023 Punkt 13): eine Begleitung exportiert nur ihre eigene
  // Wahl zu Benachrichtigungen - dieselbe Seite, anderer Inhalt.
  const exportierbar = [
    ...entscheidend.filter((z) => z.readable),
    ...lesbar.filter((z) => z.access_kind === 'companion'),
  ];
  const praxis = zugaenge[0]?.organization_name ?? '';
  const rechner = useRechner();
  // Übersicht, Übungen (ANN-724) und Termine (ANN-775) nutzen am Rechner die ganze Breite in zwei
  // Spalten; ohne lesbaren Zugang steht dort die Tür in der Spalte.
  const { pathname } = useLocation();
  // Ein Gespräch am Rechner mit der Liste daneben (ANN-852).
  const gespraech =
    matchPath(`${PLATTFORM_PFAD}/nachrichten/:nachrichtId`, pathname) !== null &&
    pathname !== `${PLATTFORM_PFAD}/nachrichten/neu`;
  // Eine Rechnung am Rechner als Blatt rechts neben der Liste (ANN-855).
  const rechnungsblatt = matchPath(`${PLATTFORM_PFAD}/rechnungen/:rechnungId`, pathname) !== null;
  const breit =
    ([
      PLATTFORM_PFAD,
      `${PLATTFORM_PFAD}/uebungen`,
      `${PLATTFORM_PFAD}/termine`,
      // „Ich“ am Rechner mit dem Profil links (Briefing 7, Bildschirm 6).
      `${PLATTFORM_PFAD}/ich`,
    ].includes(pathname) ||
      gespraech ||
      rechnungsblatt) &&
    lesbar.length > 0;
  // Die Durchführung steht im Vollbild (Handoff 2026-10-24, Abschnitt 4):
  // ohne Kopf, Verbindungszeile und Reiterleiste des Gerüsts - ihr eigener
  // Kopf mit „Später weiter“ ist der Weg hinaus, ihr Fuß trägt den Hauptknopf
  // (ANN-714).
  const vollbild = matchPath(`${PLATTFORM_PFAD}/uebungen/einheit/:planId`, pathname) !== null;

  return (
    <div
      className="plattform-schrift bg-canvas flex min-h-dvh flex-col"
      // Am Rechner wachsen die Seitentitel auf 32 (`PageHeader`, ANN-683).
      data-rechner={rechner ? '' : undefined}
    >
      {/* Schriftgröße des Geräts; mindestens 18 px am Gerüst (ANN-267). */}
      <SchriftgroesseDesGeraets />
      <TabtitelDerPlattform bereiche={lesbar} />
      {vollbild ? null : <Kopf bereiche={lesbar} rechner={rechner} />}
      {vollbild ? null : <Verbindungszeile rechner={rechner} />}
      {/* Gescheitertes Nachladen des Zugangs (BEF-046): Die Plattform bleibt
          stehen, die Zeile sagt es. */}
      <Profilhinweis />
      <HandelnFuer bereiche={lesbar} rechner={rechner} />
      {/* Jede Seite einspaltig in `max-w-spalte`, außer Übersicht, Übungen und Termine (siehe
          `breit`); unten Luft statt Platz für eine feste Leiste, weil die Reiterleiste am Ende der
          Seite steht (`Navigation.tsx`). */}
      <main
        id="inhalt"
        tabIndex={-1}
        className={
          vollbild
            ? 'flex w-full flex-1 flex-col focus:outline-none'
            : `${geruestSpalte(rechner)} w-full flex-1 focus:outline-none ${
                rechner ? 'pt-12 pb-16' : 'pt-3 pb-10'
              }`
        }
      >
        <div
          className={
            vollbild ? 'flex flex-1 flex-col' : rechner && !breit ? 'max-w-spalte' : undefined
          }
        >
          <Routes>
            <Route
              path={PLATTFORM_PFAD}
              element={
                lesbar.length > 0 ? (
                  <MitZugang
                    bereiche={lesbar}
                    zugaenge={zugaenge}
                    seite={(z) => (
                      <UebersichtOderEinstieg praxis={praxis} email={email} zugang={z} />
                    )}
                  />
                ) : (
                  <OhneLesbarenZugang zugaenge={zugaenge} />
                )
              }
            />
            <Route
              path={`${PLATTFORM_PFAD}/termine`}
              element={
                <MitZugang
                  bereiche={lesbar}
                  zugaenge={zugaenge}
                  seite={(z) => <Termine zugang={z} />}
                />
              }
            />
            <Route
              path={`${PLATTFORM_PFAD}/termine/wunsch`}
              element={
                <MitZugang
                  bereiche={lesbar}
                  zugaenge={zugaenge}
                  seite={(z) => <Terminwunsch zugang={z} />}
                />
              }
            />
            <Route
              path={`${PLATTFORM_PFAD}/termine/:terminId`}
              element={
                <MitZugang
                  bereiche={lesbar}
                  zugaenge={zugaenge}
                  seite={(z) => <TerminOderAblauf zugang={z} />}
                />
              }
            />
            {/* KOM-001: Reiter „Nachrichten" - Fragen an die Praxis. */}
            <Route
              path={`${PLATTFORM_PFAD}/nachrichten`}
              element={
                <MitZugang
                  bereiche={lesbar}
                  zugaenge={zugaenge}
                  seite={(z) => <Nachrichten zugang={z} />}
                />
              }
            />
            <Route
              path={`${PLATTFORM_PFAD}/nachrichten/neu`}
              element={
                <MitZugang
                  bereiche={lesbar}
                  zugaenge={zugaenge}
                  seite={(z) => <NeueNachricht zugang={z} />}
                />
              }
            />
            <Route
              path={`${PLATTFORM_PFAD}/nachrichten/:nachrichtId`}
              element={
                <MitZugang
                  bereiche={lesbar}
                  zugaenge={zugaenge}
                  seite={(z) => <NachrichtDetail zugang={z} />}
                />
              }
            />
            {/* UEB-009: Reiter „Übungen" bzw. „Training" und der Plan als Blatt. */}
            <Route
              path={`${PLATTFORM_PFAD}/uebungen`}
              element={
                <MitZugang
                  bereiche={lesbar}
                  zugaenge={zugaenge}
                  seite={(z) => <Uebungen zugang={z} />}
                />
              }
            />
            <Route
              path={`${PLATTFORM_PFAD}/uebungen/einheit/:planId`}
              element={
                <MitZugang
                  bereiche={lesbar}
                  zugaenge={zugaenge}
                  seite={(z) => <Durchfuehrung zugang={z} />}
                />
              }
            />
            <Route
              path={`${PLATTFORM_PFAD}/uebungen/blatt/:planId`}
              element={
                <MitZugang
                  bereiche={lesbar}
                  zugaenge={zugaenge}
                  seite={(z) => <PlanblattPlattform zugang={z} praxis={praxis} />}
                />
              }
            />
            {/* TRK-003: Check-in und „Meine Angaben" (DSN-001 4.1). */}
            <Route
              path={`${PLATTFORM_PFAD}/checkin`}
              element={
                <MitZugang
                  bereiche={lesbar}
                  zugaenge={zugaenge}
                  seite={(z) => <Checkin zugang={z} />}
                />
              }
            />
            {/* ALT-003: Gewohnheiten mit den letzten sieben Tagen (ANN-370). */}
            <Route
              path={`${PLATTFORM_PFAD}/gewohnheiten`}
              element={
                <MitZugang
                  bereiche={lesbar}
                  zugaenge={zugaenge}
                  seite={(z) => <Gewohnheiten zugang={z} />}
                />
              }
            />
            {/* ERN-002: die eigene Ernährungsberatung (ADR-027) - ohne Beratung oder
              für eine Begleitung gibt der Server nichts. */}
            <Route
              path={`${PLATTFORM_PFAD}/ernaehrung`}
              element={
                <MitZugang
                  bereiche={lesbar}
                  zugaenge={zugaenge}
                  seite={(z) => <Ernaehrung zugang={z} />}
                />
              }
            />
            {/* ERN-EPIC-003: das Tagebuch - ein Tag, Wasser, Mahlzeiten. */}
            <Route
              path={`${PLATTFORM_PFAD}/ernaehrung/tagebuch`}
              element={
                <MitZugang
                  bereiche={lesbar}
                  zugaenge={zugaenge}
                  seite={(z) => <Tagebuch zugang={z} />}
                />
              }
            />
            <Route
              path={`${PLATTFORM_PFAD}/ernaehrung/tagebuch/eintragen`}
              element={
                <MitZugang
                  bereiche={lesbar}
                  zugaenge={zugaenge}
                  seite={(z) => <TagebuchEintragen zugang={z} />}
                />
              }
            />
            {/* ERN-EPIC-002: Lebensmittel nachschlagen und eigene anlegen. */}
            <Route
              path={`${PLATTFORM_PFAD}/ernaehrung/lebensmittel`}
              element={
                <MitZugang
                  bereiche={lesbar}
                  zugaenge={zugaenge}
                  seite={(z) => <Lebensmittel zugang={z} />}
                />
              }
            />
            <Route
              path={`${PLATTFORM_PFAD}/ernaehrung/lebensmittel/neu`}
              element={
                <MitZugang
                  bereiche={lesbar}
                  zugaenge={zugaenge}
                  seite={(z) => <EigenesLebensmittelNeu zugang={z} />}
                />
              }
            />
            <Route
              path={`${PLATTFORM_PFAD}/ernaehrung/lebensmittel/:foodId`}
              element={
                <MitZugang
                  bereiche={lesbar}
                  zugaenge={zugaenge}
                  seite={(z) => <EigenesLebensmittelAendern zugang={z} />}
                />
              }
            />
            {/* Der Plan der Beratung (ADR-027 Punkt 14). */}
            <Route
              path={`${PLATTFORM_PFAD}/ernaehrung/plan`}
              element={
                <MitZugang
                  bereiche={lesbar}
                  zugaenge={zugaenge}
                  seite={(z) => <Plan zugang={z} />}
                />
              }
            />
            {/* Eigene Rezepte aus Zutaten (ADR-027 Punkt 9). */}
            <Route
              path={`${PLATTFORM_PFAD}/ernaehrung/rezepte`}
              element={
                <MitZugang
                  bereiche={lesbar}
                  zugaenge={zugaenge}
                  seite={(z) => <Rezepte zugang={z} />}
                />
              }
            />
            <Route
              path={`${PLATTFORM_PFAD}/ernaehrung/rezepte/neu`}
              element={
                <MitZugang
                  bereiche={lesbar}
                  zugaenge={zugaenge}
                  seite={(z) => <EigenesRezeptNeu zugang={z} />}
                />
              }
            />
            <Route
              path={`${PLATTFORM_PFAD}/ernaehrung/rezepte/:recipeId`}
              element={
                <MitZugang
                  bereiche={lesbar}
                  zugaenge={zugaenge}
                  seite={(z) => <EigenesRezeptAendern zugang={z} />}
                />
              }
            />
            <Route
              path={`${PLATTFORM_PFAD}/angaben`}
              element={
                <MitZugang
                  bereiche={lesbar}
                  zugaenge={zugaenge}
                  seite={(z) => <MeineAngaben zugang={z} />}
                />
              }
            />
            {/* Unter „Meine Angaben“: alle Antworten als Tabelle und je Frage eine Seite. */}
            <Route
              path={`${PLATTFORM_PFAD}/angaben/tabelle`}
              element={
                <MitZugang
                  bereiche={lesbar}
                  zugaenge={zugaenge}
                  seite={(z) => <AlleAntworten zugang={z} />}
                />
              }
            />
            <Route
              path={`${PLATTFORM_PFAD}/angaben/:schluessel`}
              element={
                <MitZugang
                  bereiche={lesbar}
                  zugaenge={zugaenge}
                  seite={(z) => <AngabeSeite zugang={z} />}
                />
              }
            />
            <Route
              path={`${PLATTFORM_PFAD}/befundbogen`}
              element={
                <MitZugang
                  bereiche={lesbar}
                  zugaenge={zugaenge}
                  seite={(z) => <Befundbogen zugang={z} />}
                />
              }
            />
            <Route
              path={`${PLATTFORM_PFAD}/rechnungen`}
              element={
                <MitZugang
                  bereiche={lesbar}
                  zugaenge={zugaenge}
                  seite={(z) => <Rechnungen zugang={z} />}
                />
              }
            />
            <Route
              path={`${PLATTFORM_PFAD}/rechnungen/:rechnungId`}
              element={
                <MitZugang
                  bereiche={lesbar}
                  zugaenge={zugaenge}
                  seite={(z) => <Rechnung zugang={z} />}
                />
              }
            />
            <Route
              path={`${PLATTFORM_PFAD}/dokumente`}
              element={
                <MitZugang
                  bereiche={lesbar}
                  zugaenge={zugaenge}
                  seite={(z) => <Dokumente zugang={z} />}
                />
              }
            />
            <Route
              path={`${PLATTFORM_PFAD}/einwilligungen`}
              element={
                <MitZugang
                  bereiche={entscheidend}
                  zugaenge={zugaenge}
                  seite={(z) => <Einwilligungen zugang={z} />}
                />
              }
            />
            <Route
              path={`${PLATTFORM_PFAD}/daten`}
              element={
                <MitZugang
                  bereiche={exportierbar}
                  zugaenge={zugaenge}
                  seite={(z) => <Datenexport zugang={z} />}
                />
              }
            />
            <Route
              path={`${PLATTFORM_PFAD}/abo`}
              element={
                <MitZugang
                  bereiche={lesbar.filter((z) => z.relationship_kind === 'treatment')}
                  zugaenge={zugaenge}
                  seite={(z) => <Abo zugang={z} />}
                />
              }
            />
            {/* KND-003: das Angebot aus dem Abschlussgespräch - nur über einen
              Zugang zur Behandlung; ob er es sieht, sagt der Server. */}
            <Route
              path={`${PLATTFORM_PFAD}/angebot`}
              element={
                <MitZugang
                  bereiche={lesbar.filter((z) => z.relationship_kind === 'treatment')}
                  zugaenge={zugaenge}
                  seite={(z) => <Angebot zugang={z} />}
                />
              }
            />
            {/* KND-003: der im Konto geschlossene Vertrag - nur im Training. */}
            <Route
              path={`${PLATTFORM_PFAD}/vertrag`}
              element={
                <MitZugang
                  bereiche={lesbar.filter((z) => z.relationship_kind === 'training')}
                  zugaenge={zugaenge}
                  seite={(z) => <Vertrag zugang={z} />}
                />
              }
            />
            <Route
              path={`${PLATTFORM_PFAD}/paket`}
              element={
                <MitZugang
                  bereiche={lesbar.filter((z) => z.relationship_kind === 'training')}
                  zugaenge={zugaenge}
                  seite={(z) => <Paket zugang={z} />}
                />
              }
            />
            <Route
              path={`${PLATTFORM_PFAD}/einstellungen`}
              element={<Einstellungen zugaenge={lesbar} />}
            />
            <Route
              path={`${PLATTFORM_PFAD}/ich`}
              element={
                <Ich
                  email={email}
                  praxis={praxis}
                  zugaenge={lesbar}
                  entscheidend={entscheidend}
                  rechner={rechner}
                  onAbmelden={onAbmelden}
                />
              }
            />
            <Route path="*" element={<Navigate to={PLATTFORM_PFAD} replace />} />
          </Routes>
        </div>
      </main>
      {/* Ohne lesbaren Zugang führt kein Reiter irgendwohin (Handoff 5.2). */}
      {rechner || vollbild || lesbar.length === 0 ? null : <Reiterleiste bereiche={lesbar} />}
    </div>
  );
}

/**
 * Das Ziel der Fenster in der Schrift der Plattform (ANN-584), innerhalb dessen, was die
 * Sitzungssperre verbirgt: Am `body` erbten Dialoge die 18 px nicht. Die Seiten zeichnen erst, wenn
 * es steht, sonst zöge ein offenes Fenster um; `data-rechner` lässt ihre Titel mitwachsen.
 */
function MitFensterZiel({ children }: { children: ReactNode }) {
  const [ziel, setZiel] = useState<HTMLDivElement | null>(null);
  const rechner = useRechner();
  return (
    <>
      {ziel ? (
        <PortalZielKontext.Provider value={ziel}>{children}</PortalZielKontext.Provider>
      ) : null}
      <div
        ref={setZiel}
        className="plattform-schrift"
        data-testid="plattform-fenster"
        data-rechner={rechner ? '' : undefined}
        {...{ [FENSTERZIEL]: '' }}
      />
    </>
  );
}

/** Wendet die Schriftgröße dieses Geräts an, solange das Gerüst steht. */
function SchriftgroesseDesGeraets() {
  useSchriftgroesseAnwenden();
  return null;
}

/**
 * Der Titel des Tabs je Seite (DR-115): fest aus `tabtitel.ts`, nie mit
 * Daten. Bis dahin hieß hier jeder Tab „Own Motion“, und Vorlesesoftware sagte
 * nach einem Reiterwechsel denselben Titel an. Im Training heißt der Reiter
 * „Training“ (DSN-001 Abschnitt 5) - der Tab auch.
 */
function TabtitelDerPlattform({ bereiche }: { bereiche: Plattformzugang[] }) {
  const { pathname } = useLocation();
  const training = useWahl(bereiche)?.relationship_kind === 'training';
  useEffect(() => {
    document.title =
      training && tabName(pathname) === 'Übungen' ? `Training – ${MARKE}` : tabTitel(pathname);
  }, [pathname, training]);
  return null;
}

/**
 * POR-019: Steht der Einstieg für den gewählten Zugang aus, kommt er vor der
 * Übersicht - sonst die Übersicht. Lädt der Stand nicht, gilt die Übersicht:
 * Ein Einstieg darf nie den Zugang zu den eigenen Daten versperren.
 */
function UebersichtOderEinstieg({
  praxis,
  email,
  zugang,
}: {
  praxis: string;
  /** Die Adresse des Kontos - der Einstieg nennt sie am Schalter für die E-Mail. */
  email: string | undefined;
  zugang: Plattformzugang;
}) {
  const einstieg = useQuery({
    queryKey: einstiegSchluessel(zugang.access_id),
    queryFn: () => ladeEinstieg(zugang.access_id),
    retry: false,
  });
  if (einstieg.isPending) return null;
  const steht = Boolean(einstieg.data?.pending);
  if (steht) return <Einstieg zugang={zugang} praxis={praxis} email={email} />;
  return <Uebersicht zugang={zugang} />;
}

/**
 * Eine Seite, die einen gewählten lesbaren Zugang braucht (POR-008): ohne
 * einen solchen steht dort, was los ist - wie auf der Übersicht.
 */
function MitZugang({
  bereiche,
  zugaenge,
  seite,
}: {
  bereiche: Plattformzugang[];
  zugaenge: Plattformzugang[];
  seite: (zugang: Plattformzugang) => ReactNode;
}) {
  const zugang = useWahl(bereiche);
  if (!zugang) return <OhneLesbarenZugang zugaenge={zugaenge} />;
  return <>{seite(zugang)}</>;
}

/**
 * „Sie handeln für …" (ADR-023 Punkt 14, DSN-001 Abschnitt 10): dauerhaft
 * über dem Inhalt, solange eine Vertretung gewählt ist. Unter „Ich" steht es
 * nicht - dort geht es um das eigene Konto.
 */
function HandelnFuer({ bereiche, rechner }: { bereiche: Plattformzugang[]; rechner: boolean }) {
  const { pathname } = useLocation();
  const gewaehlt = useWahl(bereiche);
  if (!gewaehlt || gewaehlt.access_kind === 'self' || pathname === `${PLATTFORM_PFAD}/ich`) {
    return null;
  }
  return <Vertretungsband zugang={gewaehlt} innen={geruestSpalte(rechner)} />;
}

/**
 * Gesperrt oder Lesefrist vorbei: sagen, was los ist (§13), und nur „Ich"
 * anbieten (D2). Seit Schritt 1c (Handoff 2026-10-22, Abschnitt 5.2) mit der
 * Markenfläche statt einer leeren Seite, ohne Reiterleiste, und gesperrt mit
 * „Praxis anrufen“, wenn die Praxis eine Nummer führt (ANN-691, ANN-688).
 */
function OhneLesbarenZugang({ zugaenge }: { zugaenge: Plattformzugang[] }) {
  const gesperrt = zugaenge.some((z) => z.status === 'locked');
  const telefon = zugaenge.find((z) => z.practice_phone)?.practice_phone ?? null;
  return (
    <>
      {/* Markenfläche mit Laufrad; unter 23rem entfällt sie wie ein Foto (ANN-682). */}
      <div
        aria-hidden="true"
        className="bg-surface-inverse rounded-image relative mb-8 h-40 overflow-hidden max-[23rem]:hidden"
      >
        <Laufrad className="text-accent absolute -top-12 -right-12 size-55" />
      </div>
      <PageHeader title={gesperrt ? 'Ihr Zugang ist gesperrt' : 'Ihr Zugang ist beendet'} />
      <p className="text-ink max-w-prose text-base leading-relaxed">
        {gesperrt
          ? 'Hier ist gerade nichts zu sehen. Bitte wenden Sie sich an die Praxis.'
          : 'Die Zeit, in der Sie hier noch lesen konnten, ist abgelaufen. Unter „Ich" können Sie Einwilligungen widerrufen und sich abmelden.'}
      </p>
      <div className="max-w-formular mt-6 flex flex-col gap-3">
        {gesperrt && telefon ? (
          <Anrufknoepfe
            hauptknopf
            ohneNummer={null}
            nummern={[{ label: 'Praxis', anzeige: telefon, href: telHref(telefon) }]}
          />
        ) : null}
        <ButtonLink to={`${PLATTFORM_PFAD}/ich`} variant="secondary">
          Zu „Ich“
        </ButtonLink>
      </div>
    </>
  );
}

/** `/p/termine/<id>`: ohne `?art=` die Seite des Termins, mit `?art=` der Ablauf (ANN-778). */
function TerminOderAblauf({ zugang }: { zugang: Plattformzugang }) {
  const [suche] = useSearchParams();
  return suche.has('art') ? <Terminaenderung zugang={zugang} /> : <Terminseite zugang={zugang} />;
}
