import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { Anrufknoepfe } from '@/components/ui/Anrufknoepfe';
import { knopfKlassen } from '@/components/ui/buttonStile';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Checkbox } from '@/components/ui/Checkbox';
import { EmptyState, ErrorState } from '@/components/ui/Feedback';
import { GefuehrterAblauf } from '@/components/ui/GefuehrterAblauf';
import { Kleingedrucktes } from '@/components/ui/Kleingedrucktes';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Textlink } from '@/components/ui/Textlink';
import {
  aendern,
  beginne,
  kannZurueck,
  weiter,
  zurueck,
  type Abfolge,
} from '@/components/ui/abfolge';
import { EINGABETEXTE, useTextverlustschutz } from '@/app/Textverlustschutz';
import { canManageAppointments, type CurrentUser } from '@/features/session/types';
import { fetchDayPlan, rufnummern, type DayPlanEntry } from '@/features/today/api';
import { leseRueckweg, mitRueckweg } from '@/lib/rueckweg';
import { Laengenzeichen } from './Laengenzeichen';
import {
  appointmentTypeHint,
  cancellationReasonLabels,
  waehlbareAbsagegruende,
  cancelStaffDay,
  type CancellationReason,
} from './api';
import { tageslageNeuLaden } from './tageslage';
import {
  ABGESAGT_PARAM,
  ersteAnrufseite,
  leseAbgesagt,
  leseAnrufstand,
  leseZeiten,
  liegtInZeiten,
  mitAnrufstand,
  naechsterAnruf,
  seitenKennung,
  terminDativ,
  terminWort,
  umplanStand,
  type Anrufergebnis,
  type UmplanSeite,
  type Zeitspanne,
} from './tagumplanen';
import { formatLocalDate, formatLocalTime, formatLocalTimeRange, istIsoDatum } from '@/lib/datum';
import { fetchAssignableTherapists } from '@/features/staff/api';

/**
 * Tag umplanen mit Anrufliste (CAL-009, IDEA-PRX-004), geführt seit
 * Überholung 6 (G2, ANN-574).
 *
 * Der Anlass ist ein Ausfall am Morgen — ein Platten, ein krankes Kind. Sechs
 * Haushalte ohne Wartezimmer müssen abgesagt und angerufen werden. Ein
 * Fenster führt durch beides, eine Frage je Seite: Warum? → Welche Termine?
 * (alle bestätigten vorgewählt, einzelne abwählbar, etwa wenn eine Kollegin
 * übernimmt) → Rückfrage → je Person eine Seite mit Anrufen, „Erreicht“ oder
 * „Nicht erreicht“ → am Ende, wer noch fehlt.
 *
 * Zwei Dinge sind bewusst so und nicht anders:
 *
 *   * Die Absage ist **ein** Vorgang und läuft serverseitig alles-oder-nichts
 *     (`cancel_staff_day` mit der Auswahl). Ein halb umgeplanter Tag wäre
 *     schlimmer als ein gescheiterter Versuch. Die Seite schickt die Auswahl
 *     immer mit - auch wenn alle gewählt sind -, damit kein Termin abgesagt
 *     wird, den niemand gesehen hat (Zweitreview Überholung 6).
 *   * Die Anrufliste liest den **bestehenden** Tagesplan-Lesepfad
 *     (`list_day_plan`, UX-001). Kein zweiter Weg zu denselben Rufnummern.
 *
 * **Der Anrufstand steht in der Adresse (KAL-06, ANN-574):** die Kennungen
 * der eben abgesagten Termine und die Antworten - nur Kennungen, keine Namen
 * (ADR-011). So übersteht die Liste den Abstecher in die Akte, das Zurück und
 * ein Neuladen nach dem Wechsel in die Telefon-App; gespeichert wird sie
 * nicht.
 */

const UUID_MUSTER = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Was „Tag umplanen" absagt.
 *
 * Nur Behandlungstermine: `cancel_staff_day` lässt Ereignisse des
 * Praxisbetriebs seit CAL-015b ausdrücklich stehen. Stünde eine Teambesprechung
 * in dieser Liste, versprächen Zählung und Vorschau eine Absage, die gar nicht
 * käme — und die Anrufliste danach hätte einen Eintrag ohne Rufnummer
 * (CAL-016).
 */
function istBetroffen(termin: DayPlanEntry): boolean {
  return termin.status === 'confirmed' && termin.kind === 'therapy';
}

