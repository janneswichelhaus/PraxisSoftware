import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Angabefeld } from '@/components/ui/Angabefeld';
import { Antwortbalken } from '@/components/ui/Antwortbalken';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Section } from '@/components/ui/Section';
import { Wahlflaechen } from '@/components/ui/Wahlflaechen';
import { Wochenleiste } from '@/components/ui/Wochenleiste';
import { useRechner } from '@/features/portal/platform/geruestbreite';
import { erfassungsgroesse } from '@/lib/erfassungsgroessen';
import '@/index.css';

/**
 * Prüfseite der Bausteine der Selbstauskunft unter `.plattform-schrift`, ohne Server, mit erfundenen
 * Angaben; ab 1024 px mit `data-rechner` wie das Gerüst.
 */
const schrift = new URLSearchParams(window.location.search).get('schrift');
if (schrift === 'gross' || schrift === 'sehr-gross') {
  document.documentElement.dataset.schrift = schrift;
}

function Skalen() {
  const [ruhe, setRuhe] = useState<number | null>(null);
  const [art, setArt] = useState<number | null>(5);
  return (
    <div className="flex flex-col gap-8">
      <Angabefeld
        groesse={erfassungsgroesse('pain_rest')!}
        wert={ruhe}
        zuletzt={3}
        zuletztAm="21. Oktober"
        onChange={setRuhe}
      />
      <Angabefeld groesse={erfassungsgroesse('daily_impairment')!} wert={4} onChange={() => {}} />
      <Angabefeld groesse={erfassungsgroesse('pain_quality')!} wert={art} onChange={setArt} />
    </div>
  );
}

function JaNein() {
  const [wahl, setWahl] = useState<string[]>(['ja']);
  return (
    <Wahlflaechen
      titel="2. Haben Sie aktuell Schmerzen?"
      form="paar"
      wahlen={[
        { schluessel: 'ja', text: 'ja' },
        { schluessel: 'nein', text: 'nein' },
      ]}
      gewaehlt={wahl}
      onUmschalten={(s) => setWahl((w) => (w.includes(s) ? [] : [s]))}
    />
  );
}

const TAGE = [
  ['Fr', 'Freitag, 23. Oktober', '23'],
  ['Sa', 'Samstag, 24. Oktober', '24'],
  ['So', 'Sonntag, 25. Oktober', '25'],
  ['Mo', 'Montag, 26. Oktober', '26'],
  ['Di', 'Dienstag, 27. Oktober', '27'],
  ['Mi', 'Mittwoch, 28. Oktober', '28'],
  ['Do', 'heute, Donnerstag, 29. Oktober', '29'],
] as const;

function Gewohnheit() {
  const [tage, setTage] = useState<number[]>([1, 2, 4, 5, 6]);
  return (
    <div className="flex flex-col gap-4">
      <h3 id="gewohnheit" className="text-abschnitt">
        Nach dem Zähneputzen: zwei Minuten Mobilität
      </h3>
      <Wochenleiste
        beschriftetVon="gewohnheit"
        wochentage={TAGE.map(([kurz, lang, zahl], nummer) => ({ nummer, kurz, lang, zahl }))}
        tage={tage}
        heute={6}
        onUmschalten={(t) => setTage((v) => (v.includes(t) ? v.filter((x) => x !== t) : [...v, t]))}
      />
    </div>
  );
}

export function Seite() {
  const rechner = useRechner();
  return (
    <main
      data-rechner={rechner ? '' : undefined}
      className="plattform-schrift bg-canvas max-w-formular data-[rechner]:max-w-spalte mx-auto flex flex-col gap-10 px-5 py-6 max-[23rem]:px-3"
    >
      <h1 className="text-plattform-titel text-accent trennen-schmal">
        Bausteine der Selbstauskunft
      </h1>

      <Section titel="Skala und Wahl in Wörtern">
        <Skalen />
      </Section>

      <Section titel="ja und nein">
        <JaNein />
      </Section>

      <Section titel="Tage einer Gewohnheit">
        <Gewohnheit />
      </Section>

      <Section titel="Balken mit Kante">
        <div className="flex flex-col gap-3">
          <p className="flex flex-wrap justify-between gap-x-3">
            <span className="font-semibold">Energie</span>
            <span className="tabular-nums">297 von 1.466 kcal</span>
          </p>
          <ProgressBar kante wert={297} von={1466} />
          <p className="text-ink-muted flex flex-wrap justify-between gap-x-3">
            <span>Eiweiß</span>
            <span className="tabular-nums">8,1 von 59 g</span>
          </p>
          <ProgressBar kante dicht wert={8.1} von={59} />
        </div>
      </Section>

      <Section titel="Ihre Angaben">
        <Antwortbalken
          beschriftung="Ihre Angaben zu Schmerz in Ruhe"
          min={0}
          max={10}
          antworten={[
            { datum: '21.10.2026', wert: 3, text: '3' },
            { datum: '14.10.2026', wert: 5, text: '5' },
            { datum: '30.09.2026', wert: 6, text: '6', vermerk: 'Vertretung' },
            { datum: '16.09.2026', wert: 0, text: '0' },
          ]}
        />
      </Section>
    </main>
  );
}

const wurzel = document.getElementById('wurzel');
if (!wurzel) throw new Error('Wurzelelement der Prüfseite fehlt.');
createRoot(wurzel).render(<Seite />);
