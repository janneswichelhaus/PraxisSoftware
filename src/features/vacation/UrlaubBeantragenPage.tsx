import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { Button } from '@/components/ui/Button';
import { Disclosure } from '@/components/ui/Card';
import { GefuehrterAblauf } from '@/components/ui/GefuehrterAblauf';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { PageHeader } from '@/components/ui/PageHeader';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { TextArea } from '@/components/ui/TextArea';
import { Zwischentitel } from '@/components/ui/Zwischentitel';
import { roleLabels } from '@/components/ui/roleLabels';
import {
  aendern,
  beginne,
  kannZurueck,
  weiter,
  zurueck,
  type Abfolge,
} from '@/components/ui/abfolge';
import { istIsoDatum, monatPlus, monatsBeginn, tagePlus } from '@/features/appointments/calendar';
import { todayInTimeZone } from '@/features/appointments/api';
import { DaysToReschedule } from '@/features/appointments/DaysToReschedule';
import { EINGABETEXTE, useTextverlustschutz } from '@/features/documentation/Textverlustschutz';
import type { CurrentUser } from '@/features/session/types';
import { leseRueckweg, mitRueckweg } from '@/lib/rueckweg';
import {
  URLAUB_SCHLUESSEL,
  VORSCHAU_FEHLER,
  fetchUrlaub,
  previewLeave,
  requestLeave,
  urlaubSchluessel,
  type Urlaubsstand,
  type Urlaubsvorschau,
} from './api';
import { MONATE_VORAUS, Zeitraumkalender, type EigenerZeitraum } from './Zeitraumkalender';
import { feiertageZwischen, type Bundesland } from './feiertage';
import { urlaubsfenster } from './fenster';
import { terminePfad } from './termine';
import {
  KEINE_WAHL,
  monatKurz,
  tagKurz,
  urlaubstage,
  vollstaendig,
  zeitraumText,
  type Zeitraumwahl,
} from './zeitraum';

/**
 * Urlaub beantragen, geführt (G7, URL-001, Budget ≤ 6 Tipps, Ziel 5):
 * „Urlaub beantragen“ → Monat → erster Tag → letzter Tag (oder „1 Woche“,
 * „2 Wochen“ …) → Absenden. Je Seite eine Frage, keine rollt: ein Monat je
 * Kalenderseite, ‹ › zum Nachbarmonat (Design-Review Überholung 7).
 *
 * Steht der Zeitraum, zählt der Server die Urlaubstage nach dem Wochenplan
 * ohne Feiertage (ANN-577). Die Zusammenfassung nennt Zeitraum (ändern),
 * Tage samt Feiertagen darin, was danach übrig ist, wer zur selben Zeit
 * fehlt (nur Name und Zeitraum, BEF-066) und wer entscheidet. Die Notiz ist
 * eingeklappt und nur für die Person selbst (ANN-580).
 *
 * owner trägt den eigenen Urlaub direkt ein (ANN-576): dieselben Seiten, der
 * Hauptknopf heißt „Urlaub eintragen“. Weil er sofort gilt, nennt die
 * Zusammenfassung vorher Tage mit abweichenden Arbeitszeiten (dort hielte
 * er an) und danach die Tage mit Terminen zum Umplanen (ANN-578).
 */

type Seite = 'monat' | 'beginn' | 'ende' | 'abschluss' | 'fertig';

const URLAUBTEXTE = {
  ...EINGABETEXTE,
  bezeichnung: 'Noch nicht beantragt',
  zeile: {
    weitergehen: 'Der Urlaub ist noch nicht beantragt.',
    abmelden: 'Der Urlaub ist noch nicht beantragt – abmelden?',
    bleiben: 'Weiter',
  },
};

/**
 * Die Dauer ab dem ersten Tag als Schnellwahl auf der letzten Kalenderseite -
 * eine Reihe, damit auch ein Monat mit sechs Wochen ohne Rollen ins Bild
 * passt. Ein einzelner Tag ist der erste Tag noch einmal.
 */
const DAUERN = [
  { text: '1 Woche', tage: 6 },
  { text: '2 Wochen', tage: 13 },
  { text: '3 Wochen', tage: 20 },
] as const;

/** Höchstens 93 Tage trägt ein Antrag (Server: `app.assert_leave_period`). */
const LAENGSTENS = 92;

