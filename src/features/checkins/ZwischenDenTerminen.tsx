import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Section } from '@/components/ui/Section';
import { Select } from '@/components/ui/Select';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Verlaufstabelle } from '@/components/ui/Verlaufstabelle';
import { formatDate } from '@/lib/datum';
import {
  CHECKIN_HOECHSTENS,
  CHECKIN_VOREINSTELLUNG,
  erfassungsgroesse,
  groessenImTakt,
  nurFragen,
} from '@/lib/erfassungsgroessen';
import {
  TAKTE,
  checkinsKey,
  endCheckinTakt,
  fetchCheckins,
  saveCheckinTakt,
  taktText,
  uhrzeit,
  type CheckinDaten,
  type Verhaeltnisart,
} from './api';
import { Gewohnheiten } from './Gewohnheiten';
import { verlaufsmarkierungen } from './markierungen';
import { Verlaufsbilder, Verlaufsereignisse } from './Verlauf';

/**
 * „Zwischen den Terminen" an Akte und Trainingsverhältnis (TRK-002, DSN-001
 * Abschnitt 6): der Takt des Check-ins mit „ändern" und die Angaben der
 * Person je Größe über die Zeit (TRK-006).
 *
 * Die Angaben stehen unverändert da, mit Wert und Quelle – keine Farbe, keine
 * Tendenz, kein Satz über ihre Bedeutung (ADR-006 Punkt 11). Es gibt keinen
 * Alarm je Check-in (DSN-001 D5). Ob der Abschnitt erscheint, wer einstellt
 * und was gelesen wird, entscheidet der Server (ANN-351); ohne Recht liefert er
 * nichts und der Abschnitt bleibt weg.
 */
export function ZwischenDenTerminen({
  art,
  verhaeltnisId,
}: {
  art: Verhaeltnisart;
  verhaeltnisId: string;
}) {
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: checkinsKey(art, verhaeltnisId),
    queryFn: () => fetchCheckins(art, verhaeltnisId),
  });
  if (data === null) return null;
  return (
    <Section
      titel="Zwischen den Terminen"
      hinweis="Check-ins der Person über die Plattform. Gelesen wird beim nächsten Termin – es gibt keinen Alarm."
      rahmen
    >
      {isPending ? (
        <LoadingState label="Check-ins werden geladen …" />
      ) : isError ? (
        <ErrorState
          title="Die Check-ins konnten nicht geladen werden."
          description="Bitte die Verbindung prüfen und erneut versuchen."
          onErneut={() => refetch()}
        />
      ) : (
        <>
          <Takt art={art} verhaeltnisId={verhaeltnisId} daten={data} />
          <Angaben art={art} verhaeltnisId={verhaeltnisId} daten={data} />
          {/* ALT-003: Gewohnheiten der Person (IDEA-ALT-002, ANN-370). */}
          <Gewohnheiten art={art} verhaeltnisId={verhaeltnisId} daten={data} />
        </>
      )}
    </Section>
  );
}

