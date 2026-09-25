import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Select } from '@/components/ui/Select';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { fetchAssignableTherapists, todayInTimeZone } from '@/features/appointments/api';
import { canManageWorkingHours, isOwner, type CurrentUser } from '@/features/session/types';
import {
  FRIST_VOREINSTELLUNG,
  FRIST_WERTE,
  fetchDocumentationDeadline,
  fristLabel,
  saveDocumentationDeadline,
} from '@/features/documentation/api';
import { StartortEinstellung } from '@/features/tours/StartortEinstellung';
import {
  RASTER_WERTE,
  WOCHENTAGE,
  bloeckeText,
  fetchWorkingHourExceptions,
  fetchWorkingHours,
  istRasterWert,
  saveAppointmentGrid,
  saveWorkingHourException,
  saveWorkingHours,
  wochenBloecke,
  wochentagLabels,
  type RasterWert,
  type Wochentag,
  type Zeitblock,
} from './api';

/**
 * Planungseinstellungen der Praxis (CAL-005).
 *
 * Zwei Dinge auf einer Seite, weil beide dieselbe Frage beantworten: wann
 * kann überhaupt geplant werden. Das Raster gilt für die ganze Praxis und darf
 * nur von owner geändert werden; die Arbeitszeiten gehören zur einzelnen
 * Person und werden von owner, team_lead und office gepflegt.
 *
 * Die Rollenprüfung hier steuert nur die Darstellung. Verbindlich prüfen
 * `set_appointment_grid`, `set_staff_working_hours` und
 * `set_staff_working_hour_exception` (ADR-004).
 */

/** Zwei leere Felder reichen für den Normalfall vormittags/nachmittags. */
const LEERER_BLOCK: Zeitblock = { von: '', bis: '' };

function gefuellt(bloecke: Zeitblock[]): Zeitblock[] {
  return bloecke.filter((b) => b.von !== '' && b.bis !== '');
}

