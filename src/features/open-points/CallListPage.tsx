import { useId, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Disclosure } from '@/components/ui/Card';
import { Kleingedrucktes } from '@/components/ui/Kleingedrucktes';
import { Listenabschnitt } from '@/components/ui/Listenabschnitt';
import { ListRow } from '@/components/ui/ListRow';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { kartenAktionKlassen } from '@/components/ui/buttonStile';
import type { CurrentUser } from '@/features/session/types';
import { mitRueckweg } from '@/lib/rueckweg';
import { telHref } from '@/lib/telefon';
import { Arbeitszeile } from './Arbeitszeile';
import {
  CALL_LIST_KEY,
  fetchCallList,
  recordCallOutcome,
  stillToCall,
  type CallEntry,
  type CallOutcome,
} from './call-list-api';
import { Anrufknopf } from './Symbole';
import { formatDate, formatLocalTime, todayInTimeZone, tagePlus } from '@/lib/datum';
import { appointmentTypeHint, notificationChannelLabels } from '@/lib/termin';

const TAG = /^\d{4}-\d{2}-\d{2}$/;

const outcomeLabels: Record<'not_reached' | 'voicemail', string> = {
  not_reached: 'Nicht erreicht',
  voicemail: 'Nachricht hinterlassen',
};

/** Die Rufnummern eines Eintrags, Festnetz zuerst - wie bisher. */
function rufnummern(entry: CallEntry): { label: string; nummer: string }[] {
  return [
    entry.phone ? { label: 'Tel.', nummer: entry.phone } : null,
    entry.phone_mobile ? { label: 'Mobil', nummer: entry.phone_mobile } : null,
  ].filter((n): n is { label: string; nummer: string } => n !== null);
}

/** Beginn und, darunter leise, Ende - die Zeitspalte der Zeile. */
function Zeit({ entry }: { entry: CallEntry }) {
  return (
    <>
      {formatLocalTime(entry.starts_at, entry.organization_time_zone)}
      <span className="sr-only"> bis </span>
      <span className="text-ink-muted block text-sm font-normal">
        {formatLocalTime(entry.ends_at, entry.organization_time_zone)}
      </span>
    </>
  );
}

