import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { Button } from '@/components/ui/Button';
import { Disclosure } from '@/components/ui/Card';
import { Checkbox } from '@/components/ui/Checkbox';
import { Formularfuss } from '@/components/ui/Formularfuss';
import { Rueckmeldung } from '@/components/ui/Rueckmeldung';
import { Select } from '@/components/ui/Select';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Textlink } from '@/components/ui/Textlink';
import { Zwischentitel } from '@/components/ui/Zwischentitel';
import { MAHLZEIT_NAMEN, MAHLZEITEN, type Mahlzeit } from '@/features/nutrition/tagebuch';
import { erinnerungenSchluessel, type Plattformzugang, type Tagebucherinnerungen } from './api';
import { usePlattformApi } from './einsicht';
import { PLATTFORM_PFAD } from './pfade';

/**
 * Erinnerungen an das Tagebuch (ERN-009, ADR-027 Punkt 12): je Mahlzeit eine
 * Uhrzeit, per Mail oder Push - von Anfang an aus, abschalten kostet nichts.
 * Der Text sagt nichts über Ernährung („Erinnerung: Ihr Eintrag für heute.“,
 * ADR-024 Punkt 14). Die Wahl gilt für diesen Zugang; die Praxis sieht sie
 * nicht (ANN-344).
 */
const VORSCHLAG: Record<Mahlzeit, string> = {
  breakfast: '08:00',
  lunch: '12:30',
  dinner: '18:30',
  snack: '15:30',
};

/** 05:00 bis 23:45 in Viertelstunden. */
const UHRZEITEN = Array.from({ length: 76 }, (_, i) => {
  const minuten = 5 * 60 + i * 15;
  return `${String(Math.floor(minuten / 60)).padStart(2, '0')}:${String(minuten % 60).padStart(2, '0')}`;
});

export function TagebuchErinnerungen({ zugang }: { zugang: Plattformzugang }) {
  const api = usePlattformApi();
  const [offen, setOffen] = useState(false);
  const abfrage = useQuery({
    queryKey: erinnerungenSchluessel(zugang.access_id),
    queryFn: () => api.ladeErinnerungen(zugang.access_id),
    enabled: offen,
  });
  const an = abfrage.data ? abfrage.data.reminders.length > 0 : null;
  return (
    <Disclosure
      summary={`Erinnerungen${an === null ? '' : an ? ' · an' : ' · aus'}`}
      onUmschalten={setOffen}
    >
      {offen ? (
        <Abfragezustand
          abfrage={abfrage}
          laden="Wird geladen …"
          fehler="Ihre Erinnerungen konnten nicht geladen werden."
          leer={{ wenn: (daten) => !daten, titel: 'Zurzeit keine Ernährungsberatung.' }}
        >
          {(daten) => <Wahl zugang={zugang} daten={daten!} />}
        </Abfragezustand>
      ) : null}
    </Disclosure>
  );
}

function Wahl({ zugang, daten }: { zugang: Plattformzugang; daten: Tagebucherinnerungen }) {
  const api = usePlattformApi();
  const queryClient = useQueryClient();
  const [zeiten, setZeiten] = useState<Partial<Record<Mahlzeit, string>>>(() =>
    Object.fromEntries(daten.reminders.map((r) => [r.meal, r.time])),
  );
  // Ohne Wahl eines Wegs schlägt die erste Erinnerung die Mail vor.
  const [mail, setMail] = useState(daten.email || (!daten.push && daten.reminders.length === 0));
  const [push, setPush] = useState(daten.push);
  const [gespeichert, setGespeichert] = useState(0);
  const speichern = useMutation({
    mutationFn: () => {
      const liste = MAHLZEITEN.flatMap((m) => (zeiten[m] ? [{ meal: m, time: zeiten[m] }] : []));
      // Ohne Uhrzeit ist alles aus - auch die Wege dieser Art.
      return api.erinnerungenSpeichern(
        zugang.access_id,
        liste,
        liste.length === 0 ? { email: false, push: false } : { email: mail, push },
      );
    },
    onSuccess: async () => {
      setGespeichert((n) => n + 1);
      await queryClient.invalidateQueries({ queryKey: erinnerungenSchluessel(zugang.access_id) });
    },
  });
  const ruhe = daten.quiet_from !== daten.quiet_until;
  const ohneWeg = Object.values(zeiten).some(Boolean) && !mail && !push;
  return (
    <form
      aria-label="Erinnerungen wählen"
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        speichern.mutate();
      }}
    >
      {daten.switched_off ? (
        <Statusmeldung ton="warnung">
          Ihre Praxis hat diese Erinnerung für alle abgeschaltet.
        </Statusmeldung>
      ) : null}
      {MAHLZEITEN.map((m) => (
        <div key={m} className="flex flex-col gap-2">
          <Checkbox
            label={MAHLZEIT_NAMEN[m]}
            checked={Boolean(zeiten[m])}
            onChange={(event) =>
              setZeiten((z) => ({ ...z, [m]: event.target.checked ? VORSCHLAG[m] : undefined }))
            }
          />
          {zeiten[m] ? (
            <Select
              label={`Uhrzeit ${MAHLZEIT_NAMEN[m]}`}
              value={zeiten[m]}
              onChange={(event) => setZeiten((z) => ({ ...z, [m]: event.target.value }))}
            >
              {UHRZEITEN.map((u) => (
                <option key={u} value={u}>
                  {u} Uhr
                </option>
              ))}
            </Select>
          ) : null}
        </div>
      ))}
      <Zwischentitel>Wie</Zwischentitel>
      <Checkbox
        label="Per Mail"
        checked={mail}
        onChange={(event) => setMail(event.target.checked)}
      />
      <Checkbox
        label="Per Push"
        hint={
          <>
            Auf Geräten, die unter{' '}
            <Textlink to={`${PLATTFORM_PFAD}/einstellungen`}>Einstellungen</Textlink> für Push
            angemeldet sind.
          </>
        }
        checked={push}
        onChange={(event) => setPush(event.target.checked)}
      />
      {ruhe ? (
        <p className="text-ink-muted text-base">
          Zwischen {daten.quiet_from} und {daten.quiet_until} Uhr ruhen Benachrichtigungen; was
          hineinfiele, entfällt.
        </p>
      ) : null}
      {ohneWeg ? <Statusmeldung ton="warnung">Bitte Mail oder Push wählen.</Statusmeldung> : null}
      {speichern.isError ? (
        <Statusmeldung ton="fehler">{speichern.error.message}</Statusmeldung>
      ) : null}
      {gespeichert > 0 ? <Rueckmeldung key={gespeichert}>Gespeichert.</Rueckmeldung> : null}
      <Formularfuss dicht>
        <Button type="submit" variant="secondary" disabled={speichern.isPending || ohneWeg}>
          {speichern.isPending ? 'Wird gespeichert …' : 'Speichern'}
        </Button>
      </Formularfuss>
    </form>
  );
}
