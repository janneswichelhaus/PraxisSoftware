import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { Kleingedrucktes } from '@/components/ui/Kleingedrucktes';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { Listenabschnitt } from '@/components/ui/Listenabschnitt';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { Section } from '@/components/ui/Section';
import { Textlink } from '@/components/ui/Textlink';
import { Tile, TileGrid } from '@/components/ui/Tile';
import { Zwischentitel } from '@/components/ui/Zwischentitel';
import {
  checkinsKey,
  fetchCheckins,
  Verlaufsbilder,
  verlaufsmarkierungen,
  type CheckinDaten,
} from '@/features/exercise';
import { LetzterEintragVorDerTuer } from '@/features/calendar';
import { VerlaufInAuszuegen } from '@/features/clinical';
import { themaName } from '@/features/portal';
import { dayKey, formatDate, formatLocalTime } from '@/lib/datum';
import { mitRueckweg } from '@/lib/rueckweg';
import { fetchPatient, fullName } from '../record/api';
import { bauartLabels } from '../treatment-bases/api';
import { fetchVorbereitung, vorbereitungKey, type Vorbereitung } from './api';
import { ZuTun } from './AufEinenBlick';
import { aufgaben } from './eintraege';

/**
 * Vor dem Termin in einer Minute erfassbar: was ansteht, was seit der letzten Behandlung
 * angegeben wurde, die zuletzt festgehaltenen Ziele. Auswählen und anordnen, nicht deuten
 * (ADR-006 Punkte 3, 11; ANN-848).
 */
