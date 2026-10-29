import { useId, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { EINGABETEXTE, useTextverlustschutz } from '@/app/Textverlustschutz';
import { useIstVerbunden } from '@/app/verbindung';
import { Angabefeld } from '@/components/ui/Angabefeld';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { EmptyState, ErrorState } from '@/components/ui/Feedback';
import { BREITE_ABLAUFSPALTE, GefuehrterAblauf } from '@/components/ui/GefuehrterAblauf';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { Skelett, SkelettBereich } from '@/components/ui/Skelett';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { VERBINDUNG_PRUEFEN } from '@/components/ui/abfrageTexte';
import {
  angabeGueltig,
  erfassungsgroesse,
  nurFragen,
  type Erfassungsgroesse,
} from '@/lib/erfassungsgroessen';
import { mitRueckweg } from '@/lib/rueckweg';
import {
  checkinsSchluessel,
  checkinAbsenden,
  ladeCheckins,
  type EigeneCheckins,
  type Plattformzugang,
} from './api';
import { leserIn } from './checkintexte';
import { lesefristSatz } from './hauptsache';
import { useLesefrist } from './lesefrist';
import { NICHT_AKUT } from './nachrichtentexte';
import { Notfallsatz } from './Notfallsatz';
import { PLATTFORM_PFAD, bereichParameter } from './pfade';
import { Verbindungszeile } from './Verbindungszeile';
import { Vertretungsband } from './Vertretungsband';
import { fest, tagFest, tagUndMonat } from './zeit';

/**
 * Der Check-in als geführter Ablauf (Handoff 5.1): freiwillig, nichts vorausgewählt, die letzte
 * Angabe nur als Hinweis (ANN-349), kein Lob und keine Einordnung eines Werts (ADR-006 Punkt 11).
 * Die Antworten liegen nur in der Seite, nie auf dem Gerät.
 */
export function Checkin({ zugang }: { zugang: Plattformzugang }) {
  const [suche] = useSearchParams();
  const bereich = bereichParameter(suche);
  const mit = (pfad: string) => `${pfad}${bereich ? `?${bereich}` : ''}`;
  const zurueck = mit(PLATTFORM_PFAD);
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: checkinsSchluessel(zugang.access_id),
    queryFn: () => ladeCheckins(zugang.access_id),
  });
  const { lesefrist, abo } = useLesefrist(zugang);
  const seiten = data?.schedule ? ablaufseiten(data.schedule.parameter_keys) : [];

  // Der Ablauf öffnet erst mit den Fragen; ob der Zugang antworten darf, sagt der Server. Je
  // Zugang beginnt er neu, ohne die Antworten eines anderen.
  if (data?.can_answer && seiten.length > 0) {
    return (
      <Ablauf
        key={zugang.access_id}
        zugang={zugang}
        daten={data}
        seiten={seiten}
        zurueck={zurueck}
      />
    );
  }

  const laedt = isPending || (abo.isPending && abo.fetchStatus === 'fetching');
  return (
    <>
      <Rueckweg standard={zurueck} beschriftung="Übersicht" />
      <PageHeader title="Check-in" />
      {laedt ? (
        <Ladezustand />
      ) : isError ? (
        <ErrorState
          title="Ihr Check-in konnte nicht geladen werden."
          description={VERBINDUNG_PRUEFEN}
          onErneut={() => void refetch()}
        />
      ) : (
        <Zustand
          zugang={zugang}
          daten={data ?? null}
          seiten={seiten.length}
          lesefrist={lesefrist ? lesefristSatz(zugang, abo.data ?? null) : null}
          mit={mit}
        />
      )}
    </>
  );
}

/** Eine Seite des Ablaufs: eine Hauptfrage, der Zusammenhang oder die Belastung. */
interface Seite {
  kennung: string;
  /** Die Frage, sonst der Name des Abschnitts: Titel und Name des Fensters. */
  titel: string;
  groessen: Erfassungsgroesse[];
  /** Eine Hauptfrage - der Titel ist schon ihre Frage. */
  einzeln: boolean;
}

type Werte = Record<string, number | null>;