/**
 * Wer nach dem Umplanen angerufen wird.
 *
 * Ein Ereignis hat niemanden, den man anrufen könnte - und es war gar nicht
 * abgesagt worden (CAL-016).
 */
function istAnzurufen(termin: DayPlanEntry): boolean {
  return termin.status === 'cancelled' && termin.kind === 'therapy';
}

function name(termin: DayPlanEntry): string {
  return `${termin.patient_given_name} ${termin.patient_family_name}`;
}

/**
 * Eine Person der Anrufliste: wann abgesagt, der Weg in die Akte. Die
 * Rufnummern stehen im Fuß, der Anruf ist dort der Hauptknopf (BEF-192).
 */
function Anrufseite({
  termin,
  rueckweg,
  quittung,
}: {
  termin: DayPlanEntry;
  rueckweg: string;
  /** Nach der Absage auf der ersten Seite: was eben geschah (DESIGN.md 9.14). */
  quittung: string | null;
}) {
  return (
    <div className="flex flex-col gap-4">
      {quittung ? <Statusmeldung ton="erfolg">{quittung}</Statusmeldung> : null}
      <div className="flex flex-wrap items-center gap-x-3">
        <p className="text-ink-muted text-sm">
          Abgesagt: {formatLocalTime(termin.starts_at, termin.organization_time_zone)} Uhr
        </p>
        {/* Ein Weg in die Akte, mit Rückweg hierher samt Anrufliste (RSP-06,
            KAL-06) - für sich mit 44 px Tippziel (DESIGN.md Grundsatz 3). */}
        <Textlink alleinstehend to={mitRueckweg(`/patienten/${termin.patient_id}`, rueckweg)}>
          Akte
        </Textlink>
      </div>
      {rufnummern(termin).length === 0 ? (
        <p className="text-ink-muted text-sm">Keine Rufnummer hinterlegt.</p>
      ) : null}
    </div>
  );
}

/** Die Rückfrage vor dem Weggehen spricht vom Umplanen, nicht von „Text“. */
const UMPLANTEXTE = {
  ...EINGABETEXTE,
  bezeichnung: 'Noch nicht abgesagt',
  zeile: {
    weitergehen: 'Der Tag ist noch nicht umgeplant.',
    abmelden: 'Der Tag ist noch nicht umgeplant – abmelden?',
    bleiben: 'Weiter',
  },
};

