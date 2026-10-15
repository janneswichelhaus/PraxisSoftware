import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Disclosure } from '@/components/ui/Card';
import { Datenliste } from '@/components/ui/Datenliste';
import { EmptyState } from '@/components/ui/Feedback';
import { Field } from '@/components/ui/Field';
import { Kleingedrucktes } from '@/components/ui/Kleingedrucktes';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { Listenabschnitt } from '@/components/ui/Listenabschnitt';
import { Warnzeile } from '@/components/ui/Objektkopf';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Rueckmeldung } from '@/components/ui/Rueckmeldung';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { Section } from '@/components/ui/Section';
import { Segment } from '@/components/ui/Segment';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Textlink } from '@/components/ui/Textlink';
import { Tile, TileGrid } from '@/components/ui/Tile';
import { Zwischentitel } from '@/components/ui/Zwischentitel';
import type { Plattformzugang } from '@/features/platform-access/api';
import { anzeigezustand, usePlattformzugang } from '@/features/platform-access/zustand';
import { angabenZeile } from '@/lib/erfassungsgroessen';
import { formatDate } from '@/lib/datum';
import {
  PLAENE_SCHLUESSEL,
  createVersion,
  endPlan,
  extendPlan,
  fetchPlan,
  planPfad,
  planSchluessel,
  type Einheit,
  type Plan,
} from './api';
import { schrittZeilen, vorigePosition } from './fassung';
import { LAUFZEIT_HOECHSTENS_TAGE, LAUFZEIT_VORSCHLAG_TAGE, tagPlus } from './laufzeit';
import { Fassungen } from './Fassungen';
import { Plankopf } from './Plankopf';
import { Planeditor } from './Planeditor';
import { Positionszeile } from './Positionszeile';
import { AUSFUEHRUNG_TEXT, uebungsanalyse, type Uebungszeile } from './uebungsanalyse';

/**
 * Ein Übungsplan (UEB-EPIC-002) - an der Akte unter
 * `/patienten/:patientId/plaene/:planId`, an der Trainingskund:in unter
 * `/training/:relationshipId/plaene/:planId`.
 *
 * Welle B: Der Entwurf ist eine Arbeitsseite (`Planeditor`), der zugewiesene
 * Plan eine Objektseite - Kopf mit Laufzeit-Warnung, Laufzeit als Kacheln,
 * die Übungen als Zeilen (fachlich oder in Alltagssprache), was die
 * Person durchgeführt hat, und die Fassungen.
 *
 * Das Laden ist ein Blick in die Akte bzw. das Trainingsverhältnis; der
 * Server protokolliert es einmal am Tag (ADR-010 Fassung 3). Ob die Person
 * schreiben darf, sagt `can_write` (ANN-298) - verbindlich prüft der Server.
 */
export function PlanPage() {
  const { planId = '' } = useParams();
  const abfrage = useQuery({
    queryKey: planSchluessel(planId),
    queryFn: () => fetchPlan(planId),
    retry: false,
  });
  // Befund B9: Nach dem Zuweisen bestätigt die Seite es mit dem Weg zum
  // Planblatt - der Plan nützt so auch ohne Plattform - und sagt, ob die
  // Person ihn auf der Plattform sieht.
  const [zugewiesen, setZugewiesen] = useState<{ planId: string; bis: string } | null>(null);

  return (
    <Abfragezustand
      abfrage={abfrage}
      laden="Plan wird geladen …"
      fehler="Der Plan konnte nicht geladen werden."
      inKarte
    >
      {(plan) =>
        plan ? (
          <Ansicht
            plan={plan}
            zugewiesenBis={zugewiesen?.planId === plan.id ? zugewiesen.bis : null}
            onZugewiesen={(bis) => setZugewiesen({ planId: plan.id, bis })}
          />
        ) : (
          <>
            <Rueckweg standard="/" />
            <EmptyState inKarte title="Plan nicht gefunden" />
          </>
        )
      }
    </Abfragezustand>
  );
}

