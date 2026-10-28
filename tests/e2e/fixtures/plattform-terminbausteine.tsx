import { useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { Badge, STATUSZEICHEN } from '@/components/ui/Badge';
import { HeroKarte } from '@/components/ui/HeroKarte';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Section } from '@/components/ui/Section';
import { Terminliste } from '@/components/ui/Terminliste';
import { Terminkreis } from '@/components/ui/Terminsymbole';
import { Wahlflaechen } from '@/components/ui/Wahlflaechen';
import { Wochenleiste } from '@/components/ui/Wochenleiste';
import type { Termin, Terminwunsch } from '@/features/portal/platform/api';
import { TAGESZEIT_NAME, TAGESZEITEN, type Tageszeit } from '@/features/portal/platform/api';
import { useRechner } from '@/features/portal/platform/geruestbreite';
import { terminPerson, terminTitel, terminZeit } from '@/features/portal/platform/hauptsache';
import {
  FragenZumTermin,
  Terminzeile,
  WerUndWo,
  Wunschzeile,
} from '@/features/portal/platform/Terminbausteine';
import {
  NICHTS_GEWAEHLT,
  WOCHENTAGE,
  WOCHENTAG_NAME,
  egalUmschalten,
  tagUmschalten,
  wunschtage,
  zeitUmschalten,
  type Wann,
  type Wochentag,
} from '@/features/portal/platform/terminablauf';
import { heroEtikett, tageSatz } from '@/features/portal/platform/termintexte';
import { terminBeschreibung } from '@/features/portal/platform/terminbeschreibung';
import { naechsteWerktage } from '@/features/portal/platform/zeit';
import '@/index.css';

/**
 * Prüfseite der Bausteine der Termine unter `.plattform-schrift`, ohne Server, mit erfundenen
 * Angaben und Tagen ab heute; ab 1024 px mit `data-rechner` wie das Gerüst.
 */
const schrift = new URLSearchParams(window.location.search).get('schrift');
if (schrift === 'gross' || schrift === 'sehr-gross') {
  document.documentElement.dataset.schrift = schrift;
}

/** Ein Termin `tage` Tage ab heute um `stunde` Uhr, eine Stunde lang. */
function termin(id: number, tage: number, stunde: number, teil: Partial<Termin> = {}): Termin {
  const beginn = new Date();
  beginn.setDate(beginn.getDate() + tage);
  beginn.setHours(stunde, 30, 0, 0);
  return {
    id: `cccccccc-0000-4000-8000-${String(id).padStart(12, '0')}`,
    starts_at: beginn.toISOString(),
    ends_at: new Date(beginn.getTime() + 60 * 60 * 1000).toISOString(),
    appointment_type: 'home_visit',
    status: 'confirmed',
    staff_name: 'Anna Beispiel',
    location_name: null,
    visit_street: 'Testweg',
    visit_house_number: '7',
    visit_postal_code: '72072',
    visit_city: 'Tübingen',
    late_notice: false,
    open_request_kind: null,
    ...teil,
  };
}

const PRAXIS: Partial<Termin> = {
  appointment_type: 'practice',
  staff_name: 'Jannes Test',
  location_name: 'Hauptstandort Tübingen, Neckarhalde 1',
};
const NAECHSTER = termin(1, 4, 9);
const KOMMENDE = [
  termin(2, 11, 14, { ...PRAXIS, open_request_kind: 'change' }),
  termin(3, 18, 9),
  termin(4, 1, 7, { appointment_type: 'video', staff_name: 'Tom Training' }),
];
const VERGANGENE = [
  termin(5, -8, 9, { status: 'completed' }),
  termin(6, -11, 9, { status: 'cancelled' }),
  termin(7, -15, 9, { status: 'no_show' }),
];

function wunsch(id: number, teil: Partial<Terminwunsch>): Terminwunsch {
  return {
    id: `dddddddd-0000-4000-8000-${String(id).padStart(12, '0')}`,
    kind: 'new',
    appointment_id: null,
    preferred_days: [],
    preferred_times: [],
    note: null,
    status: 'open',
    created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    resolved_at: null,
    answer: null,
    ...teil,
  };
}