function Umplanung({
  staffMemberId,
  datum,
  user,
}: {
  staffMemberId: string;
  datum: string;
  user: CurrentUser;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [suche, setSuche] = useSearchParams();
  const ort = useLocation();
  // Die eben abgesagten Kennungen, sofort - die Adresse folgt einen Augenblick
  // später, und der neu geladene Tag ohne bestätigte Termine stünde sonst kurz
  // als „nichts umzuplanen“ da.
  const [eben, setEben] = useState<string[] | null>(null);
  const abgesagt = leseAbgesagt(suche) ?? eben;
  const zeiten = leseZeiten(suche);
  const anrufstand = leseAnrufstand(suche);
  const zumKalender = leseRueckweg(suche, '/kalender');
  const darfUmplanen = canManageAppointments(user.roles);

  const tag = useQuery({
    queryKey: ['day-plan', datum, staffMemberId],
    queryFn: () => fetchDayPlan(datum, staffMemberId),
    retry: false,
  });

  const personen = useQuery({
    queryKey: ['assignable-therapists'],
    queryFn: fetchAssignableTherapists,
    retry: false,
  });

  const person = personen.data?.find((p) => p.staff_member_id === staffMemberId);
  // Die Zeitzone der Praxis, nicht die des ersten Termins: Ein Tag ohne
  // Termine stünde sonst als „2026-09-26" da (KAL-10).
  const zone = user.organizationTimeZone ?? tag.data?.[0]?.organization_time_zone;
  const tagText = zone ? formatLocalDate(`${datum}T12:00:00Z`, zone) : datum;
  const objekt = person ? `${person.display_name} · ${tagText}` : tagText;
  // Der Kopf des Fensters hat eine Zeile: das kurze Datum vorn, damit es bei
  // 375 px auch neben einem langen Namen stehen bleibt (Design-Review
  // Überholung 9, Runde 2).
  const tagKurzText = zone
    ? new Intl.DateTimeFormat('de-DE', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        timeZone: zone,
      }).format(new Date(`${datum}T12:00:00Z`))
    : datum;
  const fensterObjekt = person ? `${tagKurzText} · ${person.display_name}` : tagKurzText;

  return (
    <>
      <Rueckweg standard="/kalender" />
      <PageHeader title="Tag umplanen" description={objekt} />
      {/* Laden, Fehler und ein gescheitertes Nachladen über den Baustein
          (DESIGN.md Regel 8): Scheitert nur das Nachladen, bleibt der
          geladene Stand stehen - samt Anrufliste (ZST-03). */}
      <div className="max-w-spalte">
        <Abfragezustand
          abfrage={tag}
          laden="Der Tag wird geladen …"
          fehler="Der Tag konnte nicht geladen werden."
        >
          {(termine) => {
            const betroffen = termine.filter(istBetroffen);
            if (abgesagt === null && betroffen.length === 0) {
              return (
                <EmptyState
                  inKarte
                  title="Hier ist nichts umzuplanen."
                  description="An diesem Tag steht für diese Person kein bestätigter Termin."
                  aktion={
                    <ButtonLink to={zumKalender} variant="secondary">
                      Zum Kalender
                    </ButtonLink>
                  }
                />
              );
            }
            if (abgesagt === null && !darfUmplanen) {
              return (
                <Statusmeldung>Für das Absagen fehlt Ihrem Zugang die Berechtigung.</Statusmeldung>
              );
            }
            return (
              <Ablauf
                termine={termine}
                betroffen={betroffen}
                zeiten={zeiten}
                abgesagt={abgesagt}
                anrufstand={anrufstand}
                objekt={fensterObjekt}
                rueckweg={`${ort.pathname}${ort.search}`}
                onSchliessen={() => void navigate(zumKalender)}
                zumKalender={zumKalender}
                onAbsagen={async (grund, auswahl) => {
                  await cancelStaffDay(staffMemberId, datum, grund, auswahl);
                }}
                frischAbgesagt={eben?.length ?? null}
                onAbgesagt={async (auswahl) => {
                  setEben(auswahl);
                  // Die Anrufliste in die Adresse (KAL-06): Sie übersteht
                  // Zurück und Neuladen. `replace`: Zurück soll nicht wieder
                  // zur Absage führen.
                  setSuche(
                    (bisher) => {
                      const naechste = new URLSearchParams(bisher);
                      naechste.set(ABGESAGT_PARAM, auswahl.join(','));
                      return naechste;
                    },
                    { replace: true },
                  );
                  // UBK-011: Tagesliste, Kalender, Tour und Fahrpuffer.
                  await tageslageNeuLaden(queryClient);
                }}
                onAnrufstand={(stand) =>
                  setSuche((bisher) => mitAnrufstand(bisher, stand), { replace: true })
                }
              />
            );
          }}
        </Abfragezustand>
      </div>
    </>
  );
}