export function UrlaubBeantragenPage({ user }: { user: CurrentUser }) {
  const heute = todayInTimeZone(user.organizationTimeZone ?? 'Europe/Berlin');
  const fenster = urlaubsfenster(heute);
  const abfrage = useQuery({
    queryKey: urlaubSchluessel(fenster.von, fenster.bis),
    queryFn: () => fetchUrlaub(fenster.von, fenster.bis),
    retry: false,
  });

  return (
    <Abfragezustand
      abfrage={abfrage}
      laden="Urlaub wird geladen …"
      fehler="Der Urlaub konnte nicht geladen werden."
      rahmen={(zustand) => (
        <>
          <PageHeader title="Urlaub beantragen" />
          {zustand}
        </>
      )}
    >
      {(stand) => <Antrag stand={stand} heute={heute} user={user} />}
    </Abfragezustand>
  );
}

function eigeneZeitraeume(stand: Urlaubsstand): EigenerZeitraum[] {
  return stand.own
    .filter((a) => a.kind === 'leave' && (a.status === 'requested' || a.status === 'approved'))
    .map((a) => ({
      starts_on: a.starts_on,
      ends_on: a.ends_on,
      stand: a.status === 'approved' ? 'genehmigt' : 'beantragt',
    }));
}

/**
 * Die Wahl aus der Adresse (`?von=…&bis=…`) - nur ein Zeitraum, den der
 * Kalender selbst anböte: ab heute, höchstens 93 Tage, im wählbaren Fenster.
 */
function wahlAusAdresse(
  suche: URLSearchParams,
  heute: string,
  letzterTag: string,
): { von: string; bis: string } | null {
  const von = suche.get('von');
  const bis = suche.get('bis');
  if (!istIsoDatum(von) || !istIsoDatum(bis)) return null;
  if (von < heute || bis < von || bis > tagePlus(von, LAENGSTENS) || bis > letzterTag) return null;
  return { von, bis };
}

/** Was im Jahr des Beginns danach übrig bleibt; ohne Anspruch `null`. */
function restDanach(vorschau: Urlaubsvorschau): number | null {
  if (vorschau.balance.rest === null) return null;
  return vorschau.balance.rest - (vorschau.days - vorschau.days_following_year);
}

/** Was gegen den Zeitraum spricht - im Fuß über dem Hauptknopf. */
function hindernis(vorschau: Urlaubsvorschau, selbst: boolean): string | null {
  if (vorschau.overlaps_own) return 'Der Zeitraum überschneidet sich mit Ihrem Urlaub.';
  if (vorschau.days === 0) return 'In diesem Zeitraum liegt kein Arbeitstag.';
  // Nur wer selbst einträgt, hält hier an; sonst hält das Genehmigen an.
  if (selbst && vorschau.exception_days.length > 0) {
    // Seit ZK-001 zählt auch ein Freizeitausgleich dazu - der steht im Zeitkonto.
    return `Abweichende Arbeitszeiten oder Freizeitausgleich am ${vorschau.exception_days
      .map(tagKurz)
      .join(', ')} – erst in Planung oder Zeitkonto ändern.`;
  }
  return null;
}