const werktage = naechsteWerktage(14);
const WUENSCHE = [
  wunsch(1, {
    preferred_days: wunschtage([2, 4], werktage),
    preferred_times: ['morning'],
    note: 'Gern nicht vor 9 Uhr.',
  }),
  wunsch(2, {
    kind: 'change',
    appointment_id: KOMMENDE[0]!.id,
    preferred_days: wunschtage([1, 2, 3, 4, 5], werktage),
    preferred_times: [],
  }),
  wunsch(3, {
    kind: 'cancel',
    appointment_id: 'eeeeeeee-0000-4000-8000-000000000099',
    status: 'declined',
    resolved_at: new Date().toISOString(),
    answer: 'Bitte rufen Sie uns kurz an.',
  }),
];

function Rahmen({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={name} className="flex flex-col gap-3">
      {children}
    </div>
  );
}

/** Wohin die Hero-Karte geführt hat - für den Browsertest. */
function Ziel() {
  const { pathname } = useLocation();
  return <p data-testid="ziel">{pathname}</p>;
}

function Wunschtage() {
  const [wann, setWann] = useState<Wann>(NICHTS_GEWAEHLT);
  const kalendertage = wunschtage(wann.tage, werktage);
  const wahl: readonly string[] = wann.zeiten === 'egal' ? ['egal'] : wann.zeiten;
  return (
    <div className="flex flex-col gap-5">
      <Wochenleiste
        titel="An welchen Tagen?"
        ebene={2}
        wochentage={WOCHENTAGE.map((t) => ({
          nummer: t,
          kurz: WOCHENTAG_NAME[t].slice(0, 2),
          lang: WOCHENTAG_NAME[t],
        }))}
        tage={wann.tage}
        onUmschalten={(t) => setWann((w) => tagUmschalten(w, t as Wochentag))}
        satz={tageSatz(wann.tage, kalendertage)}
      />
      <Wahlflaechen
        titel="Zu welcher Tageszeit?"
        wahlen={[
          ...TAGESZEITEN.map((z) => ({ schluessel: z, text: TAGESZEIT_NAME[z] })),
          { schluessel: 'egal', text: 'Egal' },
        ]}
        gewaehlt={wahl}
        onUmschalten={(s) =>
          setWann((w) => (s === 'egal' ? egalUmschalten(w) : zeitUmschalten(w, s as Tageszeit)))
        }
      />
    </div>
  );
}