function Ablauf({
  termine,
  betroffen,
  zeiten,
  abgesagt,
  anrufstand,
  objekt,
  rueckweg,
  zumKalender,
  frischAbgesagt,
  onSchliessen,
  onAbsagen,
  onAbgesagt,
  onAnrufstand,
}: {
  termine: readonly DayPlanEntry[];
  betroffen: readonly DayPlanEntry[];
  /** Die Arbeitszeit des Tages nach einer Teiländerung - `null`: der ganze Tag. */
  zeiten: readonly Zeitspanne[] | null;
  abgesagt: readonly string[] | null;
  anrufstand: Readonly<Record<string, Anrufergebnis>>;
  objekt: string;
  /** Diese Seite samt Anrufliste - der Weg aus der Akte zurück (KAL-06). */
  rueckweg: string;
  zumKalender: string;
  /** Wie viele eben in dieser Sitzung abgesagt wurden - für die Bestätigung. */
  frischAbgesagt: number | null;
  onSchliessen: () => void;
  onAbsagen: (grund: CancellationReason, auswahl: string[]) => Promise<void>;
  onAbgesagt: (auswahl: string[]) => Promise<void>;
  onAnrufstand: (stand: Readonly<Record<string, Anrufergebnis>>) => void;
}) {
  const anzurufen = abgesagt
    ? termine.filter((termin) => abgesagt.includes(termin.id) && istAnzurufen(termin))
    : [];
  const reihenfolge = anzurufen.map((termin) => termin.id);

  const [abfolge, setAbfolge] = useState<Abfolge<UmplanSeite>>(() =>
    beginne<UmplanSeite>(abgesagt ? ersteAnrufseite(reihenfolge, anrufstand) : { art: 'grund' }),
  );
  const [grund, setGrund] = useState<CancellationReason | null>(null);
  // Alle bestätigten Termine sind gewählt - nach einer Teiländerung nur die,
  // die nicht ganz in der Arbeitszeit des Tages liegen (Praxis-Review
  // Überholung 9); einzelne lassen sich ab- und zuwählen.
  const [auswahl, setAuswahl] = useState<string[]>(() =>
    betroffen
      .filter(
        (termin) =>
          zeiten === null ||
          !liegtInZeiten(
            formatLocalTime(termin.starts_at, termin.organization_time_zone),
            formatLocalTime(termin.ends_at, termin.organization_time_zone),
            zeiten,
          ),
      )
      .map((termin) => termin.id),
  );
  const seite = abfolge.seite;
  const imAbsagen = seite.art === 'grund' || seite.art === 'termine' || seite.art === 'absagen';

  function zurueckGehen() {
    const vorher = zurueck(abfolge);
    if (vorher) setAbfolge(vorher);
  }

  const { schutz } = useTextverlustschutz({
    // Vor der Absage geht die Wahl beim Weggehen verloren; danach steht alles
    // in der Adresse.
    ungespeichert: imAbsagen && grund !== null,
    kompakt: true,
    texte: UMPLANTEXTE,
    schrittZurueck: kannZurueck(abfolge) ? zurueckGehen : undefined,
  });

  const absage = useMutation({
    mutationFn: ({ gewaehlt, ids }: { gewaehlt: CancellationReason; ids: string[] }) =>
      onAbsagen(gewaehlt, ids),
    onSuccess: async (_leer, { ids }) => {
      // Kein `freigeben()`: Danach wechselt nur die Adresse (die Anrufliste),
      // das hält der Schutz ohnehin nicht an. Eine übrige Freigabe ließe
      // sonst die nächste Zurückgeste aus dem Ablauf, statt zur vorigen
      // Person zu gehen (Praxis-Review der Politurrunde, BEF-175).
      await onAbgesagt(ids);
      // Die Anrufe beginnen von vorn, ohne Weg zurück in die Absage.
      setAbfolge(beginne<UmplanSeite>(ids[0] ? { art: 'anruf', id: ids[0] } : { art: 'fertig' }));
    },
  });

  function antworte(id: string, ergebnis: Anrufergebnis) {
    const neu = { ...anrufstand, [id]: ergebnis };
    onAnrufstand(neu);
    const naechste = naechsterAnruf(reihenfolge, neu, id);
    setAbfolge(
      weiter(abfolge, naechste ? { art: 'anruf', id: naechste } : { art: 'fertig' }, !naechste),
    );
  }

  const gewaehlt = betroffen.filter((termin) => auswahl.includes(termin.id));
  const aktuell =
    seite.art === 'anruf' ? anzurufen.find((termin) => termin.id === seite.id) : undefined;
  const nichtErreicht = anzurufen.filter((termin) => anrufstand[termin.id] === 'nicht');
  const erreicht = anzurufen.filter((termin) => anrufstand[termin.id] === 'erreicht');

  const titel =
    seite.art === 'grund'
      ? zeiten === null
        ? 'Warum fällt der Tag aus?'
        : 'Warum fallen die Termine aus?'
      : seite.art === 'termine'
        ? 'Welche Termine absagen?'
        : seite.art === 'absagen'
          ? `${gewaehlt.length} ${terminWort(gewaehlt.length)} absagen?`
          : seite.art === 'anruf'
            ? aktuell
              ? `${name(aktuell)} erreicht?`
              : 'Anrufen'
            : nichtErreicht.length > 0
              ? `${nichtErreicht.length} noch nicht erreicht`
              : 'Alle angerufen';

  return (
    <GefuehrterAblauf
      titel={titel}
      objekt={objekt}
      schliessen={imAbsagen ? 'Umplanen abbrechen' : 'Schließen'}
      onSchliessen={onSchliessen}
      seite={seitenKennung(seite)}
      stand={umplanStand(seite, reihenfolge)}
      onZurueck={kannZurueck(abfolge) ? zurueckGehen : undefined}
      schutz={schutz}
      abschluss={seite.art === 'absagen' || seite.art === 'fertig'}
      fuss={
        seite.art === 'grund' ? (
          <div className="flex flex-col gap-2">
            {/* „Patient:in hat abgesagt" steht hier nicht: Der Tag wird
                umgeplant, weil die behandelnde Person ausfällt, und das ist
                praxisbedingt (ADR-018 Fassung 2 Punkt 8.4, CAL-016). Keiner
                ist vorgewählt. */}
            {waehlbareAbsagegruende(true).map(([wert, beschriftung], index) => (
              <Button
                key={wert}
                variant="secondary"
                className="w-full"
                onClick={() => {
                  setGrund(wert);
                  setAbfolge(weiter(abfolge, { art: 'termine' }, true));
                }}
                {...(index === 0 ? { 'data-autofocus': true } : {})}
              >
                {beschriftung}
              </Button>
            ))}
          </div>
        ) : seite.art === 'termine' ? (
          <Button
            className="w-full"
            disabled={gewaehlt.length === 0}
            onClick={() => setAbfolge(weiter(abfolge, { art: 'absagen' }, true))}
          >
            Weiter mit {gewaehlt.length} {terminDativ(gewaehlt.length)}
          </Button>
        ) : seite.art === 'absagen' ? (
          <div className="flex flex-col gap-2">
            {absage.isError ? (
              <Statusmeldung ton="fehler">{absage.error.message}</Statusmeldung>
            ) : null}
            <Button
              className="w-full"
              disabled={absage.isPending || grund === null || gewaehlt.length === 0}
              onClick={() =>
                grund &&
                absage.mutate({ gewaehlt: grund, ids: gewaehlt.map((termin) => termin.id) })
              }
              data-autofocus
            >
              {absage.isPending
                ? 'Wird abgesagt …'
                : `Ja, ${gewaehlt.length} ${terminWort(gewaehlt.length)} absagen`}
            </Button>
          </div>
        ) : seite.art === 'anruf' ? (
          // Der Anruf ist die Haupthandlung, die Antwort danach sekundär:
          // Ein Tipp ohne Anruf soll nicht zur nächsten Person führen
          // (BEF-192, wie BEF-176 für G1).
          <div className="flex flex-col gap-2">
            {aktuell ? (
              <Anrufknoepfe
                nummern={rufnummern(aktuell)}
                hauptknopf
                fokusbeginn
                ohneNummer={null}
              />
            ) : null}
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="secondary"
                className="w-full"
                onClick={() => antworte(seite.id, 'erreicht')}
              >
                Erreicht
              </Button>
              <Button
                variant="secondary"
                className="w-full"
                onClick={() => antworte(seite.id, 'nicht')}
              >
                Nicht erreicht
              </Button>
            </div>
          </div>
        ) : (
          // Nach dem letzten Anruf der Weg zum freien Tag (KAL-19).
          <ButtonLink to={zumKalender} className="w-full" data-autofocus>
            Zum Kalender
          </ButtonLink>
        )
      }
    >
      {seite.art === 'termine' ? (
        <fieldset className="flex min-w-0 flex-col gap-1">
          <legend className="sr-only">Termine des Tages</legend>
          {betroffen.map((termin, index) => (
            <Checkbox
              key={termin.id}
              label={
                <span className="flex flex-wrap items-center gap-x-2">
                  <span className="tabular-nums">
                    {formatLocalTimeRange(
                      termin.starts_at,
                      termin.ends_at,
                      termin.organization_time_zone,
                    )}
                  </span>
                  <span className="text-ink font-semibold">{name(termin)}</span>
                  {/* Nur eine abweichende Terminart steht dran (ANN-192),
                      und eine abweichende Länge (§8.1, CAL-020). */}
                  {appointmentTypeHint(termin.appointment_type) ? (
                    <span className="text-ink-muted">
                      {appointmentTypeHint(termin.appointment_type)}
                    </span>
                  ) : null}
                  <Laengenzeichen termin={termin} knapp />
                </span>
              }
              checked={auswahl.includes(termin.id)}
              onChange={(event) =>
                setAuswahl((bisher) =>
                  event.target.checked
                    ? [...bisher, termin.id]
                    : bisher.filter((id) => id !== termin.id),
                )
              }
              {...(index === 0 ? { 'data-autofocus': true } : {})}
            />
          ))}
        </fieldset>
      ) : seite.art === 'absagen' ? (
        <div className="flex flex-col gap-4">
          <ListRows rahmen={false} beschriftung="Umplanung">
            <ListRow
              titel="Grund"
              meta={grund ? cancellationReasonLabels[grund] : 'Fehlt noch'}
              aktion={
                <Button
                  variant="secondary"
                  groesse="kompakt"
                  aria-label="Grund ändern"
                  onClick={() => setAbfolge(aendern(abfolge, { art: 'grund' }))}
                >
                  Ändern
                </Button>
              }
            />
            <ListRow
              titel={`${gewaehlt.length} von ${betroffen.length} ${terminDativ(betroffen.length)}`}
              meta={gewaehlt.map((termin) => name(termin)).join(', ')}
              aktion={
                <Button
                  variant="secondary"
                  groesse="kompakt"
                  aria-label="Termine ändern"
                  onClick={() => setAbfolge(aendern(abfolge, { art: 'termine' }))}
                >
                  Ändern
                </Button>
              }
            />
          </ListRows>
          <p className="text-ink text-sm">Eine Absage lässt sich nicht zurücknehmen.</p>
        </div>
      ) : seite.art === 'anruf' && aktuell ? (
        <Anrufseite
          termin={aktuell}
          rueckweg={rueckweg}
          quittung={
            frischAbgesagt !== null && Object.keys(anrufstand).length === 0
              ? frischAbgesagt === 1
                ? 'Ein Termin ist abgesagt. Jetzt anrufen.'
                : `${frischAbgesagt} Termine sind abgesagt. Jetzt anrufen.`
              : null
          }
        />
      ) : seite.art === 'fertig' ? (
        <div className="flex flex-col gap-4">
          {nichtErreicht.length > 0 ? (
            <ListRows rahmen={false} beschriftung="Noch nicht erreicht">
              {nichtErreicht.map((termin) => {
                const nummer = rufnummern(termin)[0];
                const zurPerson = () =>
                  setAbfolge(aendern(abfolge, { art: 'anruf', id: termin.id }));
                return (
                  <ListRow
                    key={termin.id}
                    zeit={formatLocalTime(termin.starts_at, termin.organization_time_zone)}
                    titel={name(termin)}
                    meta={nummer?.anzeige ?? 'Keine Rufnummer hinterlegt.'}
                    // Die Zeile führt zur Seite der Person, etwa um die
                    // Antwort zu ändern.
                    onClick={zurPerson}
                    aktion={
                      nummer ? (
                        // „Anrufen“ wählt gleich (BEF-192) und stellt
                        // dahinter die Seite der Person, die nach dem Anruf
                        // fragt, ob sie erreicht ist: zwei Tipps statt drei.
                        <a
                          href={nummer.href}
                          className={knopfKlassen('secondary', 'kompakt')}
                          aria-label={`${name(termin)} noch einmal anrufen`}
                          onClick={zurPerson}
                        >
                          Anrufen
                        </a>
                      ) : null
                    }
                  />
                );
              })}
            </ListRows>
          ) : null}
          <p className="text-ink text-sm">
            {erreicht.length === 1 ? '1 Person erreicht' : `${erreicht.length} Personen erreicht`}
            {anzurufen.length > 0 ? ` von ${anzurufen.length}.` : '.'}
          </p>
          <Kleingedrucktes>
            Der Anrufstand steht nur in dieser Adresse und wird nicht gespeichert.
          </Kleingedrucktes>
        </div>
      ) : null}
    </GefuehrterAblauf>
  );
}

export function TagUmplanenPage({ user }: { user: CurrentUser }) {
  const [suche] = useSearchParams();
  const person = suche.get('person');
  const datum = suche.get('datum');

  // Ungültige Parameter fallen nicht still auf einen Standard zurück: „Tag
  // umplanen" ohne die richtige Person wäre der teuerste denkbare Irrtum.
  if (!person || !UUID_MUSTER.test(person) || !datum || !istIsoDatum(datum)) {
    return (
      <>
        <PageHeader title="Tag umplanen" />
        <ErrorState
          title="Person und Tag fehlen"
          description="Diese Seite wird aus dem Kalender geöffnet, wenn dort eine behandelnde Person und ein Tag gewählt sind."
        />
        {/* Der Weg dorthin als Schaltfläche, mit dem mitgereisten Rückweg
            (NAV-02) - bisher ein 14-px-Textlink, der ihn überging. */}
        <div className="mt-4">
          <ButtonLink to={leseRueckweg(suche, '/kalender')} variant="secondary">
            Zum Kalender
          </ButtonLink>
        </div>
      </>
    );
  }

  return <Umplanung staffMemberId={person} datum={datum} user={user} />;
}