/** Je Hauptfrage eine Seite, der Zusammenhang und die Belastung je eine (ANN-790). */
function ablaufseiten(schluessel: readonly string[]): Seite[] {
  const groessen = schluessel
    .map((k) => erfassungsgroesse(k))
    .filter((g): g is Erfassungsgroesse => g !== undefined);
  // Die Belastung außerhalb der Übungen auf einer eigenen Seite (ANN-369).
  const zusammenhang = groessen.filter((g) => g.rolle === 'kontext' && g.gruppe !== 'Aktivität');
  const belastung = groessen.filter((g) => g.rolle === 'kontext' && g.gruppe === 'Aktivität');
  return [
    ...groessen
      .filter((g) => g.rolle === 'frage')
      .map((g) => ({ kennung: g.key, titel: g.frage, groessen: [g], einzeln: true })),
    ...(zusammenhang.length > 0
      ? [
          {
            kennung: 'zusammenhang',
            titel: 'Zum Zusammenhang',
            groessen: zusammenhang,
            einzeln: false,
          },
        ]
      : []),
    ...(belastung.length > 0
      ? [
          {
            kennung: 'belastung',
            titel: 'Außerhalb der Übungen',
            groessen: belastung,
            einzeln: false,
          },
        ]
      : []),
  ];
}

/**
 * Was die Seite zeigt: Dauer und Anstrengung der Belastung erst nach einer Wahl außer der ersten,
 * „nichts Besonderes“ (Handoff 5.1). Was verborgen ist, wird nicht gesendet.
 */
function sichtbar(seite: Seite, werte: Werte): Erfassungsgroesse[] {
  const art = seite.groessen.find((g) => g.key === 'activity_kind');
  if (!art) return seite.groessen;
  const wahl = werte[art.key];
  return seite.groessen.filter(
    (g) => g === art || (wahl !== null && wahl !== undefined && wahl !== art.min),
  );
}

function zuSenden(seiten: readonly Seite[], werte: Werte): Record<string, number> {
  return Object.fromEntries(
    seiten
      .flatMap((s) => sichtbar(s, werte))
      .flatMap((g) => {
        const wert = werte[g.key];
        return wert === null || wert === undefined ? [] : [[g.key, wert] as const];
      }),
  );
}

/** Die erste Zahl außerhalb ihres Bereichs als Satz; die Datenbank prüft verbindlich. */
function pruefen(groessen: readonly Erfassungsgroesse[], werte: Werte): string | null {
  const falsch = groessen.find((g) => {
    const wert = werte[g.key];
    return wert !== null && wert !== undefined && !angabeGueltig(g, wert);
  });
  return falsch
    ? `„${falsch.kurz}“: bitte eine ganze Zahl von ${falsch.min} bis ${falsch.max}.`
    : null;
}

/**
 * Der Tag der letzten Angabe aus dem Verlauf, jüngste zuerst wie `last_values` (Server:
 * `answered_on desc, recorded_at desc`); nur, wenn der Wert dort derselbe ist.
 */
function tagDerLetzten(daten: EigeneCheckins, schluessel: string): string | undefined {
  const eintrag = daten.history.find((e) => e.values[schluessel] !== undefined);
  if (!eintrag || eintrag.values[schluessel] !== daten.last_values[schluessel]) return undefined;
  return fest(tagUndMonat(eintrag.answered_on, new Date(`${daten.today}T12:00:00`)));
}

/** Am Rechner steht der Hauptknopf rechts, so breit wie sein Wort, mindestens 10rem (Handoff 3). */
const KNOPFREIHE = 'flex flex-col [.plattform-schrift[data-rechner]_&]:items-end';
const HAUPTKNOPF =
  'w-full [.plattform-schrift[data-rechner]_&]:w-auto [.plattform-schrift[data-rechner]_&]:min-w-40';
/**
 * Ohne Netz gesperrt, aber mit dem Fokus erreichbar, damit der Satz dazu vorgelesen wird: dasselbe
 * Bild wie ein abgeschalteter Hauptknopf, gestrichelt (ANN-252, ANN-802).
 */
const GESPERRT =
  'aria-disabled:cursor-not-allowed aria-disabled:border-dashed aria-disabled:border-line-strong aria-disabled:bg-transparent aria-disabled:text-ink-muted aria-disabled:hover:bg-transparent [.plattform-schrift_&]:aria-disabled:active:bg-transparent motion-safe:[.plattform-schrift_&]:aria-disabled:active:scale-100';

