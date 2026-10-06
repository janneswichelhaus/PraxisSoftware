import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, Navigate, Route, Routes, useLocation, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Wortmarke } from '@/components/ui/Wortmarke';
import { RECHTSGRUNDLAGE, VERTRETUNGSART } from '@/lib/vertretung';
import {
  BEREICHSNAME,
  begleitungBeenden,
  ladeMeineVertretungen,
  ueberallAbmelden,
  vertretungenSchluessel,
  type MeineVertretung,
  type Plattformzugang,
} from './api';
import { PLATTFORM_PFAD } from './pfade';
import { Termine } from './Termine';
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
 * Dokumente liegen unter „Ich".
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
  const praxis = zugaenge[0]?.organization_name ?? '';

  return (
    <div className="bg-canvas flex min-h-dvh flex-col">
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
                <Uebersicht praxis={praxis} bereiche={lesbar} />
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
            path={`${PLATTFORM_PFAD}/ich`}
            element={
              <Ich email={email} praxis={praxis} zugaenge={lesbar} onAbmelden={onAbmelden} />
            }
          />
          <Route path="*" element={<Navigate to={PLATTFORM_PFAD} replace />} />
        </Routes>
      </main>
      <Reiterleiste />
    </div>
  );
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
const MIT_SCHALTER = new Set([PLATTFORM_PFAD, `${PLATTFORM_PFAD}/termine`]);

function Kopf({ praxis, bereiche }: { praxis: string; bereiche: Plattformzugang[] }) {
  const { pathname } = useLocation();
  const gewaehlt = useWahl(bereiche);
  return (
    <header className="border-line bg-surface border-b">
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
          className="text-ink hover:text-accent aria-[current=page]:text-accent aria-[current=page]:border-accent inline-flex min-h-11 items-center gap-2 border-b-2 border-transparent px-2 text-base font-medium"
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
              <li key={z.access_id} className="min-w-0 flex-1">
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

/**
 * Die Übersicht - „Was ist jetzt dran?" (DSN-001 Abschnitt 3).
 *
 * Heute ohne Inhalt aus dem Verhältnis: Termine, Rechnungen und Dokumente
 * kommen mit POR-EPIC-002. Kein „kommt bald" (ANN-112): Die Seite sagt, was
 * gilt, und wie die Person die Praxis erreicht.
 */
function Uebersicht({ praxis, bereiche }: { praxis: string; bereiche: Plattformzugang[] }) {
  const zugang = useWahl(bereiche);
  const eigen = zugang?.access_kind === 'self';
  const name = zugang?.represented_name ?? 'die Person';
  const bereich = zugang ? BEREICHSNAME[zugang.relationship_kind] : null;
  const eigeneBereiche = bereiche.filter((z) => z.access_kind === 'self');
  return (
    <>
      <h1 className="text-accent text-h3 font-bold">Guten Tag</h1>
      {eigen ? (
        <p className="text-ink mt-2 text-base leading-relaxed">
          Sie sind bei {praxis || 'Ihrer Praxis'} angemeldet
          {eigeneBereiche.length > 1 && bereich ? ` – Bereich ${bereich}` : ''}.
        </p>
      ) : (
        <p className="text-ink mt-2 text-base leading-relaxed">
          Sie sehen hier, was {praxis || 'die Praxis'} für {name} bereitstellt.{' '}
          {zugang?.access_kind === 'companion'
            ? `Als Begleitung lesen Sie mit und können Terminwünsche und Nachrichten schreiben. Einwilligungen gibt nur ${name} selbst.`
            : `Als rechtliche Vertretung handeln Sie in allem, was ${name} hier tun kann.`}
        </p>
      )}
      {zugang?.read_until ? (
        <Statusmeldung className="mt-4" ton="warnung">
          {eigen
            ? `Ihre ${zugang.relationship_kind === 'training' ? 'Trainingszeit' : 'Behandlung'} ist beendet. Sie können hier noch bis ${datum(zugang.read_until)} lesen.`
            : `Ihr Zugang für ${name} endet am ${datum(zugang.read_until)}.`}
        </Statusmeldung>
      ) : null}
      <Section titel="Fragen an die Praxis">
        <p className="text-ink max-w-prose text-base leading-relaxed">
          Wenden Sie sich bitte wie gewohnt direkt an die Praxis. In einem Notfall rufen Sie 112 an.
        </p>
      </Section>
    </>
  );
}

function datum(wert: string): string {
  return new Date(wert).toLocaleDateString('de-DE');
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
          : 'Die Zeit, in der Sie hier noch lesen konnten, ist abgelaufen. Unter „Ich" können Sie sich abmelden.'}
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
  onAbmelden,
}: {
  email: string | undefined;
  praxis: string;
  zugaenge: Plattformzugang[];
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
          Angemeldet als <span className="font-medium">{email ?? 'Ihr Konto'}</span>
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
 * Symbol und Wort. Heute steht nur die Übersicht - ein Reiter erscheint erst
 * mit dem Loop, der ihn füllt (ANN-112).
 */
const REITER =
  'text-ink-muted aria-[current=page]:text-accent aria-[current=page]:border-accent flex min-h-14 flex-col items-center justify-center gap-0.5 border-t-3 border-transparent px-1 text-xs aria-[current=page]:font-semibold';

function Reiterleiste() {
  const { pathname, search } = useLocation();
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
            aria-current={pathname === `${PLATTFORM_PFAD}/termine` ? 'page' : undefined}
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
      </ul>
    </nav>
  );
}