/** Terminart (nur abweichend, ANN-192), Ort, bei wem, wer zuletzt anrief. */
function nebenzeile(entry: CallEntry): string {
  return [
    appointmentTypeHint(entry.appointment_type),
    entry.location_name,
    entry.staff_name ? `bei ${entry.staff_name}` : null,
    entry.call_outcome && entry.call_recorded_by_name
      ? `zuletzt angerufen von ${entry.call_recorded_by_name}`
      : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * Der gespeicherte Ausgang des letzten Anrufs, Zeichen und Wort - als Zeile
 * unter dem Namen, die umbrechen darf; als Abzeichen rechts nähme er dem
 * Namen am Telefon den Platz. Der Regelfall „offen" trägt keinen (UX-005h).
 */
function Ausgang({ entry }: { entry: CallEntry }) {
  if (!entry.call_outcome) return null;
  return (
    <span className="text-warnung mt-0.5 block font-semibold">
      <span aria-hidden="true">! </span>
      {outcomeLabels[entry.call_outcome]}
      {entry.call_attempts && entry.call_attempts > 1 ? ` (${entry.call_attempts}×)` : ''}
    </span>
  );
}

/**
 * Ein Termin, für den noch angerufen wird: die Zeile führt in die Akte,
 * daneben der Anruf (`tel:`) und „mehr" für die Ausgänge. Wer über den
 * Hörer anruft, bekommt die Ausgänge gleich darunter - nach dem Gespräch ist
 * der nächste Tipp „Erreicht" oder „Nicht erreicht".
 */
function AnrufZeile({
  entry,
  zurueck,
  offen,
  setOffen,
}: {
  entry: CallEntry;
  zurueck: string;
  offen: boolean;
  setOffen: (offen: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const vermerken = useMutation({
    mutationFn: (outcome: CallOutcome) => recordCallOutcome(entry.appointment_id, outcome),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: CALL_LIST_KEY });
    },
  });
  const nummern = rufnummern(entry);
  const erste = nummern[0];
  const laeuft = vermerken.isPending;
  const name = `${entry.patient_given_name} ${entry.patient_family_name}`;
  const bereich = useId();

  return (
    <Arbeitszeile
      zeit={<Zeit entry={entry} />}
      titel={<span className="wrap-anywhere">{name}</span>}
      meta={
        <>
          {[nebenzeile(entry), nummern.length === 0 ? 'Keine Rufnummer hinterlegt' : null]
            .filter(Boolean)
            .join(' · ')}
          <Ausgang entry={entry} />
        </>
      }
      to={mitRueckweg(`/patienten/${entry.patient_id}`, zurueck)}
      aktion={
        erste ? (
          <Anrufknopf
            nummer={erste.nummer}
            beschriftung={`${name} anrufen, ${erste.label} ${erste.nummer}`}
            onClick={() => setOffen(true)}
          />
        ) : null
      }
      unten={
        <>
          {/* Sichtbar mit Wort und Rahmen unter der Zeile (R2-O5): Hinter
              „…“ ohne Rahmen fand ihn nur, wer ihn kannte - wer vom
              Tischtelefon anruft, braucht ihn aber jedes Mal. */}
          <div>
            <Button
              type="button"
              variant="secondary"
              groesse="kompakt"
              aria-label={`Anruf vermerken: ${name}`}
              aria-expanded={offen}
              aria-controls={bereich}
              onClick={() => setOffen(!offen)}
            >
              Anruf vermerken
            </Button>
          </div>
          {offen ? (
            <div id={bereich} className="flex flex-col gap-3">
              {nummern.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {nummern.map((n) => (
                    <a key={n.label} href={telHref(n.nummer)} className={kartenAktionKlassen()}>
                      <span className="text-ink-muted">{n.label}</span>
                      <span className="tabular-nums">{n.nummer}</span>
                    </a>
                  ))}
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2" role="group" aria-label={`Anruf bei ${name}`}>
                {/* Sekundär wie die übrigen: ein Hauptknopf je Ansicht, und die
                  Liste trägt viele Zeilen (Bedienprinzipien, UX-EPIC-002). */}
                <Button
                  type="button"
                  variant="secondary"
                  groesse="kompakt"
                  disabled={laeuft}
                  onClick={() => vermerken.mutate('reached')}
                >
                  Erreicht, bestätigt
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  groesse="kompakt"
                  disabled={laeuft}
                  onClick={() => vermerken.mutate('not_reached')}
                >
                  Nicht erreicht
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  groesse="kompakt"
                  disabled={laeuft}
                  onClick={() => vermerken.mutate('voicemail')}
                >
                  Nachricht hinterlassen
                </Button>
                {entry.call_outcome ? (
                  <Button
                    type="button"
                    variant="quiet"
                    groesse="kompakt"
                    disabled={laeuft}
                    onClick={() => vermerken.mutate('cleared')}
                  >
                    Zurücksetzen
                  </Button>
                ) : null}
              </div>
              {vermerken.isError ? (
                <Statusmeldung ton="fehler">{vermerken.error.message}</Statusmeldung>
              ) : null}
            </div>
          ) : null}
        </>
      }
    />
  );
}

/**
 * Anrufliste (PRX-014): wen das Büro vor einem Tag anruft, um den Termin zu
 * bestätigen. Der Stand bleibt gespeichert - wer zu zweit telefoniert oder
 * zwischendurch etwas anderes tut, fängt nicht von vorn an.
 *
 * Seitentyp Liste (DESIGN.md): je Termin eine Zeile mit Uhrzeit, Name und dem
 * Anruf daneben; die Ausgänge stehen unter der Zeile, an der gerade
 * telefoniert wird. Wer schon mitgeteilt ist (Zettel, persönlich,
 * telefonisch), steht unten und braucht keinen Anruf. Versendet wird nichts
 * (B15).
 */
export function CallListPage({ user }: { user: CurrentUser }) {
  const zeitzone = user.organizationTimeZone ?? 'Europe/Berlin';
  const heute = todayInTimeZone(zeitzone);
  const [suche, setSuche] = useSearchParams();
  const param = suche.get('datum');
  const datum = param && TAG.test(param) ? param : tagePlus(heute, 1);
  const hier = `/offen/anrufe?datum=${datum}`;
  // Die Zeile, an der gerade telefoniert wird - ihre Ausgänge stehen offen.
  const [aktiv, setAktiv] = useState<string | null>(null);

  const abfrage = useQuery({
    queryKey: [...CALL_LIST_KEY, datum],
    queryFn: () => fetchCallList(datum),
    retry: false,
  });

  function wechseln(tage: number) {
    setAktiv(null);
    setSuche({ datum: tagePlus(datum, tage) }, { replace: true });
  }

  return (
    <>
      <Rueckweg standard="/offen" beschriftung="Zurück zu den offenen Punkten" />
      <PageHeader
        title="Anrufliste"
        description={`${datum === tagePlus(heute, 1) ? 'Morgen, ' : ''}${formatDate(datum)}`}
        actions={
          // Mit Wort statt nackter Pfeile (R2-O5): „‹“ allein war ein Zeichen
          // von 8 px in einem 44-px-Kasten.
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={() => wechseln(-1)}>
              <span aria-hidden="true">‹</span> Vortag
            </Button>
            <Button type="button" variant="secondary" onClick={() => wechseln(1)}>
              Folgetag <span aria-hidden="true">›</span>
            </Button>
          </div>
        }
      />
      <Abfragezustand
        abfrage={abfrage}
        laden="Anrufliste wird geladen …"
        fehler="Die Anrufliste konnte nicht geladen werden."
        inKarte
        leer={{
          wenn: (eintraege) => eintraege.length === 0,
          titel: 'An diesem Tag stehen keine Behandlungstermine.',
        }}
      >
        {(eintraege) => {
          const anzurufen = eintraege.filter(stillToCall);
          const erledigt = eintraege.filter((entry) => !stillToCall(entry));
          return (
            <>
              <Listenabschnitt
                titel="Anzurufen"
                anzahl={anzurufen.length}
                leer={{ titel: 'Alle Termine dieses Tages sind mitgeteilt.' }}
              >
                {anzurufen.map((entry) => (
                  <AnrufZeile
                    key={entry.appointment_id}
                    entry={entry}
                    zurueck={hier}
                    offen={aktiv === entry.appointment_id}
                    setOffen={(offen) => setAktiv(offen ? entry.appointment_id : null)}
                  />
                ))}
              </Listenabschnitt>
              {erledigt.length > 0 ? (
                <Listenabschnitt titel="Schon mitgeteilt" anzahl={erledigt.length}>
                  {erledigt.map((entry) => (
                    <ListRow
                      key={entry.appointment_id}
                      zeit={<Zeit entry={entry} />}
                      titel={`${entry.patient_given_name} ${entry.patient_family_name}`}
                      meta={nebenzeile(entry)}
                      // Der Abschnitt sagt schon „Schon mitgeteilt": das
                      // Abzeichen nennt nur den Weg (UX-005h).
                      status={
                        <Badge ton="positiv">
                          {entry.notified_channels
                            .map((k) => notificationChannelLabels[k].kurz)
                            .join(', ')}
                        </Badge>
                      }
                      to={mitRueckweg(`/patienten/${entry.patient_id}`, hier)}
                      gedaempft
                    />
                  ))}
                </Listenabschnitt>
              ) : null}
            </>
          );
        }}
      </Abfragezustand>

      {/* Nachschlagetext, einmal gelernt - zugeklappt statt auf jeder
          Liste (UX-005h). */}
      <div className="mt-8">
        <Disclosure summary="Was wird gespeichert?">
          <Kleingedrucktes>
            „Erreicht, bestätigt“ vermerkt am Termin „telefonisch mitgeteilt“. „Nicht erreicht“ und
            „Nachricht hinterlassen“ gelten nur für diesen Termin und werden zwei Wochen danach
            gelöscht. Die Anwendung ruft nicht an und versendet nichts.
          </Kleingedrucktes>
        </Disclosure>
      </div>
    </>
  );
}