function Ansicht({
  plan,
  zugewiesenBis,
  onZugewiesen,
}: {
  plan: Plan;
  zugewiesenBis: string | null;
  onZugewiesen: (bis: string) => void;
}) {
  const entwurf = plan.status === 'draft';
  // B9 (Praxis-Review): Ob die Person den Plan auf der Plattform sieht, sagt
  // ihr Zugang - dieselbe Abfrage wie der Abschnitt „Plattform“ der Akte,
  // ohne eigene Serverfunktion. Gefragt wird erst nach dem eigenen Zuweisen,
  // gleichzeitig mit dem Nachladen des Plans; zuweisen darf nur, wer das
  // Verhältnis und damit den Zugang liest (`can_read_platform_access`).
  const zugang = usePlattformzugang(
    plan.service_area === 'therapy' ? 'treatment' : 'training',
    plan.relationship_id,
    zugewiesenBis !== null,
  );
  if (entwurf && plan.can_write && plan.relationship_open) {
    return <Planeditor plan={plan} onZugewiesen={onZugewiesen} />;
  }
  return <Zugewiesen plan={plan} zugewiesenBis={entwurf ? null : zugewiesenBis} zugang={zugang} />;
}

// -----------------------------------------------------------------------------
// Zugewiesen, beendet, abgelöst - oder ein Entwurf ohne Schreibrecht
// -----------------------------------------------------------------------------

