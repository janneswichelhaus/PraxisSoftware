import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { Kleingedrucktes } from '@/components/ui/Kleingedrucktes';
import { Listenabschnitt } from '@/components/ui/Listenabschnitt';
import { ListRow } from '@/components/ui/ListRow';
import { PageHeader } from '@/components/ui/PageHeader';
import { Punktbild } from '@/components/ui/Punktbild';
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
import { formatDate } from '@/lib/datum';
import {
  ernaehrungSchluessel,
  fetchErnaehrung,
  fetchVerlauf,
  verlaufSchluessel,
  type Ernaehrungsprofil,
  type Verhaeltnisart,
} from './api';
import { ernaehrungsReiter, planPfad } from './eingabe';
import { kcal, wasserText } from './tagebuch';
import { kg, zahl } from './texte';
import {
  energieText,
  gewichtsskala,
  planmarkierungen,
  wochenzeile,
  zeitraumText,
  type Ernaehrungsverlauf,
} from './verlauf';

/**
 * `…/ernaehrung/vorbereiten` - die Sitzung aus einer Ansicht vorbereiten (ADR-027, ANN-846).
 * Allein die Fähigkeit „Ernährungsberatung“; Laden zählt als Öffnen (ein Eintrag je Tag), darum
 * einmal und nicht bei jedem Fokuswechsel.
 */
export function VorbereitungSeite({ art }: { art: Verhaeltnisart }) {
  const { patientId = '', relationshipId = '' } = useParams();
  const verhaeltnisId = art === 'treatment' ? patientId : relationshipId;
  const zurueck = ernaehrungsReiter(art, verhaeltnisId);
  const abfrage = useQuery({
    queryKey: ernaehrungSchluessel(art, verhaeltnisId),
    queryFn: () => fetchErnaehrung(art, verhaeltnisId),
    retry: false,
    refetchOnWindowFocus: false,
  });
  return (
    <>
      <Rueckweg standard={zurueck} className="mb-3" />
      <Abfragezustand
        abfrage={abfrage}
        laden="Ernährungsberatung wird geladen …"
        fehler="Ernährungsberatung nicht geladen."
        inKarte
        leer={{ wenn: (sicht) => !sicht?.profile, titel: 'Keine Ernährungsberatung' }}
      >
        {(sicht) => (
          <Verlaufsansicht profil={sicht!.profile!} art={art} verhaeltnisId={verhaeltnisId} />
        )}
      </Abfragezustand>
    </>
  );
}

function Verlaufsansicht({
  profil,
  art,
  verhaeltnisId,
}: {
  profil: Ernaehrungsprofil;
  art: Verhaeltnisart;
  verhaeltnisId: string;
}) {
  const verlauf = useQuery({
    queryKey: verlaufSchluessel(profil.id),
    queryFn: () => fetchVerlauf(profil.id),
    retry: false,
    refetchOnWindowFocus: false,
  });
  return (
    <Abfragezustand
      abfrage={verlauf}
      laden="Verlauf wird geladen …"
      fehler="Verlauf nicht geladen."
      inKarte
      leer={{ wenn: (v) => !v, titel: 'Nicht freigegeben' }}
    >
      {(v) => <Inhalt v={v!} profil={profil} art={art} verhaeltnisId={verhaeltnisId} />}
    </Abfragezustand>
  );
}