function Antrag({ stand, heute, user }: { stand: Urlaubsstand; heute: string; user: CurrentUser }) {
  const navigate = useNavigate();
  const [suche] = useSearchParams();
  const rueckweg = leseRueckweg(suche, '/betrieb/urlaub');
  const queryClient = useQueryClient();
  const jahr = Number(heute.slice(0, 4));
  const selbst = stand.self_entered;
  const ersterMonat = monatsBeginn(heute);
  const letzterTag = tagePlus(monatPlus(ersterMonat, MONATE_VORAUS), -1);

  // Zurück von den Arbeitszeiten (eigener Eintrag mit abweichenden Zeiten):
  // die Wahl kommt aus der Adresse, der Ablauf steht wieder auf dem Abschluss.
  const [vorgabe] = useState(() => wahlAusAdresse(suche, heute, letzterTag));
  const [abfolge, setAbfolge] = useState<Abfolge<Seite>>(() =>
    vorgabe
      ? weiter(weiter(weiter(beginne<Seite>('monat'), 'beginn'), 'ende'), 'abschluss')
      : beginne<Seite>('monat'),
  );
  const [monat, setMonat] = useState(vorgabe ? monatsBeginn(vorgabe.von) : ersterMonat);
  const [wahl, setWahl] = useState<Zeitraumwahl>(vorgabe ?? KEINE_WAHL);
  const [notiz, setNotiz] = useState('');
  const [eingetragen, setEingetragen] = useState(false);
  const seite = eingetragen ? 'fertig' : abfolge.seite;

  const komplett = vollstaendig(wahl);
  const vorschau = useQuery({
    queryKey: [...URLAUB_SCHLUESSEL, 'preview', wahl.von, wahl.bis],
    queryFn: () => previewLeave(wahl.von!, wahl.bis!),
    enabled: komplett,
    retry: false,
    staleTime: 60_000,
  });
  const ergebnis = komplett ? vorschau.data : undefined;
  const grund = ergebnis ? hindernis(ergebnis, selbst) : null;
  const kannAbsenden = !!ergebnis && grund === null;

  const zurueckGehen = () => {
    const vorher = zurueck(abfolge);
    if (vorher) setAbfolge(vorher);
  };

  const { freigeben, schutz } = useTextverlustschutz({
    ungespeichert: seite !== 'fertig' && (wahl.von !== null || notiz.trim() !== ''),
    kompakt: true,
    texte: URLAUBTEXTE,
    schrittZurueck: seite !== 'fertig' && kannZurueck(abfolge) ? zurueckGehen : undefined,
  });

  const zeitraum = komplett ? zeitraumText(wahl.von, wahl.bis, jahr) : '';
  const tageText = ergebnis ? ` (${urlaubstage(ergebnis.days)})` : '';

  const absenden = useMutation({
    mutationFn: () =>
      requestLeave({
        von: wahl.von!,
        bis: wahl.bis!,
        notiz: notiz.trim() === '' ? null : notiz.trim(),
      }),
    onSuccess: async () => {
      freigeben();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: URLAUB_SCHLUESSEL }),
        // Selbst eingetragener Urlaub sperrt die Tage sofort (ANN-578).
        queryClient.invalidateQueries({ queryKey: ['working-hour-exceptions'] }),
      ]);
      // Eigener Urlaub mit Terminen: die Tage zum Umplanen, statt still zurück.
      if (selbst && ergebnis && ergebnis.appointment_days.length > 0) {
        setEingetragen(true);
        return;
      }
      void navigate(rueckweg, {
        state: {
          meldung: selbst
            ? `Urlaub eingetragen: ${zeitraum}${tageText}.`
            : `Urlaub beantragt: ${zeitraum}${tageText}. Es entscheidet: ${roleLabels.owner}.`,
        },
      });
    },
  });

  const hauptknopf = selbst ? 'Urlaub eintragen' : 'Urlaub beantragen';
  const schritt = { monat: 1, beginn: 2, ende: 3, abschluss: 4, fertig: 4 }[seite];
  const gemeinsam = {
    objekt: hauptknopf,
    schliessen: 'Schließen',
    onSchliessen: () => void navigate(rueckweg),
    seite,
    stand: { text: `Schritt ${schritt} von 4`, wert: schritt, von: 4 },
    onZurueck: seite !== 'fertig' && kannZurueck(abfolge) ? zurueckGehen : undefined,
    schutz,
  };

  // ---------------------------------------------------------------------------
  if (seite === 'fertig' && ergebnis && stand.my_staff_member_id) {
    return (
      <GefuehrterAblauf
        {...gemeinsam}
        titel="Eingetragen"
        abschluss
        fuss={
          <Button className="w-full" data-autofocus onClick={() => void navigate(rueckweg)}>
            Fertig
          </Button>
        }
      >
        <div className="flex flex-col gap-6">
          <Statusmeldung ton="erfolg">
            {`Urlaub eingetragen: ${zeitraum}${tageText}. Die Tage sind im Kalender gesperrt.`}
          </Statusmeldung>
          <DaysToReschedule
            staffMemberId={stand.my_staff_member_id}
            days={ergebnis.appointment_days}
            user={user}
            returnTo={terminePfad(stand.my_staff_member_id, wahl.von!, wahl.bis!, rueckweg)}
          />
        </div>
      </GefuehrterAblauf>
    );
  }

  // ---------------------------------------------------------------------------
  if (seite === 'monat') {
    const monate = Array.from({ length: MONATE_VORAUS }, (_, i) => monatPlus(ersterMonat, i));
    const jahre = [...new Set(monate.map((m) => m.slice(0, 4)))];
    return (
      <GefuehrterAblauf {...gemeinsam} titel="Ab welchem Monat?">
        <div className="flex flex-col gap-2">
          {jahre.map((j) => (
            <div key={j} role="group" aria-labelledby={`urlaub-jahr-${j}`}>
              <Zwischentitel id={`urlaub-jahr-${j}`}>{j}</Zwischentitel>
              <div className="grid grid-cols-3 gap-2">
                {monate
                  .filter((m) => m.startsWith(j))
                  .map((m) => (
                    // Der Name beginnt mit dem sichtbaren Wort (WCAG 2.5.3),
                    // die Wahl steht auch für Vorlesesoftware da.
                    <Button
                      key={m}
                      variant={wahl.von?.startsWith(m.slice(0, 7)) ? 'primary' : 'secondary'}
                      className="w-full"
                      aria-label={`${monatKurz(m)} ${j}`}
                      aria-pressed={wahl.von?.startsWith(m.slice(0, 7)) ?? false}
                      {...(m === ersterMonat ? { 'data-autofocus': true } : {})}
                      onClick={() => {
                        setMonat(m);
                        setAbfolge(weiter(abfolge, 'beginn'));
                      }}
                    >
                      {monatKurz(m)}
                    </Button>
                  ))}
              </div>
            </div>
          ))}
        </div>
      </GefuehrterAblauf>
    );
  }

  // ---------------------------------------------------------------------------
  if (seite === 'beginn' || seite === 'ende') {
    const beginn = seite === 'beginn';
    const von = wahl.von;
    const waehleEnde = (tag: string) => {
      setWahl({ von, bis: tag });
      setAbfolge(weiter(abfolge, 'abschluss', true));
    };
    return (
      <GefuehrterAblauf
        {...gemeinsam}
        titel={beginn ? 'Erster Urlaubstag?' : 'Letzter Urlaubstag?'}
        fuss={
          beginn || von === null ? undefined : (
            <div
              className="grid grid-cols-3 gap-2"
              role="group"
              aria-label="Dauer ab dem ersten Tag"
            >
              {DAUERN.map((d) => (
                <Button
                  key={d.text}
                  variant="secondary"
                  groesse="kompakt"
                  className="w-full"
                  onClick={() => waehleEnde(tagePlus(von, d.tage))}
                >
                  {d.text}
                </Button>
              ))}
            </div>
          )
        }
      >
        <Zeitraumkalender
          monat={monat}
          heute={heute}
          ab={beginn || von === null ? heute : von}
          bis={beginn || von === null ? letzterTag : tagePlus(von, LAENGSTENS)}
          land={stand.federal_state}
          wahl={wahl}
          eigene={eigeneZeitraeume(stand)}
          onMonat={setMonat}
          onWaehlen={(tag) => {
            if (beginn) {
              setWahl({ von: tag, bis: null });
              setMonat(monatsBeginn(tag));
              setAbfolge(weiter(abfolge, 'ende'));
            } else {
              waehleEnde(tag);
            }
          }}
        />
      </GefuehrterAblauf>
    );
  }

  // ---------------------------------------------------------------------------
  return (
    <GefuehrterAblauf
      {...gemeinsam}
      titel={`${hauptknopf}?`}
      abschluss
      fuss={
        <div className="flex flex-col gap-2">
          {grund ? <Statusmeldung ton="fehler">{grund}</Statusmeldung> : null}
          {absenden.isError ? (
            <Statusmeldung ton="fehler">
              {absenden.error instanceof Error
                ? absenden.error.message
                : 'Der Urlaub konnte nicht beantragt werden.'}
            </Statusmeldung>
          ) : null}
          <Button
            className="w-full"
            disabled={absenden.isPending || !kannAbsenden}
            onClick={() => absenden.mutate()}
          >
            {absenden.isPending ? 'Wird gesendet …' : hauptknopf}
          </Button>
          {/* Primär vor sekundär (Regel 4). Die Wahl reist im Rückweg mit
              und ist danach wieder da - deshalb hält der Schutz hier nicht an. */}
          {selbst && ergebnis && ergebnis.exception_days.length > 0 && stand.my_staff_member_id ? (
            <Button
              variant="secondary"
              className="w-full"
              onClick={() => {
                freigeben();
                void navigate(
                  mitRueckweg(
                    `/praxis/planung?person=${stand.my_staff_member_id}`,
                    mitRueckweg(
                      `/betrieb/urlaub/beantragen?von=${wahl.von}&bis=${wahl.bis}`,
                      rueckweg,
                    ),
                  ),
                );
              }}
            >
              Zu den Arbeitszeiten
            </Button>
          ) : null}
        </div>
      }
    >
      {/* Laden, Funkloch und Abweisung über den Baustein (Regel 8): mit
          „Erneut versuchen“, statt still auf denselben Tag zu warten. */}
      {komplett ? (
        <Abfragezustand
          abfrage={vorschau}
          laden="Urlaubstage werden gezählt …"
          fehler={VORSCHAU_FEHLER}
          endgueltig={{
            wenn: (fehler) => fehler instanceof Error && fehler.message !== VORSCHAU_FEHLER,
            titel: vorschau.error instanceof Error ? vorschau.error.message : VORSCHAU_FEHLER,
          }}
        >
          {(daten) => (
            <Zusammenfassung
              wahl={wahl}
              ergebnis={daten}
              jahr={jahr}
              land={stand.federal_state}
              selbst={selbst}
              notiz={notiz}
              onNotiz={setNotiz}
              onAendern={() => {
                setMonat(monatsBeginn(wahl.von));
                setAbfolge(aendern(abfolge, 'beginn'));
              }}
            />
          )}
        </Abfragezustand>
      ) : null}
    </GefuehrterAblauf>
  );
}