function Zugewiesen({
  plan,
  zugewiesenBis,
  zugang,
}: {
  plan: Plan;
  zugewiesenBis: string | null;
  /** Der Plattformzugang der Person; `undefined`, solange er nicht bekannt ist. */
  zugang: Plattformzugang | null | undefined;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const entwurf = plan.status === 'draft';
  const entscheiden = plan.can_write && plan.status === 'assigned';
  const abgelaufen =
    plan.status === 'assigned' && plan.runs_until !== null && plan.runs_until < plan.today;
  const darfNeu =
    plan.can_write && plan.relationship_open && plan.status === 'assigned' && !plan.follow_up;
  const neu = useMutation({
    mutationFn: () => createVersion(plan.id),
    onSuccess: async (id) => {
      await queryClient.invalidateQueries({ queryKey: PLAENE_SCHLUESSEL });
      void navigate(planPfad(plan.service_area, plan.relationship_id, id));
    },
  });

  return (
    <>
      <Plankopf
        plan={plan}
        aktionen={
          entwurf ? null : (
            <>
              {/* UEB-008 (ANN-303): der Plan als Blatt - auch ohne Plattform. */}
              <ButtonLink
                variant="secondary"
                to={`${planPfad(plan.service_area, plan.relationship_id, plan.id)}/blatt`}
              >
                Als PDF oder drucken
              </ButtonLink>
              {darfNeu ? (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={neu.isPending}
                  onClick={() => neu.mutate()}
                >
                  {neu.isPending ? 'Wird angelegt …' : 'Neue Fassung'}
                </Button>
              ) : null}
            </>
          )
        }
        mitMarke={!(plan.review_due && entscheiden)}
        hinweise={
          plan.review_due && entscheiden ? (
            <Warnzeile>
              {abgelaufen
                ? `Die Laufzeit ist am ${formatDate(plan.runs_until)} abgelaufen.`
                : `Die Laufzeit endet am ${formatDate(plan.runs_until)}.`}{' '}
              Bitte entscheiden: verlängern, als neue Fassung ändern oder beenden.
            </Warnzeile>
          ) : undefined
        }
      />
      {zugewiesenBis ? (
        <Rueckmeldung className="mt-4">
          Zugewiesen bis {formatDate(zugewiesenBis)}. <Plattformsatz plan={plan} zugang={zugang} />
        </Rueckmeldung>
      ) : null}
      {neu.isError ? (
        <Statusmeldung ton="fehler" className="mt-4">
          {neu.error.message}
        </Statusmeldung>
      ) : null}

      <div className="mt-6">
        {entwurf ? null : <Laufzeit plan={plan} abgelaufen={abgelaufen} />}
        {entscheiden && plan.relationship_open ? (
          // Steht die Wiedervorlage an, liegt das Verlängern offen; sonst auf Abruf.
          plan.review_due ? (
            <Verlaengern plan={plan} />
          ) : (
            <Disclosure summary="Laufzeit verlängern">
              <Verlaengern plan={plan} />
            </Disclosure>
          )
        ) : null}
        <Positionen plan={plan} />
        {entwurf ? null : <Durchgefuehrt plan={plan} />}
        <Fassungen plan={plan} />
        {entscheiden ? <Beenden plan={plan} /> : null}
      </div>
    </>
  );
}

/**
 * Der zweite Satz der Bestätigung (B9, Praxis-Review): ob die Person den Plan
 * auf der Plattform sieht, und der Weg zum Planblatt. Ist ihr Zugang noch
 * nicht bekannt oder nicht zu laden, bleibt es beim Weg zum Blatt.
 */
function Plattformsatz({
  plan,
  zugang,
}: {
  plan: Plan;
  zugang: Plattformzugang | null | undefined;
}) {
  // Alleinstehend: 44 px Tippziel, auch mitten in der Bestätigung.
  const blatt = (
    <Textlink
      alleinstehend
      to={`${planPfad(plan.service_area, plan.relationship_id, plan.id)}/blatt`}
    >
      Als PDF oder drucken
    </Textlink>
  );
  if (zugang === undefined) return blatt;
  if (anzeigezustand(zugang) === 'active') {
    return (
      <>
        {plan.given_name} sieht ihn auf der Plattform. {blatt}
      </>
    );
  }
  return <>Ohne Plattformzugang: {blatt} mitgeben.</>;
}

function Laufzeit({ plan, abgelaufen }: { plan: Plan; abgelaufen: boolean }) {
  return (
    <Section titel="Laufzeit">
      <TileGrid spalte="kachel">
        <Tile
          label="Zugewiesen"
          {...(plan.assigned_by_name ? { zusatz: `von ${plan.assigned_by_name}` } : {})}
        >
          {formatDate(plan.runs_from)}
        </Tile>
        <Tile
          label="Läuft bis"
          {...(abgelaufen
            ? { zusatz: 'abgelaufen' }
            : plan.extended_at && plan.original_runs_until
              ? { zusatz: `verlängert, zuerst bis ${formatDate(plan.original_runs_until)}` }
              : {})}
        >
          {formatDate(plan.runs_until)}
        </Tile>
        {plan.ended_at ? (
          <Tile
            label={plan.status === 'superseded' ? 'Abgelöst' : 'Beendet'}
            {...(plan.ended_by_name ? { zusatz: `von ${plan.ended_by_name}` } : {})}
          >
            {formatDate(plan.ended_on)}
          </Tile>
        ) : null}
      </TileGrid>
    </Section>
  );
}

/** Verlängern (UEB-007, ANN-302) - ändern geht über „Neue Fassung“. */
function Verlaengern({ plan }: { plan: Plan }) {
  const queryClient = useQueryClient();
  const spaetestens = tagPlus(plan.today, LAUFZEIT_HOECHSTENS_TAGE);
  const ab = plan.runs_until && plan.runs_until > plan.today ? plan.runs_until : plan.today;
  const vorschlag = tagPlus(ab, LAUFZEIT_VORSCHLAG_TAGE);
  const [bis, setBis] = useState(vorschlag > spaetestens ? spaetestens : vorschlag);
  const [fehler, setFehler] = useState<string | undefined>();
  const verlaengern = useMutation({
    mutationFn: () => extendPlan(plan.id, bis),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PLAENE_SCHLUESSEL }),
  });

  return (
    <form
      noValidate
      className="mt-4 flex flex-wrap items-end gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!bis || (plan.runs_until !== null && bis <= plan.runs_until) || bis > spaetestens) {
          setFehler('Bitte ein Ende nach dem bisherigen wählen, höchstens 26 Wochen ab heute.');
          return;
        }
        setFehler(undefined);
        if (!verlaengern.isPending) verlaengern.mutate();
      }}
    >
      <Field
        label="Verlängern bis"
        type="date"
        min={plan.runs_until ?? plan.today}
        max={spaetestens}
        className="max-w-48"
        value={bis}
        error={fehler}
        onChange={(event) => setBis(event.target.value)}
      />
      <Button type="submit" variant="secondary" disabled={verlaengern.isPending}>
        {verlaengern.isPending ? 'Wird verlängert …' : 'Verlängern'}
      </Button>
      {verlaengern.isError ? (
        <Statusmeldung ton="fehler" className="basis-full">
          {verlaengern.error.message}
        </Statusmeldung>
      ) : null}
    </form>
  );
}

