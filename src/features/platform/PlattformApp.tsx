import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigate, Route, Routes, matchPath, useLocation } from 'react-router-dom';
import { Profilhinweis } from '@/app/Profilhinweis';
import { MARKE, tabName, tabTitel } from '@/app/tabtitel';
import { Anrufknoepfe } from '@/components/ui/Anrufknoepfe';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Laufrad } from '@/components/ui/Laufrad';
import { FENSTERZIEL, PortalZielKontext } from '@/components/ui/portalZiel';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Section } from '@/components/ui/Section';
import { Kleingedrucktes } from '@/components/ui/Kleingedrucktes';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { Listenabschnitt } from '@/components/ui/Listenabschnitt';
import { PageHeader } from '@/components/ui/PageHeader';
import { mitRueckweg } from '@/lib/rueckweg';
import { telHref } from '@/lib/telefon';
import { RECHTSGRUNDLAGE, VERTRETUNGSART } from '@/lib/vertretung';
import {
  BEREICHSNAME,
  aboSchluessel,
  ernaehrungSchluessel,
  einstiegSchluessel,
  paketeSchluessel,
  vertragSchluessel,
  vertretungenSchluessel,
  type MeineVertretung,
  type Plattformzugang,
} from './api';
import {
  NurLesenKontext,
  PlattformApiKontext,
  PraxiswegeKontext,
  einsichtsApi,
  useNurLesen,
  usePlattformApi,
  type Einsichtsquelle,
  type Praxiswege,
} from './einsicht';
import { Abo } from './Abo';
import { Angebot } from './Angebot';
import { Vertrag } from './Vertrag';
import { Paket } from './Paket';
import { Befundbogen } from './Befundbogen';
import { Checkin, MeineAngaben } from './Checkin';
import { Gewohnheiten } from './Gewohnheiten';
import { Ernaehrung } from './Ernaehrung';
import { EigenesLebensmittelAendern, EigenesLebensmittelNeu, Lebensmittel } from './Lebensmittel';
import { Tagebuch } from './Tagebuch';
import { TagebuchEintragen } from './TagebuchEintragen';
import { zahl as zahlDeutsch } from '@/features/nutrition/texte';
import { Dokumente } from './Dokumente';
import { Datenexport } from './Datenexport';
import { Einstieg } from './Einstieg';
import { Einstellungen } from './Einstellungen';
import { Einwilligungen } from './Einwilligungen';
import { geruestSpalte, useRechner } from './geruestbreite';
import { Kopf, Reiterleiste } from './Navigation';
import { PLATTFORM_PFAD } from './pfade';
import { Rechnung, Rechnungen } from './Rechnungen';
import { useSchriftgroesseAnwenden } from './schriftgroesse';
import { Termine } from './Termine';
import { Verbindungszeile } from './Verbindungszeile';
import { Vertretungsband } from './Vertretungsband';
import { NachrichtDetail, Nachrichten, NeueNachricht } from './Nachrichten';
import { Uebersicht } from './Uebersicht';
import { PlanblattPlattform, Uebungen } from './Uebungen';
import { Durchfuehrung } from './Durchfuehrung';
import { datum, kalendertag } from './zeit';
import { Terminaenderung } from './Terminaenderung';
import { Terminwunsch } from './Terminwunsch';
import { useWahl, wahlAdresse, wahlName } from './wahl';

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

/**
 * E-001: Die Einsicht der Praxis (DSN-001 D7) zeigt dasselbe Gerüst, nur
 * lesend. Die Praxisseite gibt den einen Zugang und ihre Quelle mit, dazu die
 * Wege in die Praxis; die Seiten bekommen daraus `einsichtsApi`,
 * `useNurLesen()` und `usePraxiswege()` über den Kontext. Ohne `einsicht` ist
 * es die Plattform der Person, wie bisher.
 */
export interface Einsicht {
  zugangId: string;
  quelle: Einsichtsquelle;
  /** Wo die Praxis öffnet, was die Einsicht nicht öffnet. */
  wege?: Praxiswege;
}