export function VorbereitenSeite({ auszuege = false }: { auszuege?: boolean }) {
  const { patientId = '' } = useParams();
  const person = useQuery({
    queryKey: ['patient', patientId],
    queryFn: () => fetchPatient(patientId),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const abfrage = useQuery({
    queryKey: vorbereitungKey(patientId),
    queryFn: () => fetchVorbereitung(patientId),
    retry: false,
    refetchOnWindowFocus: false,
  });
  return (
    <>
      <Rueckweg standard={`/patienten/${patientId}/termine`} className="mb-3" />
      <div className="max-w-spalte flex flex-col gap-8 [&>*]:mt-0">
        <Abfragezustand
          abfrage={abfrage}
          laden="Sitzungsvorbereitung wird geladen …"
          fehler="Sitzungsvorbereitung nicht geladen."
          inKarte
          leer={{ wenn: (v) => !v, titel: 'Nicht gefunden' }}
          rahmen={(zustand) => (
            <>
              <PageHeader title="Sitzung vorbereiten" />
              {zustand}
            </>
          )}
        >
          {(v) => (
            <Inhalt
              v={v!}
              patientId={patientId}
              name={person.data ? fullName(person.data) : null}
              auszuege={auszuege}
            />
          )}
        </Abfragezustand>
      </div>
    </>
  );
}

/** Höchstens vier Kacheln (DESIGN.md): wann zuletzt, wann als Nächstes. */
function Zeitpunkte({ v }: { v: Vorbereitung }) {
  const zone = v.time_zone;
  const n = v.next_appointment;
  return (
    <TileGrid spalte="kachel">
      <Tile label="Letzte Behandlung">
        {v.last_session_on ? formatDate(v.last_session_on) : 'Noch keine'}
      </Tile>
      <Tile label="Nächster Termin" ton="akzent">
        {n ? (
          <>
            {formatDate(dayKey(n.starts_at, zone))}
            <span className="block tabular-nums">{formatLocalTime(n.starts_at, zone)} Uhr</span>
          </>
        ) : (
          'Keiner geplant'
        )}
      </Tile>
    </TileGrid>
  );
}

function Inhalt({
  v,
  patientId,
  name,
  auszuege,
}: {
  v: Vorbereitung;
  patientId: string;
  name: string | null;
  /** Nur für Rollen, die dokumentieren; verbindlich prüft die Datenbank am Gateway. */
  auszuege: boolean;
}) {
  const hier = `/patienten/${patientId}/vorbereiten`;
  return (
    <>
      <PageHeader title="Sitzung vorbereiten" description={name ?? undefined} />
      <Zeitpunkte v={v} />
      <ZuTun liste={aufgaben(v, patientId, themaName)} hier={hier} />
      {v.next_appointment ? (
        // Der letzte Eintrag vor dem nächsten Termin im Wortlaut, derselbe Lesepfad wie vor der Tür.
        <Section titel="Letzter Eintrag" rahmen>
          <LetzterEintragVorDerTuer appointmentId={v.next_appointment.id} />
        </Section>
      ) : null}
      {auszuege ? <VerlaufInAuszuegen key={patientId} patientId={patientId} hier={hier} /> : null}
      <SeitDemLetztenMal patientId={patientId} v={v} />
      {v.goals !== null ? (
        <Listenabschnitt titel="Ziele" leer={{ titel: 'Kein Therapieziel festgehalten' }}>
          {v.goals.map((g) => (
            <ListRow
              key={g.treatment_basis_id}
              titel={<span className="wrap-anywhere whitespace-pre-line">{g.text}</span>}
              meta={`${bauartLabels[g.kind as keyof typeof bauartLabels] ?? 'Grundlage'} vom ${formatDate(g.issued_on)}`}
            />
          ))}
        </Listenabschnitt>
      ) : null}
      <Textlink to={mitRueckweg(`/patienten/${patientId}/zeitstrahl`, hier)} alleinstehend>
        Zeitstrahl
      </Textlink>
      <Kleingedrucktes>
        Angaben unverändert, ohne Bewertung. Das Öffnen wird wie das Öffnen der Akte protokolliert.
      </Kleingedrucktes>
    </>
  );
}

/** Die Angaben der Person seit der letzten Behandlung, aus derselben Quelle wie der Verlauf. */
function SeitDemLetztenMal({ patientId, v }: { patientId: string; v: Vorbereitung }) {
  const abfrage = useQuery({
    queryKey: checkinsKey('treatment', patientId),
    queryFn: () => fetchCheckins('treatment', patientId),
    retry: false,
    refetchOnWindowFocus: false,
  });
  return (
    <Section titel="Seit dem letzten Mal" rahmen>
      <Abfragezustand
        abfrage={abfrage}
        laden="Angaben werden geladen …"
        fehler="Angaben nicht geladen."
        leer={{ wenn: (d) => !d, titel: 'Nicht freigegeben' }}
      >
        {(d) => <Angaben daten={d!} v={v} />}
      </Abfragezustand>
    </Section>
  );
}

function Angaben({ daten, v }: { daten: CheckinDaten; v: Vorbereitung }) {
  const seit = v.last_session_on;
  const danach = (tag: string) => !seit || tag > seit;
  const checkins = daten.checkins.filter((c) => danach(c.answered_on));
  const einheiten = daten.sessions.filter((e) => danach(e.performed_on));
  const markierungen = verlaufsmarkierungen(daten).filter((m) => danach(m.datum));
  const achse = seit ? [seit, v.today] : [];
  const termine = seit ? [seit] : [];
  return (
    <div className="flex flex-col gap-4">
      <p className="text-liste text-ink">
        {anzahl(checkins.length, 'Check-in', 'Check-ins')} und{' '}
        {anzahl(einheiten.length, 'Übungseinheit', 'Übungseinheiten')}{' '}
        {seit ? 'seit der letzten Behandlung' : 'bisher'}
      </p>
      {markierungen.length > 0 ? (
        <ListRows rahmen={false} beschriftung="Vermerkt seit der letzten Behandlung">
          {markierungen.map((m, i) => (
            <ListRow
              key={`${m.datum}-${i}`}
              zeit={<span className="tabular-nums">{formatDate(m.datum).slice(0, 6)}</span>}
              titel={m.lang}
            />
          ))}
        </ListRows>
      ) : null}
      {checkins.length > 0 ? (
        <div className="flex flex-col gap-2">
          <Zwischentitel ebene={3}>Check-ins</Zwischentitel>
          <Verlaufsbilder
            erfassungen={checkins.map((c) => ({ datum: c.answered_on, werte: c.values }))}
            markierungen={markierungen}
            termine={termine}
            zeitraumDaten={achse}
          />
        </div>
      ) : null}
      {einheiten.length > 0 ? (
        <div className="flex flex-col gap-2">
          <Zwischentitel ebene={3}>Nach den Übungseinheiten</Zwischentitel>
          <Verlaufsbilder
            erfassungen={einheiten.map((e) => ({ datum: e.performed_on, werte: e.values }))}
            markierungen={markierungen}
            termine={termine}
            zeitraumDaten={achse}
          />
        </div>
      ) : null}
    </div>
  );
}

function anzahl(n: number, eins: string, mehr: string): string {
  return `${n} ${n === 1 ? eins : mehr}`;
}
