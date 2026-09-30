import { useState } from 'react';
import { Link, Navigate, Route, Routes, useLocation, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Wortmarke } from '@/components/ui/Wortmarke';
import { BEREICHSNAME, ueberallAbmelden, type Bereich, type Plattformzugang } from './api';

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
 */
export const PLATTFORM_PFAD = '/p';

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
            path={`${PLATTFORM_PFAD}/ich`}
            element={<Ich email={email} praxis={praxis} onAbmelden={onAbmelden} />}
          />
          <Route path="*" element={<Navigate to={PLATTFORM_PFAD} replace />} />
        </Routes>
      </main>
      <Reiterleiste />
    </div>
  );
}

/**
 * Welcher Bereich gewählt ist. Steht in der Adresse (`?bereich=training`),
 * damit Zurück und Neuladen ihn behalten; ohne Angabe der erste lesbare.
 * Gewählt wird nur unter den eigenen Zugängen - der Server zeigt ohnehin nur
 * diese (Punkt 19).
 */
function useBereich(bereiche: Plattformzugang[]): Bereich | null {
  const [suche] = useSearchParams();
  const gewuenscht = suche.get('bereich');
  const treffer = bereiche.find((z) => z.relationship_kind === gewuenscht);
  return (treffer ?? bereiche[0])?.relationship_kind ?? null;
}

function Kopf({ praxis, bereiche }: { praxis: string; bereiche: Plattformzugang[] }) {
  const { pathname } = useLocation();
  const gewaehlt = useBereich(bereiche);
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
            className="bg-accent-soft text-accent inline-flex size-8 items-center justify-center rounded-full"
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
      {/* D6: der Schalter nur bei zwei Verhältnissen mit lesbarem Zugang. */}
      {bereiche.length > 1 && pathname === PLATTFORM_PFAD ? (
        <nav aria-label="Bereich" className="mx-auto max-w-xl px-5 pb-3">
          <ul className="bg-surface-sunken rounded-button flex gap-1 p-1">
            {bereiche.map((z) => (
              <li key={z.access_id} className="flex-1">
                <Link
                  to={`${PLATTFORM_PFAD}?bereich=${z.relationship_kind}`}
                  replace
                  aria-current={gewaehlt === z.relationship_kind ? 'page' : undefined}
                  className="text-ink-muted aria-[current=page]:bg-surface aria-[current=page]:text-ink rounded-button flex min-h-11 items-center justify-center px-3 text-base font-medium aria-[current=page]:shadow-sm"
                >
                  {BEREICHSNAME[z.relationship_kind]}
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
 * Die Übersicht - „Was ist jetzt dran?" (DSN-001 Abschnitt 3).
 *
 * Heute ohne Inhalt aus dem Verhältnis: Termine, Rechnungen und Dokumente
 * kommen mit POR-EPIC-002. Kein „kommt bald" (ANN-112): Die Seite sagt, was
 * gilt, und wie die Person die Praxis erreicht.
 */
function Uebersicht({ praxis, bereiche }: { praxis: string; bereiche: Plattformzugang[] }) {
  const gewaehlt = useBereich(bereiche);
  const zugang = bereiche.find((z) => z.relationship_kind === gewaehlt);
  return (
    <>
      <h1 className="text-accent text-h3 font-bold">Guten Tag</h1>
      <p className="text-ink mt-2 text-base leading-relaxed">
        Sie sind bei {praxis || 'Ihrer Praxis'} angemeldet
        {bereiche.length > 1 && gewaehlt ? ` – Bereich ${BEREICHSNAME[gewaehlt]}` : ''}.
      </p>
      {zugang?.read_until ? (
        <Statusmeldung className="mt-4" ton="warnung">
          Ihre {gewaehlt === 'training' ? 'Trainingszeit' : 'Behandlung'} ist beendet. Sie können
          hier noch bis {new Date(zugang.read_until).toLocaleDateString('de-DE')} lesen.
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
 * „Ich" (DSN-001 Abschnitt 3): heute das Konto und die Abmeldung. Rechnungen,
 * Dokumente, Einwilligungen und Einstellungen kommen mit POR-EPIC-002 und -003.
 */
function Ich({
  email,
  praxis,
  onAbmelden,
}: {
  email: string | undefined;
  praxis: string;
  onAbmelden: () => void;
}) {
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
 * Die Reiterleiste unten (DSN-001 Abschnitt 3): höchstens fünf, jeder mit
 * Symbol und Wort. Heute steht nur die Übersicht - ein Reiter erscheint erst
 * mit dem Loop, der ihn füllt (ANN-112).
 */
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
            className="text-ink-muted aria-[current=page]:text-accent aria-[current=page]:border-accent flex min-h-14 flex-col items-center justify-center gap-0.5 border-t-3 border-transparent px-1 text-xs aria-[current=page]:font-semibold"
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
      </ul>
    </nav>
  );
}