/** Kalendertag ein Jahr später, über UTC gerechnet - keine Ortszeit im Spiel. */
function einJahrSpaeter(tag: string): string {
  const d = new Date(`${tag}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

// -----------------------------------------------------------------------------
// Praxisraster
// -----------------------------------------------------------------------------

function RasterEinstellung({ aktuell }: { aktuell: number | null }) {
  const queryClient = useQueryClient();
  const [wert, setWert] = useState<RasterWert>(istRasterWert(aktuell) ? aktuell : 5);
  const [gespeichert, setGespeichert] = useState(false);

  useEffect(() => {
    if (istRasterWert(aktuell)) setWert(aktuell);
  }, [aktuell]);

  const mutation = useMutation({
    mutationFn: () => saveAppointmentGrid(wert),
    onSuccess: async () => {
      setGespeichert(true);
      // Das Raster steckt in den Sitzungsdaten und steuert die Eingabefelder.
      await queryClient.invalidateQueries({ queryKey: ['current-user'] });
    },
  });

  return (
    <section className="border-line bg-surface rounded-card mb-8 border p-5">
      <h2 className="text-ink text-base font-semibold">Praxisraster</h2>
      <p className="text-ink-muted mt-1 max-w-prose text-sm">
        Auf welchen Minutenschritten ein Termin beginnen darf. Gilt für die gesamte Praxis. Die
        Dauer bleibt frei, und bestehende Termine außerhalb des Rasters bleiben erhalten.
      </p>

      <div className="mt-4 max-w-xs">
        <Select
          label="Minutenraster"
          value={String(wert)}
          onChange={(e) => {
            const gewaehlt = Number(e.target.value);
            if (istRasterWert(gewaehlt)) setWert(gewaehlt);
            setGespeichert(false);
          }}
        >
          {RASTER_WERTE.map((m) => (
            <option key={m} value={m}>
              {m} Minuten
            </option>
          ))}
        </Select>
      </div>

      {mutation.isError ? (
        <Statusmeldung ton="fehler" className="mt-3">
          {mutation.error.message}
        </Statusmeldung>
      ) : null}
      {gespeichert && !mutation.isPending && !mutation.isError ? (
        <Statusmeldung className="mt-3">Das Praxisraster ist gespeichert.</Statusmeldung>
      ) : null}

      <div className="mt-4">
        <Button type="button" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
          {mutation.isPending ? 'Wird gespeichert …' : 'Raster speichern'}
        </Button>
      </div>
    </section>
  );
}

// -----------------------------------------------------------------------------
// Frist der automatischen Finalisierung (DOK-004)
// -----------------------------------------------------------------------------

/**
 * Die Frist steht neben dem Praxisraster, weil beides Grundeinstellungen der
 * Praxis sind, die nur owner setzt (PROJECT_PRINCIPLES.md 4.1). Verbindlich
 * prueft `set_documentation_deadline`.
 */
function FristEinstellung({ organizationId }: { organizationId: string }) {
  const queryClient = useQueryClient();
  const [wert, setWert] = useState<number>(FRIST_VOREINSTELLUNG);
  const [gespeichert, setGespeichert] = useState(false);

  const frist = useQuery({
    queryKey: ['documentation-deadline', organizationId],
    queryFn: () => fetchDocumentationDeadline(organizationId),
    retry: false,
  });

  useEffect(() => {
    if (frist.data !== undefined) setWert(frist.data);
  }, [frist.data]);

  const mutation = useMutation({
    mutationFn: () => saveDocumentationDeadline(wert),
    onSuccess: async () => {
      setGespeichert(true);
      await queryClient.invalidateQueries({ queryKey: ['documentation-deadline'] });
    },
  });

  // Ein gespeicherter Wert ausserhalb der Stufen bleibt sichtbar und waehlbar.
  const werte = FRIST_WERTE.includes(wert as (typeof FRIST_WERTE)[number])
    ? [...FRIST_WERTE]
    : [...FRIST_WERTE, wert].sort((a, b) => a - b);

  return (
    <section className="border-line bg-surface rounded-card mb-8 border p-5">
      <h2 className="text-ink text-base font-semibold">Automatische Finalisierung</h2>
      <p className="text-ink-muted mt-1 max-w-prose text-sm">
        Ein Entwurf der Behandlungsdokumentation wird nach Ablauf dieser Frist automatisch
        finalisiert und ist ab dann Bestandteil der Akte. Die Frist zählt in Kalendertagen der
        Praxiszeitzone ab dem Behandlungstag; später angelegte Einträge und Nachträge bekommen sie
        ab ihrer Anlage.
      </p>

      {frist.isError ? (
        <Statusmeldung ton="fehler" className="mt-3">
          Die Dokumentationsfrist konnte nicht geladen werden.
        </Statusmeldung>
      ) : null}

      <div className="mt-4 max-w-xs">
        <Select
          label="Frist"
          value={String(wert)}
          disabled={frist.isPending}
          onChange={(e) => {
            setWert(Number(e.target.value));
            setGespeichert(false);
          }}
        >
          {werte.map((tage) => (
            <option key={tage} value={tage}>
              {fristLabel(tage)}
            </option>
          ))}
        </Select>
      </div>

      {mutation.isError ? (
        <Statusmeldung ton="fehler" className="mt-3">
          {mutation.error.message}
        </Statusmeldung>
      ) : null}
      {gespeichert && !mutation.isPending && !mutation.isError ? (
        <Statusmeldung className="mt-3">Die Frist ist gespeichert.</Statusmeldung>
      ) : null}

      <div className="mt-4">
        <Button
          type="button"
          disabled={mutation.isPending || frist.isPending}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? 'Wird gespeichert …' : 'Frist speichern'}
        </Button>
      </div>
    </section>
  );
}

// -----------------------------------------------------------------------------
// Wochenplan
// -----------------------------------------------------------------------------

function BlockFelder({
  bloecke,
  onChange,
  legende,
  // Wochenplan und Abweichung stehen auf derselben Seite. Ohne eigene
  // Beschriftung haetten ihre Felder identische Labels - fuer Screenreader
  // nicht unterscheidbar.
  blockLabel,
}: {
  bloecke: Zeitblock[];
  onChange: (bloecke: Zeitblock[]) => void;
  legende: string;
  blockLabel: string;
}) {
  function setzen(index: number, feld: keyof Zeitblock, wert: string) {
    onChange(bloecke.map((b, i) => (i === index ? { ...b, [feld]: wert } : b)));
  }

  return (
    <fieldset className="border-0 p-0">
      <legend className="text-ink text-sm font-medium">{legende}</legend>
      <div className="mt-2 flex flex-col gap-3">
        {bloecke.map((block, index) => (
          <div key={index} className="grid grid-cols-2 gap-3">
            <Field
              label={`${blockLabel} ${index + 1} von`}
              type="time"
              value={block.von}
              onChange={(e) => setzen(index, 'von', e.target.value)}
            />
            <Field
              label={`${blockLabel} ${index + 1} bis`}
              type="time"
              value={block.bis}
              onChange={(e) => setzen(index, 'bis', e.target.value)}
            />
          </div>
        ))}
      </div>
      <div className="mt-3">
        <Button
          type="button"
          variant="quiet"
          onClick={() => onChange([...bloecke, { ...LEERER_BLOCK }])}
        >
          Weiteren Block hinzufügen
        </Button>
      </div>
    </fieldset>
  );
}

function Wochenplan({
  staffMemberId,
  darfPflegen,
}: {
  staffMemberId: string;
  darfPflegen: boolean;
}) {
  const queryClient = useQueryClient();
  const [tag, setTag] = useState<Wochentag>(1);
  const [bloecke, setBloecke] = useState<Zeitblock[]>([{ ...LEERER_BLOCK }]);
  const [gespeichert, setGespeichert] = useState(false);

  const zeiten = useQuery({
    queryKey: ['working-hours'],
    queryFn: fetchWorkingHours,
    retry: false,
  });

  // Der gewählte Wochentag füllt die Felder. Ohne hinterlegte Zeit bleibt ein
  // leerer Block stehen, damit sofort etwas eingetragen werden kann.
  useEffect(() => {
    const vorhanden = zeiten.data ? wochenBloecke(zeiten.data, staffMemberId, tag) : [];
    setBloecke(vorhanden.length > 0 ? vorhanden : [{ ...LEERER_BLOCK }]);
    setGespeichert(false);
  }, [zeiten.data, staffMemberId, tag]);

  const mutation = useMutation({
    mutationFn: () => saveWorkingHours(staffMemberId, tag, gefuellt(bloecke)),
    onSuccess: async () => {
      setGespeichert(true);
      await queryClient.invalidateQueries({ queryKey: ['working-hours'] });
    },
  });

  if (zeiten.isPending) return <LoadingState label="Arbeitszeiten werden geladen …" />;
  if (zeiten.isError) return <ErrorState title="Die Arbeitszeiten konnten nicht geladen werden." />;

  return (
    <section className="border-line bg-surface rounded-card mb-8 border p-5">
      <h2 className="text-ink text-base font-semibold">Wochenplan</h2>
      <p className="text-ink-muted mt-1 max-w-prose text-sm">
        Der Normalfall dieser Person. Zeiten gelten in der Zeitzone der Praxis.
      </p>

      <ul className="divide-line border-line mt-4 divide-y border-y">
        {WOCHENTAGE.map((w) => (
          <li key={w} className="flex justify-between gap-4 py-2 text-sm">
            <span className="text-ink-muted">{wochentagLabels[w]}</span>
            <span className="text-ink text-right">
              {bloeckeText(wochenBloecke(zeiten.data ?? [], staffMemberId, w))}
            </span>
          </li>
        ))}
      </ul>

      {darfPflegen ? (
        <div className="mt-5 flex max-w-md flex-col gap-4">
          <Select
            label="Wochentag"
            value={String(tag)}
            onChange={(e) => setTag(Number(e.target.value) as Wochentag)}
          >
            {WOCHENTAGE.map((w) => (
              <option key={w} value={w}>
                {wochentagLabels[w]}
              </option>
            ))}
          </Select>

          <BlockFelder
            bloecke={bloecke}
            onChange={(neu) => {
              setBloecke(neu);
              setGespeichert(false);
            }}
            legende={`Zeitblöcke am ${wochentagLabels[tag]}`}
            blockLabel="Block"
          />

          {mutation.isError ? (
            <Statusmeldung ton="fehler">{mutation.error.message}</Statusmeldung>
          ) : null}
          {gespeichert && !mutation.isPending && !mutation.isError ? (
            <Statusmeldung>Der {wochentagLabels[tag]} ist gespeichert.</Statusmeldung>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <Button type="button" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
              {mutation.isPending ? 'Wird gespeichert …' : `${wochentagLabels[tag]} speichern`}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={mutation.isPending}
              onClick={() => setBloecke([{ ...LEERER_BLOCK }])}
            >
              Blöcke leeren
            </Button>
          </div>
          <p className="text-ink-subtle text-xs leading-relaxed">
            Speichern ersetzt den gewählten Wochentag vollständig. Leere Blöcke bedeuten: an diesem
            Wochentag keine Termine.
          </p>
        </div>
      ) : (
        <p className="text-ink-subtle mt-4 text-sm">
          Für das Ändern des Wochenplans fehlt Ihrem Zugang die Berechtigung.
        </p>
      )}
    </section>
  );
}

// -----------------------------------------------------------------------------
// Datumsbezogene Abweichungen
// -----------------------------------------------------------------------------

function Abweichungen({
  staffMemberId,
  darfPflegen,
  heute,
}: {
  staffMemberId: string;
  darfPflegen: boolean;
  heute: string | undefined;
}) {
  const queryClient = useQueryClient();
  const [datum, setDatum] = useState('');
  const [abwesend, setAbwesend] = useState(false);
  const [bloecke, setBloecke] = useState<Zeitblock[]>([{ ...LEERER_BLOCK }]);
  const [gespeichert, setGespeichert] = useState(false);

  // Ein knappes Fenster nach vorn: die Pflege betrifft die kommende Planung,
  // nicht die Vergangenheit. Gerechnet ueber ein Date statt ueber die
  // Jahreszahl im Text - der 29. Februar plus ein Jahr waere sonst der
  // 29. Februar eines Nichtschaltjahres und damit gar kein Datum.
  const von = heute ?? '';
  const bis = heute ? einJahrSpaeter(heute) : '';

  const ausnahmen = useQuery({
    queryKey: ['working-hour-exceptions', von, bis],
    queryFn: () => fetchWorkingHourExceptions(von, bis),
    enabled: Boolean(heute),
    retry: false,
  });

  const mutation = useMutation({
    mutationFn: () => saveWorkingHourException(staffMemberId, datum, abwesend, gefuellt(bloecke)),
    onSuccess: async () => {
      setGespeichert(true);
      await queryClient.invalidateQueries({ queryKey: ['working-hour-exceptions'] });
    },
  });

  const eigene = (ausnahmen.data ?? []).filter((a) => a.staff_member_id === staffMemberId);

  return (
    <section className="border-line bg-surface rounded-card border p-5">
      <h2 className="text-ink text-base font-semibold">Abweichungen an einzelnen Tagen</h2>
      <p className="text-ink-muted mt-1 max-w-prose text-sm">
        Eine Abweichung ersetzt den Wochenplan für dieses Datum vollständig - entweder als ganzer
        Tag ohne Termine oder als abweichende Zeitblöcke.
      </p>

      {eigene.length > 0 ? (
        <ul className="divide-line border-line mt-4 divide-y border-y">
          {eigene.map((a) => (
            <li key={a.id} className="flex justify-between gap-4 py-2 text-sm">
              <span className="text-ink-muted">{a.on_date}</span>
              <span className="text-ink text-right">
                {a.kind === 'unavailable' ? 'Keine Termine' : `${a.starts_at}–${a.ends_at}`}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-ink-subtle mt-4 text-sm">
          Für das kommende Jahr ist keine Abweichung hinterlegt.
        </p>
      )}

      {darfPflegen ? (
        <div className="mt-5 flex max-w-md flex-col gap-4">
          <Field
            label="Datum"
            type="date"
            value={datum}
            min={heute}
            onChange={(e) => {
              setDatum(e.target.value);
              setGespeichert(false);
            }}
          />

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={abwesend}
              onChange={(e) => {
                setAbwesend(e.target.checked);
                setGespeichert(false);
              }}
              className="size-5"
            />
            <span className="text-ink">An diesem Tag keine Termine</span>
          </label>

          {!abwesend ? (
            <BlockFelder
              bloecke={bloecke}
              onChange={(neu) => {
                setBloecke(neu);
                setGespeichert(false);
              }}
              legende="Abweichende Zeitblöcke"
              blockLabel="Abweichender Block"
            />
          ) : null}

          {mutation.isError ? (
            <Statusmeldung ton="fehler">{mutation.error.message}</Statusmeldung>
          ) : null}
          {gespeichert && !mutation.isPending && !mutation.isError ? (
            <Statusmeldung>Die Abweichung ist gespeichert.</Statusmeldung>
          ) : null}

          <div>
            <Button
              type="button"
              disabled={mutation.isPending || datum === ''}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending ? 'Wird gespeichert …' : 'Abweichung speichern'}
            </Button>
          </div>
          <p className="text-ink-subtle text-xs leading-relaxed">
            Ohne Häkchen und ohne Blöcke wird eine bestehende Abweichung entfernt; danach gilt für
            diesen Tag wieder der Wochenplan.
          </p>
        </div>
      ) : null}
    </section>
  );
}

// -----------------------------------------------------------------------------
// Seite
// -----------------------------------------------------------------------------

export function SchedulingPage({ user }: { user: CurrentUser }) {
  const darfPflegen = canManageWorkingHours(user.roles);
  const darfRaster = isOwner(user.roles);
  const zone = user.organizationTimeZone;
  const heute = zone ? todayInTimeZone(zone) : undefined;

  const therapeuten = useQuery({
    queryKey: ['assignable-therapists'],
    queryFn: fetchAssignableTherapists,
    retry: false,
  });

  /**
   * Die gewählte Person steht in der Adresszeile (UX-012).
   *
   * Damit führt ein Weg aus dem Mitarbeiterdatensatz direkt auf **diese**
   * Arbeitszeiten, statt auf die Seite mit der ersten Person - und der Stand
   * überlebt ein Neuladen wie im Kalender. Ein unbekannter oder verstellter
   * Wert fällt still auf die erste Person zurück.
   */
  const [suche, setSuche] = useSearchParams();
  const gewuenscht = suche.get('person');

  const [person, setPerson] = useState('');

  // Ohne Vorauswahl bliebe die Seite leer. Die erste Person ist eine
  // Darstellungsentscheidung, keine fachliche.
  useEffect(() => {
    const liste = therapeuten.data;
    if (!liste || liste.length === 0) return;
    const ausAdresse = liste.find((t) => t.staff_member_id === gewuenscht);
    setPerson((bisher) => {
      if (ausAdresse) return ausAdresse.staff_member_id;
      if (bisher !== '') return bisher;
      return liste[0]!.staff_member_id;
    });
  }, [therapeuten.data, gewuenscht]);

  function personWaehlen(staffMemberId: string) {
    setPerson(staffMemberId);
    const naechste = new URLSearchParams(suche);
    naechste.set('person', staffMemberId);
    setSuche(naechste, { replace: true });
  }

  return (
    <>
      <PageHeader
        title="Planung"
        description="Praxisraster, Dokumentationsfrist, Startort der Touren und Arbeitszeiten. Grundlage für Terminvergabe und Akte."
      />

      {darfRaster ? <RasterEinstellung aktuell={user.appointmentGridMinutes} /> : null}
      {darfRaster ? <FristEinstellung organizationId={user.profile.organization_id} /> : null}
      {darfRaster ? <StartortEinstellung /> : null}

      {therapeuten.isPending ? <LoadingState label="Personen werden geladen …" /> : null}
      {therapeuten.isError ? (
        <ErrorState title="Die behandelnden Personen konnten nicht geladen werden." />
      ) : null}

      {therapeuten.data && therapeuten.data.length > 0 ? (
        <>
          <div className="mb-6 max-w-md">
            <Select
              label="Behandelnde Person"
              value={person}
              onChange={(e) => personWaehlen(e.target.value)}
            >
              {therapeuten.data.map((t) => (
                <option key={t.staff_member_id} value={t.staff_member_id}>
                  {t.display_name}
                </option>
              ))}
            </Select>
          </div>

          {person ? (
            <>
              <Wochenplan staffMemberId={person} darfPflegen={darfPflegen} />
              <Abweichungen staffMemberId={person} darfPflegen={darfPflegen} heute={heute} />
            </>
          ) : null}
        </>
      ) : null}

      <p className="text-ink-subtle mt-10 max-w-prose text-xs leading-relaxed">
        Alle Zeiten gelten in der Zeitzone der Praxis{zone ? ` (${zone})` : ''}. Arbeitszeiten sind
        organisatorische Angaben zur Planung - keine Arbeitszeiterfassung und keine
        Urlaubsverwaltung.
      </p>
    </>
  );
}
