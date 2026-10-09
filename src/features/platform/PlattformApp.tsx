import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, Navigate, Route, Routes, useLocation, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Section } from '@/components/ui/Section';
import { Textlink } from '@/components/ui/Textlink';
import { Wortmarke } from '@/components/ui/Wortmarke';
import { RECHTSGRUNDLAGE, VERTRETUNGSART } from '@/lib/vertretung';
import {
  BEREICHSNAME,
  aboSchluessel,
  begleitungBeenden,
  einstiegSchluessel,
  ladeAbo,
  ladeEinstieg,
  ladeMeinePakete,
  ladeMeineVertretungen,
  ladeVertrag,
  paketeSchluessel,
  ueberallAbmelden,
  vertragSchluessel,
  vertretungenSchluessel,
  type MeineVertretung,
  type Plattformzugang,
} from './api';
import { Abo } from './Abo';
import { Angebot } from './Angebot';
import { Vertrag } from './Vertrag';
import { Paket } from './Paket';
import { Befundbogen } from './Befundbogen';
import { Dokumente } from './Dokumente';
import { Datenexport } from './Datenexport';
import { Einstieg } from './Einstieg';
import { Einstellungen } from './Einstellungen';
import { Einwilligungen } from './Einwilligungen';
import { PLATTFORM_PFAD } from './pfade';
import { Rechnung, Rechnungen } from './Rechnungen';
import { useSchriftgroesseAnwenden } from './schriftgroesse';
import { Termine } from './Termine';
import { NachrichtDetail, Nachrichten, NeueNachricht } from './Nachrichten';
import { Uebersicht } from './Uebersicht';
import { PlanblattPlattform, Uebungen } from './Uebungen';
import { Durchfuehrung } from './Durchfuehrung';
import { datum, kalendertag } from './zeit';
import { Terminaenderung } from './Terminaenderung';
import { Terminwunsch } from './Terminwunsch';

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
  const exportierbar = entscheidend.filter((z) => z.readable);
  const praxis = zugaenge[0]?.organization_name ?? '';
  // POR-020 (ANN-267): Schriftgröße des Geräts; mindestens 18 px am Gerüst.
  useSchriftgroesseAnwenden();

  return (
    <div className="plattform-schrift bg-canvas flex min-h-dvh flex-col">
      <Kopf praxis={praxis} bereiche={lesbar} />
      <HandelnFuer bereiche={lesbar} />
      <main
        id="inhalt"
        tabIndex={-1}
        className="mx-auto w-full max-w-xl flex-1 px-5 pt-5 pb-28 focus:outline-none"
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
                    <UebersichtOderEinstieg
                      praxis={praxis}
                      zugang={z}
                      eigeneBereiche={lesbar.filter((x) => x.access_kind === 'self').length}
                    />
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
                seite={(z) => <Terminaenderung zugang={z} />}
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
                onAbmelden={onAbmelden}
              />
            }
          />
          <Route path="*" element={<Navigate to={PLATTFORM_PFAD} replace />} />
        </Routes>
      </main>
      <Reiterleiste bereiche={lesbar} />
    </div>
  );
}

/**
 * POR-019: Steht der Einstieg für den gewählten Zugang aus, kommt er vor der
 * Übersicht - sonst die Übersicht. Lädt der Stand nicht, gilt die Übersicht:
 * Ein Einstieg darf nie den Zugang zu den eigenen Daten versperren.
 */