export function Seite() {
  const rechner = useRechner();
  const { ort } = terminBeschreibung(NAECHSTER);
  return (
    <main
      data-rechner={rechner ? '' : undefined}
      className="plattform-schrift bg-canvas max-w-formular data-[rechner]:max-w-spalte mx-auto flex flex-col gap-10 px-5 py-6 max-[23rem]:px-3"
    >
      <h1 className="text-plattform-titel text-accent">Bausteine der Termine</h1>
      <Ziel />

      <Section titel="Zeichen der Art">
        <ul className="flex flex-wrap gap-6">
          {(['haus', 'praxis', 'video', 'training'] as const).map((z, i) => (
            <li key={z} className="flex items-center gap-3 font-semibold">
              <Terminkreis zeichen={z} gedaempft={i === 3} />
              {['Hausbesuch', 'In der Praxis', 'Videotermin', 'Training (gedämpft)'][i]}
            </li>
          ))}
        </ul>
      </Section>

      <Section titel="Statuszeichen">
        <div className="flex flex-col gap-4">
          <p className="flex flex-wrap gap-3">
            <Badge ton="akzent" eigenesZeichen={STATUSZEICHEN.wartet}>
              Änderung angefragt
            </Badge>
            <Badge ton="positiv">durchgeführt</Badge>
            <Badge ton="kritisch">abgesagt</Badge>
            <Badge ton="warnung">nicht angetroffen</Badge>
          </p>
          {/* Neben einem langen Titel rückt das Zeichen in die nächste Zeile, statt im Wort zu
              brechen - wie in der Wunschzeile. */}
          <p
            data-testid="enge-zeile"
            className="flex flex-wrap items-center gap-x-3 gap-y-1 hyphens-manual"
          >
            <span className="font-semibold">Hausbesuch bei Maximilian</span>
            <Badge ton="akzent" eigenesZeichen={STATUSZEICHEN.wartet}>
              Änderung angefragt
            </Badge>
          </p>
        </div>
      </Section>

      <Section titel="Nächster Besuch">
        <div className="flex flex-col gap-6">
          <HeroKarte
            etikett={heroEtikett(NAECHSTER.appointment_type, 'treatment', false, false)}
            titel={terminTitel(NAECHSTER, 'treatment', null)}
            satz={terminZeit(NAECHSTER, false)}
            person={{ name: 'Anna Beispiel', zeile: terminPerson(NAECHSTER, false) ?? '', ort }}
            ziel={{ text: 'Termin ansehen', to: `/p/termine/${NAECHSTER.id}` }}
          />
          <HeroKarte
            etikett={heroEtikett(NAECHSTER.appointment_type, 'treatment', false, true)}
            titel={terminTitel(NAECHSTER, 'treatment', 'Maximilian Mustermann-Langenscheidt')}
            satz={terminZeit(NAECHSTER, true)}
            person={{
              name: 'Anna Beispiel',
              zeile: terminPerson(NAECHSTER, true) ?? '',
              ort: 'Lindenweg 3, 72070 Tübingen',
            }}
            ziel={{ text: 'Termin ansehen', to: `/p/termine/${NAECHSTER.id}?fuer=1` }}
          />
        </div>
      </Section>

      <Section titel="Terminzeilen">
        <div className="flex flex-col gap-6">
          <Rahmen name="Weitere Termine">
            <Terminliste name="Weitere Termine">
              {KOMMENDE.map((t) => (
                <Terminzeile key={t.id} termin={t} bereich="treatment" to={`/p/termine/${t.id}`} />
              ))}
            </Terminliste>
          </Rahmen>
          <Rahmen name="Vergangene Termine">
            <Terminliste name="Vergangene Termine">
              {VERGANGENE.map((t) => (
                <Terminzeile key={t.id} termin={t} bereich="treatment" to={`/p/termine/${t.id}`} />
              ))}
            </Terminliste>
          </Rahmen>
          <Rahmen name="Training">
            <Terminliste name="Training">
              <Terminzeile
                termin={termin(8, 2, 18, { staff_name: 'Tom Training' })}
                bereich="training"
                to="/p/termine/8"
              />
            </Terminliste>
          </Rahmen>
        </div>
      </Section>

      <Section titel="Wunschzeilen">
        <Terminliste name="Ihre Wünsche">
          {WUENSCHE.map((w) => (
            <Wunschzeile
              key={w.id}
              wunsch={w}
              termine={KOMMENDE}
              zurueckziehen={
                w.status === 'open' ? (
                  <Rueckfrage
                    ausloeser="Wunsch zurückziehen"
                    ausloeserVariante="quiet"
                    bestaetigen="Ja, zurückziehen"
                    bestaetigenLaeuft="Wird zurückgezogen …"
                    onBestaetigen={() => Promise.resolve()}
                  >
                    <p>Die Praxis bearbeitet diesen Wunsch dann nicht weiter.</p>
                  </Rueckfrage>
                ) : undefined
              }
            />
          ))}
        </Terminliste>
      </Section>

      <Section titel="Wer und wo">
        <div className="flex flex-col gap-4">
          <WerUndWo termin={NAECHSTER} vertretung={null} />
          <WerUndWo termin={termin(9, 5, 10, PRAXIS)} vertretung="Maximilian" />
          <WerUndWo termin={KOMMENDE[2]!} vertretung={null} />
          <WerUndWo termin={VERGANGENE[0]!} vertretung={null} />
        </div>
      </Section>

      <Section titel="Fragen">
        <div className="flex flex-col gap-8">
          <Rahmen name="Kommend, mit Rufnummer">
            <FragenZumTermin rufnummer="+49 7071 0000000" schreiben="/p/nachrichten/neu" />
          </Rahmen>
          <Rahmen name="Vergangen, mit Rufnummer">
            <FragenZumTermin
              rufnummer="+49 7071 0000000"
              schreiben="/p/nachrichten/neu"
              anrufenAlsHauptknopf
            />
          </Rahmen>
          <Rahmen name="Ohne Rufnummer">
            <FragenZumTermin rufnummer={null} schreiben="/p/nachrichten/neu" anrufenAlsHauptknopf />
          </Rahmen>
        </div>
      </Section>

      <Section titel="Tage und Tageszeit">
        <Wunschtage />
      </Section>
    </main>
  );
}

const wurzel = document.getElementById('wurzel');
if (!wurzel) throw new Error('Wurzelelement der Prüfseite fehlt.');
createRoot(wurzel).render(
  <MemoryRouter>
    <Routes>
      <Route path="*" element={<Seite />} />
    </Routes>
  </MemoryRouter>,
);