/** Beenden nach Rückfrage - leise am Ende; ein zugewiesener Plan wird nie gelöscht (ANN-300). */
function Beenden({ plan }: { plan: Plan }) {
  const queryClient = useQueryClient();
  const beenden = useMutation({
    mutationFn: () => endPlan(plan.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PLAENE_SCHLUESSEL }),
  });
  return (
    <div className="mt-8">
      <Rueckfrage
        ausloeser="Plan beenden"
        ausloeserVariante="quiet"
        ausloeserGroesse="kompakt"
        bestaetigen="Beenden"
        bestaetigenLaeuft="Wird beendet …"
        fehler={beenden.error?.message}
        onBestaetigen={() => beenden.mutateAsync()}
      >
        <p>Den Plan beenden? Er bleibt lesbar, läuft aber nicht weiter.</p>
      </Rueckfrage>
    </div>
  );
}

type Sprache = 'fachlich' | 'alltag';

function Positionen({ plan }: { plan: Plan }) {
  // Der Plan in beiden Sprachebenen (IDEA-QSN-002): fachlich für die Praxis,
  // in Alltagssprache so, wie die Person ihn liest.
  const [sprache, setSprache] = useState<Sprache>('fachlich');
  return (
    <Listenabschnitt
      titel="Übungen"
      {...(plan.items.length > 0 ? { anzahl: plan.items.length } : {})}
      {...(plan.items.length > 0
        ? {
            aktion: (
              <Segment
                beschriftung="Ansicht"
                wahlen={[
                  { wert: 'fachlich', text: 'Fachlich' },
                  { wert: 'alltag', text: 'In Alltagssprache' },
                ]}
                gewaehlt={sprache}
                onWaehlen={setSprache}
              />
            ),
          }
        : {})}
      leer={{ titel: 'Noch keine Übung' }}
    >
      {plan.items.map((position) => (
        <Positionszeile
          key={position.id}
          position={position}
          sprache={sprache}
          schritt={
            sprache === 'fachlich' ? schrittZeilen(position, vorigePosition(plan, position)) : []
          }
        />
      ))}
    </Listenabschnitt>
  );
}

// -----------------------------------------------------------------------------
// Durchgeführt (UEB-010)
// -----------------------------------------------------------------------------

/**
 * Was die Person auf der Plattform an diesem Plan gemacht hat - Tag,
 * Durchgänge, „schwierig, weil …". Darstellung dessen, was sie erfasst hat;
 * keine Quote, keine Bewertung, kein Vorschlag (ADR-006 Punkt 10, §17).
 */