function UebersichtOderEinstieg({
  praxis,
  zugang,
  eigeneBereiche,
}: {
  praxis: string;
  zugang: Plattformzugang;
  eigeneBereiche: number;
}) {
  const einstieg = useQuery({
    queryKey: einstiegSchluessel(zugang.access_id),
    queryFn: () => ladeEinstieg(zugang.access_id),
    retry: false,
  });
  if (einstieg.isPending) return null;
  if (einstieg.data?.pending) return <Einstieg zugang={zugang} praxis={praxis} />;
  return <Uebersicht praxis={praxis} zugang={zugang} eigeneBereiche={eigeneBereiche} />;
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
 * Welcher Zugang gewählt ist. Steht in der Adresse, damit Zurück und
 * Neuladen ihn behalten: ein eigener Bereich als `?bereich=training`, eine
 * Vertretung als `?zugang=<Kennung>`; ohne Angabe der erste lesbare. Gewählt
 * wird nur unter den eigenen Zugängen - der Server zeigt ohnehin nur diese
 * (Punkt 19).
 */
function useWahl(bereiche: Plattformzugang[]): Plattformzugang | null {
  const [suche] = useSearchParams();
  const zugang = suche.get('zugang');
  const bereich = suche.get('bereich');
  return (
    bereiche.find((z) => z.access_id === zugang) ??
    bereiche.find((z) => z.access_kind === 'self' && z.relationship_kind === bereich) ??
    bereiche[0] ??
    null
  );
}

/** Die Adresse eines Zugangs im Schalter. */
function wahlAdresse(z: Plattformzugang): string {
  return z.access_kind === 'self'
    ? `${PLATTFORM_PFAD}?bereich=${z.relationship_kind}`
    : `${PLATTFORM_PFAD}?zugang=${z.access_id}`;
}

/** Die Beschriftung im Schalter: der eigene Bereich oder „Für …". */
function wahlName(z: Plattformzugang): string {
  if (z.access_kind === 'self') return BEREICHSNAME[z.relationship_kind];
  return `Für ${z.represented_name ?? 'eine andere Person'}`;
}

/** Seiten, die je Bereich etwas anderes zeigen - dort steht der Schalter (D6). */
const MIT_SCHALTER = new Set([
  PLATTFORM_PFAD,
  `${PLATTFORM_PFAD}/termine`,
  `${PLATTFORM_PFAD}/rechnungen`,
]);

function Kopf({ praxis, bereiche }: { praxis: string; bereiche: Plattformzugang[] }) {
  const { pathname } = useLocation();
  const gewaehlt = useWahl(bereiche);
  return (
    <header className="nicht-drucken border-line bg-surface border-b">
      <div className="mx-auto flex max-w-xl items-center justify-between gap-3 px-5 py-2">
        <Link
          to={PLATTFORM_PFAD}
          className="rounded-button inline-flex min-h-11 items-center"
          aria-label={praxis ? `Übersicht – ${praxis}` : 'Übersicht'}
        >
          <Wortmarke hoehe={28} />
        </Link>
        <Link
          to={`${PLATTFORM_PFAD}/ich`}
          aria-current={pathname === `${PLATTFORM_PFAD}/ich` ? 'page' : undefined}
          className="text-ink hover:text-accent aria-[current=page]:text-accent aria-[current=page]:border-accent inline-flex min-h-11 items-center gap-2 border-b-2 border-transparent px-2 text-base font-medium whitespace-nowrap"
        >
          <span
            aria-hidden="true"
            className="bg-accent-soft text-accent rounded-pill inline-flex size-8 items-center justify-center"
          >
            <svg
              viewBox="0 0 24 24"
              className="size-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
            </svg>
          </span>
          Ich
        </Link>
      </div>
      {/* D6: der Schalter nur bei zwei lesbaren Zugängen - eigene Bereiche
          und Vertretungen (POR-006). */}
      {bereiche.length > 1 && MIT_SCHALTER.has(pathname) ? (
        <nav aria-label="Bereich" className="mx-auto max-w-xl px-5 pb-3">
          <ul className="bg-surface-sunken rounded-button flex flex-wrap gap-1 p-1">
            {bereiche.map((z) => (
              // POR-020: Bei 200 % am Telefon stehen die Bereiche untereinander,
              // statt mitten im Wort zu trennen.
              <li key={z.access_id} className="min-w-0 flex-1 max-[23rem]:basis-full">
                <Link
                  to={wahlAdresse(z)}
                  replace
                  aria-current={gewaehlt?.access_id === z.access_id ? 'page' : undefined}
                  className="text-ink-muted aria-[current=page]:bg-surface aria-[current=page]:text-ink rounded-button flex min-h-11 items-center justify-center px-3 text-center text-base font-medium"
                >
                  {wahlName(z)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
    </header>
  );
}

/**
 * „Sie handeln für …" (ADR-023 Punkt 14, DSN-001 Abschnitt 10): dauerhaft
 * über dem Inhalt, solange eine Vertretung gewählt ist. Unter „Ich" steht es
 * nicht - dort geht es um das eigene Konto.
 */
function HandelnFuer({ bereiche }: { bereiche: Plattformzugang[] }) {
  const { pathname } = useLocation();
  const gewaehlt = useWahl(bereiche);
  if (!gewaehlt || gewaehlt.access_kind === 'self' || pathname === `${PLATTFORM_PFAD}/ich`) {
    return null;
  }
  return (
    <div role="status" className="bg-accent text-surface">
      <p className="mx-auto max-w-xl px-5 py-2 text-base">
        Sie handeln für <strong>{gewaehlt.represented_name ?? 'eine andere Person'}</strong>
        <span className="opacity-90"> · {VERTRETUNGSART[gewaehlt.access_kind]}</span>
      </p>
    </div>
  );
}

/** Gesperrt oder Lesefrist vorbei: sagen, was los ist (§13), und nur „Ich" anbieten (D2). */
function OhneLesbarenZugang({ zugaenge }: { zugaenge: Plattformzugang[] }) {
  const gesperrt = zugaenge.some((z) => z.status === 'locked');
  return (
    <>
      <h1 className="text-accent text-h3 font-bold">
        {gesperrt ? 'Ihr Zugang ist gesperrt' : 'Ihr Zugang ist beendet'}
      </h1>
      <p className="text-ink mt-2 max-w-prose text-base leading-relaxed">
        {gesperrt
          ? 'Hier ist gerade nichts zu sehen. Bitte wenden Sie sich an die Praxis.'
          : 'Die Zeit, in der Sie hier noch lesen konnten, ist abgelaufen. Unter „Ich" können Sie Einwilligungen widerrufen und sich abmelden.'}
      </p>
    </>
  );
}

/**
 * „Ich" (DSN-001 Abschnitt 3): das Konto, die Abmeldung und - seit POR-007 -
 * wer für die Person Zugang hat (ADR-023 Punkt 14). Rechnungen, Dokumente,
 * Einwilligungen und Einstellungen kommen mit POR-EPIC-002 und -003.
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
  // Die Person selbst und eine rechtliche Vertretung sehen, wer Zugang hat;
  // eine Begleitung nicht. Verbindlich ist der Server (manage_companions).
  const mitVertretungen = zugaenge.filter((z) => z.access_kind !== 'companion');
  const [fehler, setFehler] = useState<string | undefined>(undefined);
  return (
    <>
      <h1 className="text-accent text-h3 font-bold">Ich</h1>
      <Section titel="Konto" rahmen>
        <p className="text-ink text-base">
          Angemeldet als <span className="font-medium wrap-anywhere">{email ?? 'Ihr Konto'}</span>
        </p>
        {praxis ? <p className="text-ink-muted mt-1 text-sm">Zugang von {praxis}</p> : null}
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <Button onClick={onAbmelden}>Abmelden</Button>
          <Rueckfrage
            ausloeser="Überall abmelden"
            bestaetigen="Überall abmelden"
            bestaetigenLaeuft="Wird abgemeldet …"
            fehler={fehler}
            onBestaetigen={() =>
              ueberallAbmelden().catch((grund: Error) => {
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
      </Section>
      {/* POR-013/014: Rechnungen und Dokumente je Bereich. Ob
          eine Begleitung Rechnungen sieht, entscheidet der Server (billing). */}
      {zugaenge.length > 0 ? (
        <Section titel="Unterlagen" rahmen>
          <ul className="flex flex-col gap-2">
            {zugaenge.map((z) => (
              <li key={z.access_id} className="flex flex-col gap-2">
                <Textlink
                  alleinstehend
                  to={`${PLATTFORM_PFAD}/rechnungen?${wahlAdresse(z).split('?')[1] ?? ''}`}
                >
                  Rechnungen
                  {zugaenge.length > 1 ? ` – ${wahlName(z)}` : ''}
                </Textlink>
                {/* POR-014: Dokumente gibt es nur in der Behandlung. */}
                {z.relationship_kind === 'treatment' ? (
                  <Textlink
                    alleinstehend
                    to={`${PLATTFORM_PFAD}/dokumente?${wahlAdresse(z).split('?')[1] ?? ''}`}
                  >
                    Dokumente
                    {zugaenge.length > 1 ? ` – ${wahlName(z)}` : ''}
                  </Textlink>
                ) : null}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
      {/* ANG-003: das Nachsorge-Abo je Behandlungszugang; ohne Abo steht nichts. */}
      {zugaenge
        .filter((z) => z.relationship_kind === 'treatment')
        .map((z) => (
          <AboKurz key={z.access_id} zugang={z} mehrere={zugaenge.length > 1} />
        ))}
      {/* ANG-008: Paket und Preise je Trainingszugang (IDEA-ANG-004). */}
      {zugaenge
        .filter((z) => z.relationship_kind === 'training')
        .map((z) => (
          <PaketKurz key={z.access_id} zugang={z} mehrere={zugaenge.length > 1} />
        ))}
      {/* KND-003: der im Konto geschlossene Trainingsvertrag; ohne ihn nichts. */}
      {zugaenge
        .filter((z) => z.relationship_kind === 'training')
        .map((z) => (
          <VertragKurz key={z.access_id} zugang={z} mehrere={zugaenge.length > 1} />
        ))}
      {/* POR-016: Einwilligungen je Zugang - die eigenen und die einer
          rechtlichen Vertretung, nie die einer Begleitung. */}
      {entscheidend.length > 0 ? (
        <Section titel="Einwilligungen und Daten" rahmen>
          <ul className="flex flex-col gap-2">
            {entscheidend.map((z) => (
              <li key={z.access_id} className="flex flex-col gap-2">
                <Textlink
                  alleinstehend
                  to={`${PLATTFORM_PFAD}/einwilligungen?${wahlAdresse(z).split('?')[1] ?? ''}`}
                >
                  Einwilligungen
                  {entscheidend.length > 1 ? ` – ${wahlName(z)}` : ''}
                </Textlink>
                {/* POR-018 (ANN-261): der Export nur in der Lesezeit. */}
                {z.readable ? (
                  <Textlink
                    alleinstehend
                    to={`${PLATTFORM_PFAD}/daten?${wahlAdresse(z).split('?')[1] ?? ''}`}
                  >
                    Meine Daten herunterladen
                    {entscheidend.length > 1 ? ` – ${wahlName(z)}` : ''}
                  </Textlink>
                ) : (
                  <p className="text-ink-muted text-sm">
                    Ihre Daten{entscheidend.length > 1 ? ` (${wahlName(z)})` : ''} bekommen Sie
                    jetzt bei der Praxis.
                  </p>
                )}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
      {/* POR-020: Schriftgröße und was die Praxis eingestellt hat. */}
      <Section titel="Einstellungen" rahmen>
        <Textlink alleinstehend to={`${PLATTFORM_PFAD}/einstellungen`}>
          Schriftgröße und Einstellungen
        </Textlink>
      </Section>
      {mitVertretungen.map((z) => (
        <WerZugangHat key={z.access_id} zugang={z} mehrere={mitVertretungen.length > 1} />
      ))}
      <Section titel="Gut zu wissen">
        <p className="text-ink-muted max-w-prose text-sm leading-relaxed">
          Ihr Zugang gehört nur Ihnen. Bitte geben Sie Adresse und Kennwort nicht weiter.
          Angehörige, die Ihnen helfen, bekommen von der Praxis einen eigenen Zugang.
        </p>
      </Section>
    </>
  );
}

/**
 * Der Abo-Stand unter „Ich" (ANG-003, DSN-001 4.2): seit wann, bis wann, und
 * der Weg zum Kündigen. Ohne Abo – oder ohne Recht, es zu sehen – bleibt der
 * Abschnitt weg.
 */
function AboKurz({ zugang, mehrere }: { zugang: Plattformzugang; mehrere: boolean }) {
  const { data } = useQuery({
    queryKey: aboSchluessel(zugang.access_id),
    queryFn: () => ladeAbo(zugang.access_id),
  });
  if (!data) return null;
  const titel = `Nachsorge-Abo${mehrere ? ` – ${wahlName(zugang)}` : ''}`;
  return (
    <Section titel={titel} rahmen>
      <p className="text-ink text-base">
        {data.state === 'running'
          ? data.starts_on > kalendertag(new Date())
            ? `Beginnt am ${datum(data.starts_on)}.`
            : `Läuft seit ${datum(data.starts_on)}.`
          : data.state === 'ending'
            ? `Gekündigt, endet am ${datum(data.ends_on ?? '')}.`
            : `Beendet am ${datum(data.ends_on ?? '')}.`}
      </p>
      <div className="mt-2">
        <Textlink
          alleinstehend
          to={`${PLATTFORM_PFAD}/abo?${wahlAdresse(zugang).split('?')[1] ?? ''}`}
        >
          {data.state === 'running' && data.can_cancel
            ? 'Abo ansehen oder kündigen'
            : 'Abo ansehen'}
        </Textlink>
      </div>
    </Section>
  );
}

/**
 * Das Trainingspaket unter „Ich" (ANG-008, PROJECT_PRINCIPLES.md 4.10): ein
 * laufendes Paket in einem Satz, und immer der Weg zu Paket und Preisen –
 * die Preise stehen da, bevor jemand fragt (IDEA-ANG-004). Den eigenen Stand
 * sieht nur, wer Rechnungen sieht; das sagt der Server.
 */
function PaketKurz({ zugang, mehrere }: { zugang: Plattformzugang; mehrere: boolean }) {
  const { data } = useQuery({
    queryKey: paketeSchluessel(zugang.access_id),
    queryFn: () => ladeMeinePakete(zugang.access_id),
  });
  const aktuell = data?.find((k) => k.state !== 'ended');
  const titel = `Trainingspaket${mehrere ? ` – ${wahlName(zugang)}` : ''}`;
  return (
    <Section titel={titel} rahmen>
      {aktuell ? (
        <p className="text-ink text-base">
          {aktuell.state === 'planned'
            ? `Beginnt am ${datum(aktuell.starts_on)}.`
            : `Läuft bis ${datum(aktuell.ends_on)}.`}
        </p>
      ) : null}
      <div className={aktuell ? 'mt-2' : undefined}>
        <Textlink
          alleinstehend
          to={`${PLATTFORM_PFAD}/paket?${wahlAdresse(zugang).split('?')[1] ?? ''}`}
        >
          {aktuell ? 'Paket und Preise ansehen' : 'Pakete und Preise ansehen'}
        </Textlink>
      </div>
    </Section>
  );
}

/**
 * Der Trainingsvertrag unter „Ich" (KND-003): gebucht am, und der Weg zur
 * Bestätigung - solange die Frist läuft, auch zum Widerruf (KND-004). Ohne
 * Vertrag im Konto bleibt der Abschnitt weg.
 */
function VertragKurz({ zugang, mehrere }: { zugang: Plattformzugang; mehrere: boolean }) {
  const { data } = useQuery({
    queryKey: vertragSchluessel(zugang.access_id),
    queryFn: () => ladeVertrag(zugang.access_id),
  });
  if (!data) return null;
  const titel = `Trainingsvertrag${mehrere ? ` – ${wahlName(zugang)}` : ''}`;
  return (
    <Section titel={titel} rahmen>
      <p className="text-ink text-base">
        Gebucht am {datum(data.concluded_at)}.
        {data.withdrawn_at
          ? ` Widerrufen am ${datum(data.withdrawn_at)}.`
          : data.can_withdraw
            ? ` Widerruf möglich bis ${datum(data.withdrawal_ends_on)}.`
            : ''}
      </p>
      <div className="mt-2">
        <Textlink
          alleinstehend
          to={`${PLATTFORM_PFAD}/vertrag?${wahlAdresse(zugang).split('?')[1] ?? ''}`}
        >
          {data.can_withdraw
            ? 'Vertrag ansehen oder widerrufen'
            : 'Vertrag und Bestätigung ansehen'}
        </Textlink>
      </div>
    </Section>
  );
}

/**
 * Wer für die Person Zugang hat (POR-007). Ohne Vertretung steht hier nichts:
 * Ein leerer Wert bekommt keine Zeile. Eine Begleitung beendet die Person
 * selbst - das ist der Widerruf ihrer Einwilligung. Eine rechtliche
 * Vertretung beendet nur die Praxis.
 */
function WerZugangHat({ zugang, mehrere }: { zugang: Plattformzugang; mehrere: boolean }) {
  const { data } = useQuery({
    queryKey: vertretungenSchluessel(zugang.access_id),
    queryFn: () => ladeMeineVertretungen(zugang.access_id),
  });
  if (!data || data.length === 0) return null;
  const titel =
    zugang.access_kind === 'self'
      ? `Wer für Sie Zugang hat${mehrere ? ` – ${BEREICHSNAME[zugang.relationship_kind]}` : ''}`
      : `Wer für ${zugang.represented_name ?? 'die Person'} Zugang hat`;
  return (
    <Section titel={titel} rahmen>
      <ul className="flex flex-col gap-4">
        {data.map((v) => (
          <VertretungZeile key={v.access_id} zugangId={zugang.access_id} vertretung={v} />
        ))}
      </ul>
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
  const queryClient = useQueryClient();
  const beenden = useMutation({
    mutationFn: () => begleitungBeenden(zugangId, v.access_id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: vertretungenSchluessel(zugangId) }),
  });
  const art =
    v.access_kind === 'legal_representative' && v.legal_basis
      ? `${VERTRETUNGSART.legal_representative} (${RECHTSGRUNDLAGE[v.legal_basis]})`
      : VERTRETUNGSART[v.access_kind];
  return (
    <li>
      <p className="text-ink text-base font-medium">{v.representative_name}</p>
      <p className="text-ink-muted text-sm">
        {art}
        {v.status === 'invited' ? ' · eingeladen' : v.status === 'locked' ? ' · gesperrt' : ''}
      </p>
      {v.can_end ? (
        <div className="mt-2">
          <Rueckfrage
            ausloeser="Begleitung beenden"
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
      ) : (
        <p className="text-ink-muted mt-1 text-sm">Beenden kann diese Vertretung nur die Praxis.</p>
      )}
    </li>
  );
}

/**
 * Die Reiterleiste unten (DSN-001 Abschnitt 3): höchstens fünf, jeder mit
 * Symbol und Wort. Ein Reiter erscheint erst mit dem Loop, der ihn füllt
 * (ANN-112): Übersicht, Termine (POR-008), Übungen bzw. Training (UEB-009),
 * Nachrichten (KOM-001).
 */
// KOM-001: vier Reiter bei 375 px - das Wort bricht nie um („Nachrichten").
const REITER =
  'text-ink-muted aria-[current=page]:text-accent aria-[current=page]:border-accent flex min-h-14 flex-col items-center justify-center gap-0.5 border-t-3 border-transparent px-0.5 text-xs whitespace-nowrap aria-[current=page]:font-semibold';

function Reiterleiste({ bereiche }: { bereiche: Plattformzugang[] }) {
  const { pathname, search } = useLocation();
  // DSN-001 Abschnitt 5: im Training heißt der Reiter „Training", weil dort
  // Einheiten und Plan zusammenkommen.
  const training = useWahl(bereiche)?.relationship_kind === 'training';
  return (
    <nav
      aria-label="Plattform"
      className="border-line bg-surface/95 fixed inset-x-0 bottom-0 z-30 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <ul className="mx-auto flex max-w-xl">
        <li className="flex-1">
          <Link
            to={`${PLATTFORM_PFAD}${search}`}
            aria-current={pathname === PLATTFORM_PFAD ? 'page' : undefined}
            className={REITER}
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="size-6"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />
            </svg>
            Übersicht
          </Link>
        </li>
        <li className="flex-1">
          <Link
            to={`${PLATTFORM_PFAD}/termine${search}`}
            aria-current={pathname.startsWith(`${PLATTFORM_PFAD}/termine`) ? 'page' : undefined}
            className={REITER}
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="size-6"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <rect x="3" y="5" width="18" height="16" rx="2" />
              <path d="M3 10h18M8 3v4M16 3v4" />
            </svg>
            Termine
          </Link>
        </li>
        <li className="flex-1">
          <Link
            to={`${PLATTFORM_PFAD}/uebungen${search}`}
            aria-current={pathname.startsWith(`${PLATTFORM_PFAD}/uebungen`) ? 'page' : undefined}
            className={REITER}
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="size-6"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M6.5 6.5v11M17.5 6.5v11M3 9.5v5M21 9.5v5M6.5 12h11" />
            </svg>
            {training ? 'Training' : 'Übungen'}
          </Link>
        </li>
        <li className="flex-1">
          <Link
            to={`${PLATTFORM_PFAD}/nachrichten${search}`}
            aria-current={pathname.startsWith(`${PLATTFORM_PFAD}/nachrichten`) ? 'page' : undefined}
            className={REITER}
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="size-6"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-5 4V6a1 1 0 0 1 1-1z" />
            </svg>
            Nachrichten
          </Link>
        </li>
      </ul>
    </nav>
  );
}