function Inhalt({
  v,
  profil,
  art,
  verhaeltnisId,
}: {
  v: Ernaehrungsverlauf;
  profil: Ernaehrungsprofil;
  art: Verhaeltnisart;
  verhaeltnisId: string;
}) {
  const offenerPlan = profil.plans.find((p) => p.ended_on === null);
  const kopfzeile = [
    zeitraumText(v),
    v.next_session_on ? `nächste am ${formatDate(v.next_session_on)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <div className="max-w-spalte flex flex-col gap-8 [&>*]:mt-0">
      <PageHeader title="Sitzung vorbereiten" description={kopfzeile} />
      <Zeitraum v={v} />
      <Wochen v={v} />
      <Gewicht v={v} />
      <CheckinsUndTraining art={art} verhaeltnisId={verhaeltnisId} v={v} />
      <Section titel="Plan und Notizen" rahmen>
        <div className="flex flex-col gap-3">
          {offenerPlan ? (
            <p className="text-liste text-ink">
              {offenerPlan.title}
              <span className="text-ink-muted"> · seit {formatDate(offenerPlan.starts_on)}</span>
            </p>
          ) : (
            <p className="text-ink-muted text-liste">Kein offener Plan.</p>
          )}
          <Textlink to={planPfad(art, verhaeltnisId)} alleinstehend>
            {offenerPlan ? 'Plan ansehen' : 'Plan zuweisen'}
          </Textlink>
          <p className="text-liste text-ink border-line border-t pt-3 wrap-anywhere whitespace-pre-line">
            {profil.notes ?? <span className="text-ink-muted">Keine Notizen.</span>}
          </p>
        </div>
      </Section>
      <Kleingedrucktes>Zahlen aus dem Tagebuch, keine Aussage über die Gesundheit.</Kleingedrucktes>
    </div>
  );
}

/** Höchstens vier Kacheln (DESIGN.md): Energie, Eiweiß, Wasser, Tage mit Eintrag. */
function Zeitraum({ v }: { v: Ernaehrungsverlauf }) {
  const s = v.period;
  const z = v.targets;
  return (
    <TileGrid spalte="kachel">
      <Tile label="Energie je Tag" zusatz={z ? `Ziel ${kcal(z.energy_kcal)}` : undefined}>
        {s.energy_kcal === null ? '–' : kcal(s.energy_kcal)}
      </Tile>
      <Tile label="Eiweiß je Tag" zusatz={z ? `Ziel ${zahl(z.protein_g)} g` : undefined}>
        {s.protein_g === null ? '–' : `${zahl(s.protein_g)} g`}
      </Tile>
      <Tile label="Wasser je Tag" zusatz={z ? `Ziel ${wasserText(z.water_ml)}` : undefined}>
        {s.water_ml === null ? '–' : wasserText(s.water_ml)}
      </Tile>
      <Tile
        label="Tage mit Eintrag"
        zusatz={`von ${zahl(s.days)} ${s.days === 1 ? 'Tag' : 'Tagen'}`}
      >
        {zahl(s.food_days)}
      </Tile>
    </TileGrid>
  );
}

function Wochen({ v }: { v: Ernaehrungsverlauf }) {
  return (
    <Listenabschnitt titel="Wochenmittel">
      {v.weeks.map((w) => (
        <ListRow
          key={w.week_start}
          titel={`Woche ab ${formatDate(w.week_start)}`}
          meta={wochenzeile(w, v.targets)}
          betrag={energieText(w, v.targets) ?? undefined}
        />
      ))}
    </Listenabschnitt>
  );
}

function Gewicht({ v }: { v: Ernaehrungsverlauf }) {
  const skala = gewichtsskala(v);
  const markierungen = planmarkierungen(v);
  return (
    <Section titel="Gewicht" rahmen>
      {skala ? (
        <div className="flex flex-col gap-3">
          {/* Halbe Breite ab md wie die Bilder der Check-ins, damit Achsen und Schrift gleich sind. */}
          <div className="grid gap-4 md:grid-cols-2">
            <Punktbild
              beschriftung={
                <>
                  Gewicht in kg
                  {v.target_weight_kg !== null ? (
                    <span className="text-ink-muted block font-normal">
                      Zielgewicht {kg(v.target_weight_kg)}
                    </span>
                  ) : null}
                </>
              }
              skala={skala}
              punkte={v.weights.map((g) => ({ datum: g.measured_on, wert: g.weight_kg }))}
              markierungen={markierungen}
              termine={v.sessions}
              wertText={(w) => kg(w)}
              zeitraumDaten={[v.started_on, v.ended_on ?? v.today]}
            />
          </div>
          {v.sessions.length > 0 ? (
            <p className="text-ink-muted text-sm">Striche: Beratungen</p>
          ) : null}
        </div>
      ) : (
        <p className="text-ink-muted text-liste">Noch kein Gewicht eingetragen.</p>
      )}
    </Section>
  );
}

/** Check-ins und Angaben nach den Einheiten auf derselben Achse wie das Gewicht, nur lesen. */
function CheckinsUndTraining({
  art,
  verhaeltnisId,
  v,
}: {
  art: Verhaeltnisart;
  verhaeltnisId: string;
  v: Ernaehrungsverlauf;
}) {
  const abfrage = useQuery({
    queryKey: checkinsKey(art, verhaeltnisId),
    queryFn: () => fetchCheckins(art, verhaeltnisId),
    retry: false,
    refetchOnWindowFocus: false,
  });
  return (
    <Section titel="Check-ins und Training" rahmen>
      <Abfragezustand
        abfrage={abfrage}
        laden="Check-ins werden geladen …"
        fehler="Check-ins nicht geladen."
        leer={{ wenn: (d) => !d, titel: 'Nicht freigegeben' }}
      >
        {(d) => <Angaben daten={d!} v={v} />}
      </Abfragezustand>
    </Section>
  );
}

function Angaben({ daten, v }: { daten: CheckinDaten; v: Ernaehrungsverlauf }) {
  const bis = v.ended_on ?? v.today;
  const imZeitraum = (tag: string) => tag >= v.started_on && tag <= bis;
  const checkins = daten.checkins.filter((c) => imZeitraum(c.answered_on));
  const einheiten = daten.sessions.filter((e) => imZeitraum(e.performed_on));
  const termine = daten.appointment_days.filter(imZeitraum);
  const markierungen = verlaufsmarkierungen(daten).filter((m) => imZeitraum(m.datum));
  const achse = [v.started_on, bis];
  const letzte = v.last_session_on;
  const seitText = letzte ? 'seit der letzten Beratung' : 'seit Beginn';
  const zaehle = (tage: readonly string[]) => tage.filter((t) => !letzte || t > letzte).length;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-liste text-ink">
        {anzahl(zaehle(checkins.map((c) => c.answered_on)), 'Check-in', 'Check-ins')},{' '}
        {anzahl(zaehle(einheiten.map((e) => e.performed_on)), 'Einheit', 'Einheiten')} und{' '}
        {anzahl(zaehle(termine), 'Termin', 'Termine')} {seitText}
      </p>
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
          <Zwischentitel ebene={3}>Nach den Einheiten</Zwischentitel>
          <Verlaufsbilder
            erfassungen={einheiten.map((e) => ({ datum: e.performed_on, werte: e.values }))}
            markierungen={markierungen}
            termine={termine}
            zeitraumDaten={achse}
          />
        </div>
      ) : null}
      {termine.length > 0 && (checkins.length > 0 || einheiten.length > 0) ? (
        <p className="text-ink-muted text-sm">Striche: durchgeführte Termine</p>
      ) : null}
    </div>
  );
}

function anzahl(n: number, eins: string, mehr: string): string {
  return `${zahl(n)} ${n === 1 ? eins : mehr}`;
}