function Takt({
  art,
  verhaeltnisId,
  daten,
}: {
  art: Verhaeltnisart;
  verhaeltnisId: string;
  daten: CheckinDaten;
}) {
  const [bearbeiten, setBearbeiten] = useState(false);
  const [beendenFehler, setBeendenFehler] = useState<string | undefined>(undefined);
  const queryClient = useQueryClient();
  const takt = daten.schedule;

  if (bearbeiten) {
    return (
      <TaktFormular
        art={art}
        verhaeltnisId={verhaeltnisId}
        tage={takt?.interval_days ?? 7}
        fragen={takt?.parameter_keys ?? [...CHECKIN_VOREINSTELLUNG]}
        onFertig={() => setBearbeiten(false)}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {takt ? (
        <div className="text-ink flex flex-col gap-1">
          <p>
            <span className="font-semibold">Check-in: {taktText(takt.interval_days)}</span>
            {' · '}
            {takt.due_on === null
              ? 'beendet – die Person antwortet nicht mehr'
              : takt.due_on <= daten.today
                ? takt.due_on === daten.today
                  ? 'heute fällig'
                  : `fällig seit ${formatDate(takt.due_on)}`
                : `nächster ab ${formatDate(takt.due_on)}`}
          </p>
          <p className="text-ink-muted text-sm">
            Fragen: {nurFragen(takt.parameter_keys).map(kurzname).join(', ')}
          </p>
          {takt.parameter_keys.length > nurFragen(takt.parameter_keys).length ? (
            <p className="text-ink-muted text-sm">
              Zum Zusammenhang:{' '}
              {takt.parameter_keys
                .filter((k) => !nurFragen([k]).length)
                .map(kurzname)
                .join(', ')}
            </p>
          ) : null}
          {takt.updated_by_name ? (
            <p className="text-ink-muted text-sm">
              Eingestellt von {takt.updated_by_name} am {formatDate(takt.updated_at.slice(0, 10))}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="text-ink">Kein Check-in eingestellt.</p>
      )}
      {daten.can_write && (takt || daten.relationship_open) ? (
        <div className="flex flex-col gap-3 sm:flex-row">
          {/* Nach dem Ende des Verhältnisses nur noch beenden (Zweitreview S5). */}
          {daten.relationship_open ? (
            <Button variant="secondary" onClick={() => setBearbeiten(true)}>
              {takt ? 'Check-in ändern' : 'Check-in einstellen'}
            </Button>
          ) : null}
          {takt ? (
            <Rueckfrage
              ausloeser="Check-in beenden"
              ausloeserVariante="quiet"
              bestaetigen="Check-in beenden"
              bestaetigenLaeuft="Wird beendet …"
              fehler={beendenFehler}
              onBestaetigen={async () => {
                setBeendenFehler(undefined);
                await endCheckinTakt(art, verhaeltnisId).catch((grund: Error) => {
                  setBeendenFehler(grund.message);
                  throw grund;
                });
                await queryClient.invalidateQueries({
                  queryKey: checkinsKey(art, verhaeltnisId),
                });
              }}
            >
              <p>
                Die Person wird nicht mehr um einen Check-in gebeten. Was sie schon angegeben hat,
                bleibt hier stehen.
              </p>
            </Rueckfrage>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function TaktFormular({
  art,
  verhaeltnisId,
  tage: tageVorher,
  fragen: fragenVorher,
  onFertig,
}: {
  art: Verhaeltnisart;
  verhaeltnisId: string;
  tage: number;
  fragen: string[];
  onFertig: () => void;
}) {
  const [tage, setTage] = useState(tageVorher);
  const [fragen, setFragen] = useState<string[]>(fragenVorher);
  const [hinweis, setHinweis] = useState<string | undefined>(undefined);
  const queryClient = useQueryClient();
  const speichern = useMutation({
    mutationFn: () => saveCheckinTakt(art, verhaeltnisId, tage, fragen),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: checkinsKey(art, verhaeltnisId) });
      onFertig();
    },
  });
  // Ein Takt außerhalb der Auswahl bleibt wählbar, wenn er schon gilt.
  const takte = TAKTE.includes(tageVorher as (typeof TAKTE)[number])
    ? [...TAKTE]
    : [...TAKTE, tageVorher].sort((a, b) => a - b);
  // Der Zusammenhang zählt nicht zu den fünf (ANN-355).
  const voll = nurFragen(fragen).length >= CHECKIN_HOECHSTENS;

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (nurFragen(fragen).length === 0) {
          setHinweis('Bitte mindestens eine Frage wählen.');
          return;
        }
        setHinweis(undefined);
        speichern.mutate();
      }}
    >
      <Select label="Wie oft?" value={tage} onChange={(e) => setTage(Number(e.target.value))}>
        {takte.map((t) => (
          <option key={t} value={t}>
            {taktText(t)}
          </option>
        ))}
      </Select>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-ink mb-1 text-sm font-medium">
          Welche Fragen? (eine bis {CHECKIN_HOECHSTENS})
        </legend>
        {/* TRK-004: nach Gruppen, damit zwölf Fragen überschaubar bleiben. */}
        {FRAGENGRUPPEN.map((gruppe) => (
          <div key={gruppe} className="flex flex-col gap-2">
            <p className="text-ink-muted mt-2 text-sm font-semibold">{gruppe}</p>
            {groessenImTakt('checkin')
              .filter((g) => g.gruppe === gruppe)
              .map((g) => {
                const gewaehlt = fragen.includes(g.key);
                return (
                  <Checkbox
                    key={g.key}
                    label={g.kurz}
                    hint={g.frage}
                    checked={gewaehlt}
                    disabled={!gewaehlt && voll}
                    onChange={(e) =>
                      setFragen((bisher) =>
                        e.target.checked ? [...bisher, g.key] : bisher.filter((k) => k !== g.key),
                      )
                    }
                  />
                );
              })}
          </div>
        ))}
      </fieldset>
      {/* TRK-005: Bedingungen, unter denen die Angaben entstehen (IDEA-TRK-006). */}
      <fieldset className="flex flex-col gap-2">
        <legend className="text-ink mb-1 text-sm font-medium">
          Zum Zusammenhang (zählt nicht zu den {CHECKIN_HOECHSTENS} Fragen)
        </legend>
        {/* ALT-002: die Aktivität außerhalb der Übungen als eigene Gruppe (ANN-369). */}
        {KONTEXTGRUPPEN.map((gruppe) => (
          <div key={gruppe.gruppe} className="flex flex-col gap-2">
            <p className="text-ink-muted mt-2 text-sm font-semibold">{gruppe.titel}</p>
            {groessenImTakt('checkin')
              .filter((g) => g.rolle === 'kontext' && g.gruppe === gruppe.gruppe)
              .map((g) => (
                <Checkbox
                  key={g.key}
                  label={g.kurz}
                  hint={g.frage}
                  checked={fragen.includes(g.key)}
                  onChange={(e) =>
                    setFragen((bisher) =>
                      e.target.checked ? [...bisher, g.key] : bisher.filter((k) => k !== g.key),
                    )
                  }
                />
              ))}
          </div>
        ))}
      </fieldset>
      {hinweis ? <Statusmeldung ton="fehler">{hinweis}</Statusmeldung> : null}
      {speichern.isError ? (
        <Statusmeldung ton="fehler">{speichern.error.message}</Statusmeldung>
      ) : null}
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button type="submit" disabled={speichern.isPending}>
          {speichern.isPending ? 'Wird gespeichert …' : 'Speichern'}
        </Button>
        <Button type="button" variant="secondary" onClick={onFertig}>
          Abbrechen
        </Button>
      </div>
    </form>
  );
}

const FRAGENGRUPPEN = ['Schmerz', 'Bewegung und Alltag'] as const;

const KONTEXTGRUPPEN = [
  { gruppe: 'Zusammenhang', titel: 'Schmerzmittel und Seite' },
  { gruppe: 'Aktivität', titel: 'Aktivität außerhalb der Übungen' },
] as const;

function kurzname(key: string): string {
  return erfassungsgroesse(key)?.kurz ?? key;
}

/**
 * Die Angaben je Größe über die Zeit (TRK-006, ANN-356): die Check-ins und
 * daneben, was die Person nach den Einheiten angegeben hat. Seit OUT-001 je
 * Größe als Punktbild mit Ereignissen, Planwechseln und Terminen
 * (IDEA-OUT-005), darunter unverändert die Tabelle mit allen Angaben. Wert,
 * Datum, Uhrzeit und Quelle – keine Tendenz, keine Farbe (ADR-006 Punkt 11).
 */
function Angaben({
  art,
  verhaeltnisId,
  daten,
}: {
  art: Verhaeltnisart;
  verhaeltnisId: string;
  daten: CheckinDaten;
}) {
  const vermerk = (art: string) => (art === 'legal_representative' ? 'Vertretung' : null);
  const markierungen = verlaufsmarkierungen(daten);
  return (
    <div className="mt-4 flex flex-col gap-4">
      {daten.checkins.length === 0 ? (
        <p className="text-ink-muted text-sm">Noch kein Check-in beantwortet.</p>
      ) : (
        <div className="flex flex-col gap-2">
          <h3 className="text-ink text-base font-semibold">Check-ins</h3>
          <Verlaufsbilder
            erfassungen={daten.checkins.map((c) => ({ datum: c.answered_on, werte: c.values }))}
            markierungen={markierungen}
            termine={daten.appointment_days}
          />
          <Verlaufstabelle
            titel="Angaben aus den Check-ins"
            spalten={daten.checkins.map((c) => ({
              id: c.recorded_at,
              datum: c.answered_on,
              zeit: uhrzeit(c.recorded_at, daten.time_zone),
              vermerk: vermerk(c.recorded_by_kind),
              werte: c.values,
            }))}
          />
        </div>
      )}
      {daten.sessions.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-ink text-base font-semibold">Nach den Einheiten</h3>
          <Verlaufsbilder
            erfassungen={daten.sessions.map((e) => ({ datum: e.performed_on, werte: e.values }))}
            markierungen={markierungen}
            termine={daten.appointment_days}
          />
          <Verlaufstabelle
            titel="Angaben nach den Einheiten"
            spalten={daten.sessions.map((e) => ({
              id: e.finished_at,
              datum: e.performed_on,
              zeit: uhrzeit(e.finished_at, daten.time_zone),
              // Plan und, wenn sie beendet hat, die Vertretung (Zweitreview).
              vermerk: [e.plan_title, vermerk(e.recorded_by_kind)].filter(Boolean).join(' · '),
              werte: e.values,
            }))}
          />
        </div>
      ) : null}
      <Verlaufsereignisse
        art={art}
        verhaeltnisId={verhaeltnisId}
        daten={daten}
        markierungen={markierungen}
      />
    </div>
  );
}