export function PlattformApp({
  zugaenge,
  email,
  onAbmelden,
  einsicht,
}: {
  zugaenge: Plattformzugang[];
  email: string | undefined;
  onAbmelden: () => void;
  einsicht?: Einsicht;
}) {
  const zugangId = einsicht?.zugangId;
  const quelle = einsicht?.quelle;
  const api = useMemo(
    () => (zugangId && quelle ? einsichtsApi(zugangId, quelle) : null),
    [zugangId, quelle],
  );
  const geruest = <Geruest zugaenge={zugaenge} email={email} onAbmelden={onAbmelden} />;
  if (!api) return <MitFensterZiel>{geruest}</MitFensterZiel>;
  return (
    <PlattformApiKontext.Provider value={api}>
      <NurLesenKontext.Provider value>
        <PraxiswegeKontext.Provider value={einsicht?.wege ?? null}>
          {geruest}
        </PraxiswegeKontext.Provider>
      </NurLesenKontext.Provider>
    </PlattformApiKontext.Provider>
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
  // E-001: Seiten, die nur schreiben, gibt es in der Einsicht nicht.
  const nurLesen = useNurLesen();
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
  // DR-113: ab 1024 px die Rechneransicht. Die Einsicht zeigt die Plattform
  // in einem Telefon und behält dessen Ansicht (`geruestbreite.ts`).
  const rechner = useRechner() && !nurLesen;
  // Die Übersicht nutzt am Rechner die ganze Breite (zwei Spalten); ohne
  // lesbaren Zugang steht dort die Tür in der Spalte.
  const { pathname } = useLocation();
  const breit = pathname === PLATTFORM_PFAD && lesbar.length > 0;
  // Die Durchführung steht im Vollbild (Handoff 2026-10-24, Abschnitt 4):
  // ohne Kopf, Verbindungszeile und Reiterleiste des Gerüsts - ihr eigener
  // Kopf mit „Später weiter“ ist der Weg hinaus, ihr Fuß trägt den Hauptknopf
  // (ANN-714).
  const vollbild =
    !nurLesen && matchPath(`${PLATTFORM_PFAD}/uebungen/einheit/:planId`, pathname) !== null;

  // In der Einsicht füllt das Gerüst den Rahmen der Praxisseite, nicht das Fenster.
  return (
    <div
      className={`plattform-schrift bg-canvas flex flex-col ${nurLesen ? 'min-h-full' : 'min-h-dvh'}`}
      // Am Rechner wachsen die Seitentitel auf 32 (`PageHeader`, ANN-683).
      data-rechner={rechner ? '' : undefined}
    >
      {/* POR-020 (ANN-267): Schriftgröße des Geräts; mindestens 18 px am
          Gerüst. In der Einsicht gilt die Wahl der Person, nicht die dieses
          Geräts - sie bleibt dort bei 18 px. */}
      {nurLesen ? null : <SchriftgroesseDesGeraets />}
      {/* Den Tab und die Verbindung zeigt in der Einsicht die Praxis selbst. */}
      {nurLesen ? null : <TabtitelDerPlattform bereiche={lesbar} />}
      {vollbild ? null : <Kopf bereiche={lesbar} rechner={rechner} />}
      {nurLesen || vollbild ? null : <Verbindungszeile rechner={rechner} />}
      {/* Gescheitertes Nachladen des Zugangs (BEF-046): Die Plattform bleibt
          stehen, die Zeile sagt es. */}
      <Profilhinweis />
      <HandelnFuer bereiche={lesbar} rechner={rechner} />
      {/* Handoff 2026-10-22, Abschnitt 4: am Telefon 20 px Rand und 12 oben,
          unter 23rem 12 px; am Rechner `max-w-inhalt` mit 40 px. Darin steht
          jede Seite einspaltig in `max-w-spalte`, an der Kante der Marke -
          außer der Übersicht, die ab 900 px Inhaltsbreite zwei Spalten hat
          (`Uebersicht.tsx`). Unten bleibt Luft statt Platz für eine feste
          Leiste: Die Reiterleiste steht am Ende der Seite (`Navigation.tsx`). */}
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
            {nurLesen ? null : (
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
            )}
            {nurLesen ? null : (
              <Route
                path={`${PLATTFORM_PFAD}/termine/:terminId`}
                element={
                  <MitZugang
                    bereiche={lesbar}
                    zugaenge={zugaenge}
                    seite={(z) => <Terminaenderung zugang={z} />}
                  />
                }
              />
            )}
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
            {/* E-001: In der Einsicht führt „neu“ zurück zur Übersicht - ohne
              diese Route nähme die Nachricht darunter es als Kennung. */}
            <Route
              path={`${PLATTFORM_PFAD}/nachrichten/neu`}
              element={
                nurLesen ? (
                  <Navigate to={PLATTFORM_PFAD} replace />
                ) : (
                  <MitZugang
                    bereiche={lesbar}
                    zugaenge={zugaenge}
                    seite={(z) => <NeueNachricht zugang={z} />}
                  />
                )
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
            {nurLesen ? null : (
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
            )}
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
            {nurLesen ? null : (
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
            )}
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
            {nurLesen ? null : (
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
            )}
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
            {nurLesen ? null : (
              <>
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
              </>
            )}
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
            {nurLesen ? null : (
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
            )}
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
            {nurLesen ? null : (
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
            )}
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
            {nurLesen ? null : (
              <Route
                path={`${PLATTFORM_PFAD}/einstellungen`}
                element={<Einstellungen zugaenge={lesbar} />}
              />
            )}
            <Route
              path={`${PLATTFORM_PFAD}/ich`}
              element={
                <Ich
                  email={email}
                  praxis={praxis}
                  zugaenge={lesbar}
                  entscheidend={entscheidend}
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
 * Wohin die Fenster der Plattform zeichnen (Überholung 6, ANN-584): ein
 * Ziel mit der Schrift der Plattform (`.plattform-schrift`, 18 px) direkt nach
 * dem Gerüst. Am `body` - dem Ziel ohne Angabe - erbten `Dialogfenster` und
 * der geführte Ablauf die 18 px nicht, weil ihr Portal außerhalb des Gerüsts
 * liegt. Das Ziel bleibt innerhalb dessen, was die Sitzungssperre verbirgt.
 * Die Seiten zeichnen erst, wenn es steht: Ein Fenster, das beim ersten
 * Zeichnen schon offen ist, zöge sonst um. Die Einsicht der Praxis behält
 * ihr Ziel - ihre Fenster liegen über der Praxisseite.
 *
 * Am Rechner trägt das Ziel `data-rechner` wie das Gerüst: Die Titel eines
 * Fensters in der Stufe der Plattform wachsen dann mit (`Fenstertitel`,
 * Einstieg, DRP-016) - nicht nach `lg:`, das in der Einsicht gälte.
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
  const api = usePlattformApi();
  const nurLesen = useNurLesen();
  const einstieg = useQuery({
    queryKey: einstiegSchluessel(zugang.access_id),
    queryFn: () => api.ladeEinstieg(zugang.access_id),
    retry: false,
  });
  if (einstieg.isPending) return null;
  const steht = Boolean(einstieg.data?.pending);
  // E-001: Den Einstieg bedient nur die Person - die Einsicht zeigt die
  // Übersicht und sagt, dass er noch aussteht.
  if (steht && !nurLesen) return <Einstieg zugang={zugang} praxis={praxis} email={email} />;
  return <Uebersicht zugang={zugang} einstiegSteht={steht && nurLesen} />;
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

/**
 * „Ich" (DSN-001 Abschnitt 3): je Bereich die Unterlagen, Verträge,
 * Einwilligungen und Daten, wer für die Person Zugang hat (ADR-023 Punkt
 * 14), am Ende das Konto mit Einstellungen und Abmelden.
 *
 * Seit Welle B (DESIGN.md, Seitentyp „Plattform“) ist jede Unterlage eine
 * Zeile, die ganz das Ziel ist (`ListRow`) - statt sieben Abschnitten mit
 * Textlinks. Der Bereich steht einmal als Abschnittstitel, nicht hinter
 * jedem Link.
 */
function Ich({
  email,
  praxis,
  zugaenge,
  entscheidend,
  onAbmelden,
}: {
  email: string | undefined;
  praxis: string;
  zugaenge: Plattformzugang[];
  /** Zugänge, über die Einwilligungen und Export gehen (POR-016, ANN-261). */
  entscheidend: Plattformzugang[];
  onAbmelden: () => void;
}) {
  const api = usePlattformApi();
  const nurLesen = useNurLesen();
  // Die Person selbst und eine rechtliche Vertretung sehen, wer Zugang hat;
  // eine Begleitung nicht. Verbindlich ist der Server (manage_companions).
  const mitVertretungen = zugaenge.filter((z) => z.access_kind !== 'companion');
  // Ein Bereich steht hier, wenn er lesbar ist oder über ihn entschieden
  // wird: Nach der Lesefrist bleibt der Person das Widerrufen (D2).
  const bereiche = [
    ...zugaenge,
    ...entscheidend.filter((e) => !zugaenge.some((z) => z.access_id === e.access_id)),
  ];
  const [fehler, setFehler] = useState<string | undefined>(undefined);
  return (
    <>
      {/* Der Kopf hat eine Zeile (DESIGN.md Regel 6); die Adresse steht
          unter „Konto“ (BEF-193). */}
      <PageHeader title="Ich" description={praxis ? `Zugang von ${praxis}` : undefined} />
      {bereiche.map((z) => (
        <IchBereich
          key={z.access_id}
          zugang={z}
          lesbar={zugaenge.some((x) => x.access_id === z.access_id)}
          entscheidet={entscheidend.some((x) => x.access_id === z.access_id)}
        />
      ))}
      {mitVertretungen.map((z) => (
        <WerZugangHat key={z.access_id} zugang={z} mehrere={mitVertretungen.length > 1} />
      ))}
      <Section titel="Konto">
        {/* POR-020: Schriftgröße und was die Praxis eingestellt hat. */}
        <ListRows>
          <ListRow
            titel="Angemeldet als"
            meta={<span className="wrap-anywhere">{email ?? 'Ihr Konto'}</span>}
          />
          <ListRow
            // E-001: Geräteeinstellungen und Abmelden der Person gibt es in
            // der Einsicht nicht - die Zeile steht, wie die Person sie sieht.
            {...(nurLesen ? {} : { to: `${PLATTFORM_PFAD}/einstellungen` })}
            titel="Einstellungen"
            meta="Schrift, Benachrichtigungen, Passkey und PIN"
          />
        </ListRows>
        {nurLesen ? null : (
          // DR-150: Abmelden ist nicht die Hauptsache dieser Seite - eine
          // leise Zeile am Ende, „Überall abmelden“ mit Rückfrage darunter.
          <div className="mt-6 flex flex-col items-start gap-3">
            <Button variant="quiet" onClick={onAbmelden}>
              Abmelden
            </Button>
            <Rueckfrage
              ausloeser="Überall abmelden"
              ausloeserVariante="quiet"
              bestaetigen="Überall abmelden"
              bestaetigenLaeuft="Wird abgemeldet …"
              fehler={fehler}
              onBestaetigen={() =>
                api.ueberallAbmelden().catch((grund: Error) => {
                  setFehler(grund.message);
                  throw grund;
                })
              }
            >
              <p>
                Sie werden auf allen Geräten abgemeldet, auch auf diesem. Das ist richtig, wenn Sie
                ein Telefon verloren haben.
              </p>
            </Rueckfrage>
          </div>
        )}
      </Section>
      <Kleingedrucktes className="mt-8">
        {/* DR-104: Ein Kennwort gibt es nicht; was sich weitergeben ließe, ist
            das entsperrte Telefon. */}
        Ihr Zugang gehört nur Ihnen. Geben Sie Ihr entsperrtes Telefon nicht weiter. Angehörige, die
        Ihnen helfen, bekommen von der Praxis einen eigenen Zugang.
      </Kleingedrucktes>
    </>
  );
}

/** Der Suchteil eines Zugangs für Links auf seine Seiten (D6). */
function wahlSuche(z: Plattformzugang): string {
  return wahlAdresse(z).split('?')[1] ?? '';
}

/**
 * Die Zeilen eines Bereichs unter „Ich“: Rechnungen und Dokumente (POR-013,
 * POR-014), Meine Angaben (TRK-003) und Gewohnheiten (ALT-003), Abo
 * (ANG-003), Paket (ANG-008) und Vertrag (KND-003), Einwilligungen (POR-016)
 * und Export (POR-018, ANN-261). Was eine Rolle davon sieht, sagt der
 * Server; eine Begleitung entscheidet keine Einwilligungen.
 */
function IchBereich({
  zugang: z,
  lesbar,
  entscheidet,
}: {
  zugang: Plattformzugang;
  lesbar: boolean;
  entscheidet: boolean;
}) {
  const nurLesen = useNurLesen();
  const ziel = (pfad: string) => `${PLATTFORM_PFAD}/${pfad}?${wahlSuche(z)}`;
  return (
    <Listenabschnitt titel={wahlName(z)}>
      {lesbar ? <ListRow to={ziel('rechnungen')} titel="Rechnungen" /> : null}
      {/* POR-014: Dokumente gibt es nur in der Behandlung. */}
      {lesbar && z.relationship_kind === 'treatment' ? (
        <ListRow to={ziel('dokumente')} titel="Dokumente" />
      ) : null}
      {lesbar ? <ListRow to={ziel('angaben')} titel="Antworten aus dem Check-in" /> : null}
      {/* ALT-003: die eigenen Gewohnheiten, auch ohne Kachel erreichbar. Von
          hier führt der Rückweg wieder unter „Ich“, nicht zur Übersicht (DR-144). */}
      {lesbar ? (
        <ListRow
          to={mitRueckweg(ziel('gewohnheiten'), `${PLATTFORM_PFAD}/ich?${wahlSuche(z)}`)}
          titel="Gewohnheiten"
        />
      ) : null}
      {/* ERN-002: nur mit laufender Beratung - die Zeile fragt den Server. */}
      {lesbar && z.access_kind !== 'companion' ? <ErnaehrungZeile zugang={z} /> : null}
      {lesbar && z.relationship_kind === 'treatment' ? <AboZeile zugang={z} /> : null}
      {lesbar && z.relationship_kind === 'training' ? <PaketZeile zugang={z} /> : null}
      {lesbar && z.relationship_kind === 'training' ? <VertragZeile zugang={z} /> : null}
      {entscheidet ? <ListRow to={ziel('einwilligungen')} titel="Einwilligungen" /> : null}
      {/* POR-018 (ANN-261): der Export nur in der Lesezeit. */}
      {entscheidet && z.readable ? (
        // E-001: Der Export steht im Protokoll und gehört der Person.
        <ListRow {...(nurLesen ? {} : { to: ziel('daten') })} titel="Meine Daten herunterladen" />
      ) : null}
      {entscheidet && !z.readable ? (
        <ListRow titel="Meine Daten" meta="Ihre Daten bekommen Sie jetzt bei der Praxis." />
      ) : null}
      {/* BEF-189: die Begleitung lädt ihre eigene Wahl herunter, in der Lesezeit. */}
      {lesbar && z.access_kind === 'companion' ? (
        <ListRow
          {...(nurLesen ? {} : { to: ziel('daten') })}
          titel="Meine Benachrichtigungen herunterladen"
        />
      ) : null}
    </Listenabschnitt>
  );
}

/**
 * Die Ernährungsberatung unter „Ich" (ERN-002): nur, wenn eine läuft und der
 * Zugang sie sehen darf; sonst keine Zeile.
 */
function ErnaehrungZeile({ zugang }: { zugang: Plattformzugang }) {
  const api = usePlattformApi();
  // Die Einsicht liest die Ernährung nicht (ADR-027 Punkt 4); ein Versuch
  // hinterließe einen Fehler im Speicher, den die Übersicht übernähme.
  const nurLesen = useNurLesen();
  const { data } = useQuery({
    queryKey: ernaehrungSchluessel(zugang.access_id),
    queryFn: () => api.ladeErnaehrung(zugang.access_id),
    retry: false,
    enabled: !nurLesen,
  });
  if (!data) return null;
  const z = data.profile.targets;
  return (
    <ListRow
      to={`${PLATTFORM_PFAD}/ernaehrung?${wahlSuche(zugang)}`}
      titel="Ernährung"
      meta={z.status === 'ok' ? `Energie am Tag: ${zahlDeutsch(z.energy.kcal)} kcal` : undefined}
    />
  );
}

/**
 * Das Nachsorge-Abo unter „Ich" (ANG-003, DSN-001 4.2): seit wann, bis wann,
 * und der Weg zum Kündigen. Ohne Abo – oder ohne Recht, es zu sehen – keine
 * Zeile.
 */
function AboZeile({ zugang }: { zugang: Plattformzugang }) {
  const api = usePlattformApi();
  const { data } = useQuery({
    queryKey: aboSchluessel(zugang.access_id),
    queryFn: () => api.ladeAbo(zugang.access_id),
  });
  if (!data) return null;
  return (
    <ListRow
      to={`${PLATTFORM_PFAD}/abo?${wahlSuche(zugang)}`}
      titel={
        data.state === 'running' && data.can_cancel
          ? 'Nachsorge-Abo ansehen oder kündigen'
          : 'Nachsorge-Abo'
      }
      meta={
        data.state === 'running'
          ? data.starts_on > kalendertag(new Date())
            ? `Beginnt am ${datum(data.starts_on)}.`
            : `Läuft seit ${datum(data.starts_on)}.`
          : data.state === 'ending'
            ? `Gekündigt, endet am ${datum(data.ends_on ?? '')}.`
            : `Beendet am ${datum(data.ends_on ?? '')}.`
      }
    />
  );
}

/**
 * Das Trainingspaket unter „Ich" (ANG-008, PROJECT_PRINCIPLES.md 4.10): ein
 * laufendes Paket in einem Satz, und immer der Weg zu Paket und Preisen –
 * die Preise stehen da, bevor jemand fragt (IDEA-ANG-004). Den eigenen Stand
 * sieht nur, wer Rechnungen sieht; das sagt der Server.
 */
function PaketZeile({ zugang }: { zugang: Plattformzugang }) {
  const api = usePlattformApi();
  const { data } = useQuery({
    queryKey: paketeSchluessel(zugang.access_id),
    queryFn: () => api.ladeMeinePakete(zugang.access_id),
  });
  const aktuell = data?.find((k) => k.state !== 'ended');
  return (
    <ListRow
      to={`${PLATTFORM_PFAD}/paket?${wahlSuche(zugang)}`}
      titel={aktuell ? 'Trainingspaket und Preise' : 'Pakete und Preise'}
      {...(aktuell
        ? {
            meta:
              aktuell.state === 'planned'
                ? `Beginnt am ${datum(aktuell.starts_on)}.`
                : `Läuft bis ${datum(aktuell.ends_on)}.`,
          }
        : {})}
    />
  );
}

/**
 * Der Trainingsvertrag unter „Ich" (KND-003): gebucht am, und der Weg zur
 * Bestätigung - solange die Frist läuft, auch zum Widerruf (KND-004). Ohne
 * Vertrag im Konto keine Zeile.
 */
function VertragZeile({ zugang }: { zugang: Plattformzugang }) {
  const api = usePlattformApi();
  const { data } = useQuery({
    queryKey: vertragSchluessel(zugang.access_id),
    queryFn: () => api.ladeVertrag(zugang.access_id),
  });
  if (!data) return null;
  return (
    <ListRow
      to={`${PLATTFORM_PFAD}/vertrag?${wahlSuche(zugang)}`}
      titel={data.can_withdraw ? 'Trainingsvertrag ansehen oder widerrufen' : 'Trainingsvertrag'}
      meta={`Gebucht am ${datum(data.concluded_at)}.${
        data.withdrawn_at
          ? ` Widerrufen am ${datum(data.withdrawn_at)}.`
          : data.can_withdraw
            ? ` Widerruf möglich bis ${datum(data.withdrawal_ends_on)}.`
            : ''
      }`}
    />
  );
}

/**
 * Wer für die Person Zugang hat (POR-007). Ohne Vertretung steht hier nichts:
 * Ein leerer Wert bekommt keine Zeile. Eine Begleitung beendet die Person
 * selbst - das ist der Widerruf ihrer Einwilligung. Eine rechtliche
 * Vertretung beendet nur die Praxis.
 */
function WerZugangHat({ zugang, mehrere }: { zugang: Plattformzugang; mehrere: boolean }) {
  const api = usePlattformApi();
  const { data } = useQuery({
    queryKey: vertretungenSchluessel(zugang.access_id),
    queryFn: () => api.ladeMeineVertretungen(zugang.access_id),
  });
  if (!data || data.length === 0) return null;
  const titel =
    zugang.access_kind === 'self'
      ? `Wer für Sie Zugang hat${mehrere ? ` – ${BEREICHSNAME[zugang.relationship_kind]}` : ''}`
      : `Wer für ${zugang.represented_name ?? 'die Person'} Zugang hat`;
  return (
    <Section titel={titel}>
      <ListRows>
        {data.map((v) => (
          <VertretungZeile key={v.access_id} zugangId={zugang.access_id} vertretung={v} />
        ))}
      </ListRows>
    </Section>
  );
}

function VertretungZeile({
  zugangId,
  vertretung: v,
}: {
  zugangId: string;
  vertretung: MeineVertretung;
}) {
  const api = usePlattformApi();
  const nurLesen = useNurLesen();
  const queryClient = useQueryClient();
  const beenden = useMutation({
    mutationFn: () => api.begleitungBeenden(zugangId, v.access_id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: vertretungenSchluessel(zugangId) }),
  });
  const art =
    v.access_kind === 'legal_representative' && v.legal_basis
      ? `${VERTRETUNGSART.legal_representative} (${RECHTSGRUNDLAGE[v.legal_basis]})`
      : VERTRETUNGSART[v.access_kind];
  return (
    // Eine Zeile wie `ListRow`, die Rückfrage darunter: Sie öffnet sich an
    // Ort und Stelle und braucht die volle Breite - neben dem Namen wäre sie
    // am Telefon zu schmal.
    <li className="border-line border-t py-3 first:border-t-0">
      <p className="text-ink text-base font-semibold">{v.representative_name}</p>
      <p className="text-ink-muted text-sm">
        {art}
        {v.status === 'invited' ? ' · eingeladen' : v.status === 'locked' ? ' · gesperrt' : ''}
      </p>
      {v.can_end ? (
        // E-001: Beenden kann nur die Person selbst - in der Einsicht fehlt der Knopf.
        nurLesen ? null : (
          <div className="mt-2">
            <Rueckfrage
              ausloeser="Begleitung beenden"
              ausloeserVariante="quiet"
              bestaetigen="Begleitung beenden"
              bestaetigenLaeuft="Wird beendet …"
              fehler={beenden.error?.message}
              onBestaetigen={() => beenden.mutateAsync()}
            >
              <p>
                {v.representative_name} sieht ab sofort nichts mehr. Damit widerrufen Sie Ihre
                Einwilligung. Eine neue Begleitung richtet die Praxis ein.
              </p>
            </Rueckfrage>
          </div>
        )
      ) : (
        <p className="text-ink-muted mt-1 text-sm">Beenden kann diese Vertretung nur die Praxis.</p>
      )}
    </li>
  );
}