function Ablauf({
  zugang,
  daten,
  seiten,
  zurueck,
}: {
  zugang: Plattformzugang;
  daten: EigeneCheckins;
  seiten: readonly Seite[];
  zurueck: string;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const verbunden = useIstVerbunden();
  const ohneNetzId = useId();
  const [nummer, setNummer] = useState(0);
  const [werte, setWerte] = useState<Werte>({});
  const [hinweis, setHinweis] = useState<string | null>(null);
  const seite = seiten[Math.min(nummer, seiten.length - 1)]!;
  const letzte = nummer >= seiten.length - 1;
  const beantwortet = Object.values(werte).some((w) => w !== null && w !== undefined);

  const zurueckGehen = nummer > 0 ? () => gehe(nummer - 1) : undefined;
  // „Später“ mit Antworten fragt vorher; die Zurückgeste geht einen Schritt zurück.
  const { freigeben, schutz } = useTextverlustschutz({
    ungespeichert: beantwortet,
    texte: EINGABETEXTE,
    schrittZurueck: zurueckGehen,
    ohneVerbindungZeigen: false,
  });

  const absenden = useMutation({
    mutationFn: (angaben: Record<string, number>) => checkinAbsenden(zugang.access_id, angaben),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: checkinsSchluessel(zugang.access_id) });
      freigeben();
      // Sofort, bevor der neue Stand die Seite zum Zustand „Schon beantwortet“ macht.
      void navigate(`${zurueck}${zurueck.includes('?') ? '&' : '?'}checkin=1`, {
        replace: true,
        flushSync: true,
      });
    },
  });

  function gehe(neu: number) {
    setHinweis(null);
    absenden.reset();
    setNummer(neu);
  }

  function weiter() {
    // „Weiter“ geht auch ohne Antwort; nur eine Zahl außerhalb ihres Bereichs hält an (ANN-791).
    const falsch = pruefen(sichtbar(seite, werte), werte);
    if (falsch) {
      setHinweis(falsch);
      return;
    }
    gehe(nummer + 1);
  }

  function senden() {
    if (!verbunden || absenden.isPending) return;
    const angaben = zuSenden(seiten, werte);
    const falsch = pruefen(
      seiten.flatMap((s) => s.groessen),
      angaben,
    );
    if (falsch) {
      setHinweis(falsch);
      return;
    }
    // Der Zusammenhang allein ist kein Check-in (ANN-355).
    if (nurFragen(Object.keys(angaben)).length === 0) {
      setHinweis('Bitte beantworten Sie mindestens eine Frage.');
      return;
    }
    setHinweis(null);
    absenden.mutate(angaben);
  }

  const feld = (g: Erfassungsgroesse, imAblauf: boolean) => (
    <Angabefeld
      key={g.key}
      groesse={g}
      wert={werte[g.key] ?? null}
      zuletzt={daten.last_values[g.key]}
      zuletztAm={tagDerLetzten(daten, g.key)}
      imAblauf={imAblauf}
      onChange={(wert) => {
        setHinweis(null);
        setWerte((bisher) => ({ ...bisher, [g.key]: wert }));
      }}
    />
  );

  const meldung = hinweis ?? (absenden.isError ? absenden.error.message : null);
  const meldezeile = meldung ? (
    <Statusmeldung ton="fehler" className="mb-3">
      {meldung}
    </Statusmeldung>
  ) : null;

  return (
    <GefuehrterAblauf
      titel={seite.titel}
      objekt="Check-in"
      schliessen="Später"
      onSchliessen={() => void navigate(zurueck)}
      seite={seite.kennung}
      stand={{
        text: `Frage ${nummer + 1} von ${seiten.length}`,
        wert: nummer + 1,
        von: seiten.length,
      }}
      onZurueck={zurueckGehen}
      schutz={schutz}
      spaeter
      balkenJeSchritt
      plattform
      fussLinie
      breit
      titelStufe="frage"
      // Ohne Netz unter der ersten Reihe des Kopfs; die Zeile steht immer im Baum, damit
      // Vorlesesoftware den Wechsel ansagt.
      unterDemKopf={<Verbindungszeile innen={BREITE_ABLAUFSPALTE} />}
      band={
        zugang.access_kind === 'self' ? undefined : (
          <Vertretungsband zugang={zugang} innen={BREITE_ABLAUFSPALTE} />
        )
      }
      vorDemTitel={
        nummer === 0 ? (
          <p className="text-ink-muted">
            Jede Frage ist freiwillig. Lassen Sie offen, was Sie nicht sicher wissen.
          </p>
        ) : undefined
      }
      fuss={
        letzte ? (
          <>
            {meldezeile}
            {/* Die Zeile steht immer im Baum: Mit ihrem Text entstanden, sagte Vorlesesoftware
                sie nicht an. */}
            <div role="status">
              {verbunden ? null : (
                <p id={ohneNetzId} className="text-ink-muted mb-3">
                  Senden geht wieder mit Verbindung. Ihre Antworten bleiben stehen.
                </p>
              )}
            </div>
            {/* Der Notfallhinweis vor dem Knopf, nicht dahinter (ADR-006 Punkt 4). */}
            <p className="text-ink-muted mb-3">
              <strong className="text-ink">{NICHT_AKUT}</strong> <Notfallsatz />
            </p>
            <div className={KNOPFREIHE}>
              <Button
                className={`${HAUPTKNOPF} ${GESPERRT}`}
                aria-disabled={verbunden ? undefined : true}
                aria-describedby={verbunden ? undefined : ohneNetzId}
                disabled={absenden.isPending}
                onClick={senden}
              >
                {absenden.isPending ? 'Wird gesendet …' : 'Angaben senden'}
              </Button>
            </div>
          </>
        ) : (
          <>
            {meldezeile}
            <div className={KNOPFREIHE}>
              <Button className={HAUPTKNOPF} onClick={weiter}>
                Weiter
              </Button>
            </div>
          </>
        )
      }
    >
      {seite.einzeln ? (
        feld(seite.groessen[0]!, true)
      ) : (
        <>
          {seite.kennung === 'belastung' ? (
            // 6 unter dem Titel des Fensters wie der Satz der Anker (Handoff 5.1).
            <p className="text-ink-muted -mt-2.5">
              Grob genügt. Es geht nicht um mehr oder weniger, sondern darum, Ihre anderen Angaben
              richtig zu lesen.
            </p>
          ) : null}
          <div className="flex flex-col gap-8 [.plattform-schrift[data-rechner]_&]:gap-12">
            {sichtbar(seite, werte).map((g) => feld(g, false))}
          </div>
        </>
      )}
      {/* Wer liest und wann, am Ende des Inhalts der letzten Seite (Handoff 5.1). */}
      {letzte ? (
        <p className="text-ink-muted mt-auto">
          {leserIn(zugang)} sieht Ihre Angaben beim nächsten Termin; sie werden nicht laufend
          gelesen.
        </p>
      ) : null}
    </GefuehrterAblauf>
  );
}