function Durchgefuehrt({ plan }: { plan: Plan }) {
  const beendet = plan.sessions.filter((s) => s.finished_at !== null).length;
  return (
    <Section titel="Durchgeführt">
      {plan.sessions.length === 0 ? (
        <EmptyState
          inKarte
          title="Noch keine Einheit erfasst"
          description="Was die Person auf der Plattform abhakt, steht hier."
        />
      ) : (
        <>
          {beendet > 0 ? <JeUebung plan={plan} beendet={beendet} /> : null}
          <Zwischentitel>Je Einheit</Zwischentitel>
          <ListRows>
            {plan.sessions.map((einheit) => (
              <EinheitZeile key={einheit.id} einheit={einheit} />
            ))}
          </ListRows>
        </>
      )}
    </Section>
  );
}

/**
 * Anzeigende Übungsanalyse (OUT-003, IDEA-OUT-006, ANN-366): je Übung, in wie
 * vielen beendeten Einheiten alle Sätze, ein Teil oder keiner abgehakt wurde,
 * und die letzten fünf nacheinander. Gezählt, nicht gedeutet: keine Ursache,
 * kein Austauschvorschlag, keine Farbe (ADR-006 Punkte 10, 11, 13).
 */
function JeUebung({ plan, beendet }: { plan: Plan; beendet: number }) {
  const zeilen = uebungsanalyse(plan);
  const daten = plan.items.map((item, i) => ({ item, zeile: zeilen[i]! }));
  return (
    <>
      <Zwischentitel>Je Übung</Zwischentitel>
      <p className="text-ink-muted mb-2 text-sm">
        In {beendet === 1 ? 'einer beendeten Einheit' : `${beendet} beendeten Einheiten`} abgehakt.
      </p>
      <Datenliste<{ item: Plan['items'][number]; zeile: Uebungszeile }>
        beschriftung="Je Übung: alle Sätze, ein Teil, ausgelassen"
        zeilen={daten}
        schluessel={({ item }) => item.id}
        spalten={[
          {
            titel: 'Übung',
            inhalt: ({ item }) => (
              <span className="text-ink text-sm font-medium">
                {item.position}. {item.variant_name}
              </span>
            ),
          },
          { titel: 'Alle Sätze', breite: '6rem', rechts: true, inhalt: ({ zeile }) => zeile.ganz },
          {
            titel: 'Ein Teil',
            breite: '6rem',
            rechts: true,
            inhalt: ({ zeile }) => zeile.teilweise,
          },
          {
            titel: 'Ausgelassen',
            breite: '7rem',
            rechts: true,
            inhalt: ({ zeile }) => zeile.ausgelassen,
          },
          {
            titel: 'Zuletzt, jüngste zuerst',
            inhalt: ({ zeile }) =>
              zeile.zuletzt
                .map((e) => `${formatDate(e.tag)} ${AUSFUEHRUNG_TEXT[e.ausfuehrung]}`)
                .join(' · '),
          },
        ]}
      />
      <Kleingedrucktes className="mt-2">
        Last und Wiederholungen erfasst die Plattform nicht; die Dosis ist die des Plans.
      </Kleingedrucktes>
    </>
  );
}

function EinheitZeile({ einheit }: { einheit: Einheit }) {
  const angaben = Object.keys(einheit.values).length > 0;
  return (
    <ListRow
      titel={`${formatDate(einheit.performed_on)} · ${einheit.sets_done} von ${einheit.sets_total} Durchgängen${
        einheit.finished_at ? '' : ' · nicht beendet'
      }${
        einheit.recorded_by_kind === 'legal_representative' ||
        einheit.finished_by_kind === 'legal_representative'
          ? ' · erfasst von der Vertretung'
          : ''
      }`}
      meta={
        angaben || einheit.difficulty_note ? (
          <>
            {/* TRK-001: die Angaben der Person mit ihrem Wert, ohne Einordnung
                (ADR-006 Punkt 11). */}
            {angaben ? (
              <span className="block">Angaben: {angabenZeile(einheit.values)}</span>
            ) : null}
            {einheit.difficulty_note ? (
              <span className="block">Schwierig, weil: {einheit.difficulty_note}</span>
            ) : null}
          </>
        ) : undefined
      }
    />
  );
}
