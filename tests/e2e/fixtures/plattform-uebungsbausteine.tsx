import { useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { Buehne } from '@/components/ui/Buehne';
import { Button } from '@/components/ui/Button';
import { Hakenzeile } from '@/components/ui/Hakenzeile';
import { Section } from '@/components/ui/Section';
import { Wochenleiste } from '@/components/ui/Wochenleiste';
import { dauerDerEinheit, dauerText } from '@/features/platform/dauer';
import { Dosierungsmarken } from '@/features/platform/Dosierungsmarken';
import {
  Durchfuehrungsfuss,
  type Uebertragungsstand,
} from '@/features/platform/Durchfuehrungsfuss';
import { Durchfuehrungskopf } from '@/features/platform/Durchfuehrungskopf';
import { Endseite } from '@/features/platform/Endseite';
import { useRechner } from '@/features/platform/geruestbreite';
import { hauptzahl } from '@/features/platform/hauptzahl';
import { WOCHENTAGE, wochenleisteSatz } from '@/features/platform/uebungstage';
import type { DosisZumAblesen } from '@/features/platform/Uebungsinhalt';
import '@/index.css';

/**
 * Einstieg der Prüfseite aus `plattform-uebungsbausteine.html` (Schritt 2a,
 * Handoff 2026-10-24): die Bausteine der Übungen unter `.plattform-schrift`,
 * wie sie die Durchführung (2b) und der Reiter (2c) bekommen - ohne Server,
 * mit erfundenen Angaben. Am Rechner (ab 1024 px) trägt sie `data-rechner`
 * wie das Gerüst.
 */
const schrift = new URLSearchParams(window.location.search).get('schrift');
if (schrift === 'gross' || schrift === 'sehr-gross') {
  document.documentElement.dataset.schrift = schrift;
}

const KNIE: DosisZumAblesen = {
  sets: 3,
  reps_min: 8,
  reps_max: 12,
  duration_seconds: null,
  load: 'Rucksack 3 kg',
  tempo: null,
  rest_seconds: 60,
  double_progression: true,
  hold_seconds: null,
  per_side: false,
  times_per_day: null,
};
const STUETZ: DosisZumAblesen = {
  ...KNIE,
  reps_min: null,
  reps_max: null,
  duration_seconds: 30,
  rest_seconds: 30,
  per_side: true,
  load: null,
  double_progression: false,
  tempo: 'langsam',
};
const BECKEN: DosisZumAblesen = {
  ...KNIE,
  sets: 2,
  reps_min: 10,
  reps_max: 10,
  rest_seconds: null,
  load: null,
  double_progression: false,
};

const heute = new Date();
const kalendertag = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const uebermorgen = new Date(heute);
uebermorgen.setDate(heute.getDate() + 2);

/**
 * Ein Rahmen wie die Seite: Kopf, Inhalt und Fuß einer Durchführung - am
 * Telefon bis an die Kanten, wie auf der Seite selbst.
 */
function Rahmen({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div
      role="group"
      aria-label={name}
      className="border-line [[data-rechner]_&]:rounded-card -mx-5 flex flex-col overflow-hidden border-y max-[23rem]:-mx-3 [[data-rechner]_&]:mx-0 [[data-rechner]_&]:border-x"
    >
      {children}
    </div>
  );
}

/** Die Durchgänge zum Ausprobieren: Ein Haken startet die Pause vor dem nächsten. */
function Durchgaenge() {
  const [haken, setHaken] = useState<ReadonlySet<number>>(new Set([1]));
  const [pause, setPause] = useState<{ vor: number; sekunden: number; nummer: number } | null>(
    // Lang genug, um den Ring anzusehen.
    { vor: 2, sekunden: 600, nummer: 1 },
  );
  return (
    <ul className="flex flex-col gap-3" aria-label="Durchgänge">
      {[1, 2, 3].map((durchgang) => {
        const erledigt = haken.has(durchgang);
        return (
          <li key={durchgang}>
            <Hakenzeile
              durchgang={durchgang}
              erledigt={erledigt}
              pause={pause?.vor === durchgang ? pause : null}
              onUmschalten={() => {
                const neu = new Set(haken);
                if (erledigt) neu.delete(durchgang);
                else neu.add(durchgang);
                setHaken(neu);
                setPause(
                  !erledigt && durchgang < 3
                    ? { vor: durchgang + 1, sekunden: 600, nummer: (pause?.nummer ?? 0) + 1 }
                    : null,
                );
              }}
              onPauseEnde={() => setPause(null)}
            />
          </li>
        );
      })}
    </ul>
  );
}

/** Die Übungstage zum Ausprobieren. */
function Uebungstage({ anfang, gesperrt = false }: { anfang: number[]; gesperrt?: boolean }) {
  const [tage, setTage] = useState(anfang);
  return (
    <Wochenleiste
      titel="Ihre Übungstage"
      wochentage={WOCHENTAGE}
      tage={tage}
      gesperrt={gesperrt}
      satz={wochenleisteSatz(tage.length, 3, gesperrt)}
      onUmschalten={(tag) =>
        setTage(
          tage.includes(tag) ? tage.filter((t) => t !== tag) : [...tage, tag].sort((a, b) => a - b),
        )
      }
    />
  );
}

export function Seite() {
  const rechner = useRechner();
  const [stand, setStand] = useState<Uebertragungsstand>('uebertragen');
  const dauer = dauerDerEinheit([KNIE, STUETZ, BECKEN]);
  return (
    <main
      data-rechner={rechner ? '' : undefined}
      className="plattform-schrift bg-canvas max-w-formular data-[rechner]:max-w-spalte mx-auto flex flex-col gap-10 px-5 py-6 max-[23rem]:px-3"
    >
      <h1 className="text-plattform-titel text-accent">Bausteine der Übungen</h1>

      <Section titel="Bühne">
        <div className="flex flex-col gap-4">
          <Buehne ebene={2} name="Mit Halt leicht in die Knie gehen" {...hauptzahl(KNIE)} />
          <Buehne ebene={2} name="Kniebeuge mit Halt am Treppengeländer" {...hauptzahl(BECKEN)} />
          <Buehne ebene={2} name="Seitstütz auf dem Unterarm" {...hauptzahl(STUETZ)} />
        </div>
      </Section>

      <Section titel="Dosierung">
        <div className="flex flex-col gap-6">
          <Dosierungsmarken dosis={KNIE} />
          <Dosierungsmarken dosis={STUETZ} />
        </div>
      </Section>

      <Section titel="Durchgänge">
        <Durchgaenge />
      </Section>

      <Section titel="Dauer der Einheit">
        <p>{dauer === null ? '3 Übungen' : `3 Übungen · ${dauerText(dauer)}`}</p>
      </Section>

      <Section titel="Kopf und Fuß der Durchführung">
        <div className="flex flex-col gap-6">
          <Rahmen name="Übung 2 von 3, übertragen">
            <Durchfuehrungskopf
              uebung={2}
              von={3}
              onZurueck={() => undefined}
              spaeter={{ onSpaeter: () => undefined }}
            />
            <p className="px-5 py-6">Inhalt der Übung</p>
            <Durchfuehrungsfuss
              aktion={{
                text: 'Nächste Übung',
                onClick: () => setStand(stand === 'uebertragen' ? 'geraet' : 'uebertragen'),
              }}
              stand={stand}
            />
          </Rahmen>
          <Rahmen name="Übung 3 von 3, ohne Netz">
            <Durchfuehrungskopf
              uebung={3}
              von={3}
              onZurueck={() => undefined}
              spaeter={{ onSpaeter: () => undefined }}
              ohneNetz
            />
            <p className="px-5 py-6">Inhalt der Übung</p>
            <Durchfuehrungsfuss
              aktion={{ text: 'Zum Abschluss', onClick: () => undefined }}
              stand="geraet"
            />
          </Rahmen>
          <Rahmen name="Abschluss">
            <Durchfuehrungskopf
              uebung={3}
              von={3}
              abschluss
              onZurueck={() => undefined}
              spaeter={{ onSpaeter: () => undefined }}
            />
            <p className="px-5 py-6">Wie war es heute?</p>
            <Durchfuehrungsfuss aktion={{ text: 'Einheit beenden', onClick: () => undefined }} />
          </Rahmen>
        </div>
      </Section>

      <Section titel="Übungstage">
        <div className="flex flex-col gap-8">
          <Uebungstage anfang={[1, 3, 6]} />
          <Uebungstage anfang={[]} />
          <Uebungstage anfang={[1, 3, 6]} gesperrt />
        </div>
      </Section>

      <Section titel="Nach dem Beenden">
        <div className="flex flex-col gap-6">
          <Rahmen name="Gespeichert">
            <div className="flex min-h-140 flex-col">
              <Endseite
                fassung="uebertragen"
                tag={kalendertag(heute)}
                wer="Anna Beispiel"
                naechsterTag={kalendertag(uebermorgen)}
                zurUebersicht="/p"
                zuDenUebungen="/p/uebungen"
              />
            </div>
          </Rahmen>
          <Rahmen name="Auf diesem Gerät gespeichert">
            <div className="flex min-h-140 flex-col">
              <Endseite
                fassung="geraet"
                tag={kalendertag(heute)}
                wer="Ihre Therapeut:in"
                naechsterTag={null}
                zurUebersicht="/p"
                zuDenUebungen="/p/uebungen"
              />
            </div>
          </Rahmen>
        </div>
      </Section>

      <Section titel="Knopf groß">
        <Button groesse="gross" className="w-full">
          Nächste Übung
        </Button>
      </Section>
    </main>
  );
}

const wurzel = document.getElementById('wurzel');
if (!wurzel) throw new Error('Wurzelelement der Prüfseite fehlt.');
createRoot(wurzel).render(
  <MemoryRouter>
    <Seite />
  </MemoryRouter>,
);