/** Beim Laden die Form der ersten Frage: Titel, Satz der Anker, zwei Reihen Stufen, letzte Angabe. */
function Ladezustand() {
  return (
    <SkelettBereich beschriftung="Ihr Check-in wird geladen" className="flex flex-col gap-4">
      <Skelett form="titel" className="w-4/5" />
      <Skelett form="zeile" className="w-3/5" />
      <Skelett form="leiste" />
      <Skelett form="leiste" />
      <Skelett form="zeile" className="w-1/2" />
    </SkelettBereich>
  );
}

/**
 * Kein Ablauf: Leerzustand mit Markenform, Titel, Satz und, wo es einen gibt, dem Weg (ANN-801).
 * Die Begleitung und die Lesefrist kennt die Seite aus dem Zugang.
 */
function Zustand({
  zugang,
  daten,
  seiten,
  lesefrist,
  mit,
}: {
  zugang: Plattformzugang;
  daten: EigeneCheckins | null;
  seiten: number;
  /** Der Satz der Lesefrist, wenn sie gilt. */
  lesefrist: string | null;
  mit: (pfad: string) => string;
}) {
  const antworten = (daten?.history.length ?? 0) + (daten?.session_history.length ?? 0) > 0;
  const meineAngaben = antworten ? (
    <ButtonLink
      to={mitRueckweg(mit(`${PLATTFORM_PFAD}/angaben`), mit(`${PLATTFORM_PFAD}/checkin`))}
      variant="secondary"
    >
      Meine Angaben
    </ButtonLink>
  ) : undefined;

  if (zugang.access_kind === 'companion') {
    return (
      <EmptyState
        markenform
        title={`Check-in für ${zugang.represented_name ?? 'die Person'}`}
        description="Den Check-in beantwortet die Person selbst oder ihre rechtliche Vertretung."
      />
    );
  }
  if (lesefrist !== null) {
    return (
      <EmptyState
        markenform
        title="Kein Check-in mehr"
        description={lesefrist}
        aktion={meineAngaben}
      />
    );
  }
  if (!daten?.schedule || seiten === 0) {
    return (
      <EmptyState
        markenform
        title="Zurzeit kein Check-in"
        description="Stellt Ihre Praxis Ihnen Fragen zwischen den Terminen, finden Sie sie hier und auf der Übersicht."
      />
    );
  }
  if (daten.due && daten.consent_needed) {
    return (
      <EmptyState
        markenform
        title="Ihre Praxis bittet um einen Check-in"
        description="Der Check-in fragt nach Ihrer Gesundheit. Dafür braucht es Ihre Einwilligung."
        aktion={
          <ButtonLink to={mit(`${PLATTFORM_PFAD}/einwilligungen`)} variant="secondary">
            Einwilligungen ansehen
          </ButtonLink>
        }
      />
    );
  }
  if (!daten.due && daten.due_on) {
    return (
      <EmptyState
        markenform
        title={daten.history.length > 0 ? 'Schon beantwortet' : 'Noch nicht dran'}
        description={`Ihr nächster Check-in ist ab ${tagFest(daten.due_on)} dran.`}
        aktion={meineAngaben}
      />
    );
  }
  return (
    <EmptyState
      markenform
      title="Zurzeit kein Check-in"
      description="Ihr Zugang erlaubt das gerade nicht."
    />
  );
}