function Zusammenfassung({
  wahl,
  ergebnis,
  jahr,
  land,
  selbst,
  notiz,
  onNotiz,
  onAendern,
}: {
  wahl: { von: string; bis: string };
  ergebnis: Urlaubsvorschau;
  jahr: number;
  land: Bundesland;
  selbst: boolean;
  notiz: string;
  onNotiz: (text: string) => void;
  onAendern: () => void;
}) {
  const rest = restDanach(ergebnis);
  const konto = ergebnis.balance;
  const anspruch = konto.entitlement === null ? null : konto.entitlement + (konto.carryover ?? 0);
  const folgejahr = ergebnis.days_following_year;
  // Warum weniger Urlaubstage als Werktage: die Feiertage beim Namen (Regel 5).
  const feiertage = feiertageZwischen(wahl.von, wahl.bis, land);
  const termine = ergebnis.appointment_days.reduce((summe, t) => summe + t.appointments, 0);
  return (
    <div className="flex flex-col gap-4">
      <ListRows rahmen={false} beschriftung="Urlaub">
        <ListRow
          titel={zeitraumText(wahl.von, wahl.bis, jahr)}
          meta={[
            folgejahr > 0
              ? `${urlaubstage(ergebnis.days)}, davon ${folgejahr} im Jahr ${Number(wahl.bis.slice(0, 4))}`
              : urlaubstage(ergebnis.days),
            ...feiertage.map((f) => `${f.name} zählt nicht`),
          ].join(' · ')}
          aktion={
            <Button
              variant="secondary"
              groesse="kompakt"
              aria-label="Zeitraum ändern"
              onClick={onAendern}
            >
              Ändern
            </Button>
          }
        />
        <ListRow
          titel={
            rest === null || anspruch === null
              ? 'Anspruch noch nicht eingetragen'
              : `Danach ${rest} von ${anspruch} Tagen übrig`
          }
          meta={konto.requested > 0 ? `Dazu ${konto.requested} weitere beantragt` : undefined}
        />
        <ListRow
          titel={
            ergebnis.team.length === 0
              ? 'Zur selben Zeit fehlt niemand'
              : `Zur selben Zeit ${ergebnis.team.length === 1 ? 'fehlt' : 'fehlen'}`
          }
          meta={
            ergebnis.team.length === 0
              ? undefined
              : ergebnis.team
                  .map(
                    (t) =>
                      `${t.name ?? 'Unbekannt'} (${zeitraumText(t.starts_on, t.ends_on, jahr)})`,
                  )
                  .join(', ')
          }
        />
        {selbst && termine > 0 ? (
          <ListRow
            titel={`${termine} ${termine === 1 ? 'Termin' : 'Termine'} im Zeitraum`}
            meta="Nach dem Eintragen umplanen"
          />
        ) : null}
        <ListRow
          titel={selbst ? 'Sie tragen den Urlaub selbst ein' : 'Entscheidet'}
          meta={selbst ? 'Er gilt sofort als genehmigt.' : roleLabels.owner}
        />
      </ListRows>
      <Disclosure summary="Notiz hinzufügen" offen={notiz !== ''}>
        <TextArea
          label="Notiz – nur für Sie sichtbar"
          value={notiz}
          maxLength={500}
          rows={3}
          onChange={(e) => onNotiz(e.target.value)}
        />
      </Disclosure>
    </div>
  );
}
