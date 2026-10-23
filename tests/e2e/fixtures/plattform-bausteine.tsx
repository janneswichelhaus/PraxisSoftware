import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { Aufgabenkarte } from '@/components/ui/Aufgabenkarte';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { EmptyState } from '@/components/ui/Feedback';
import { HeroKarte } from '@/components/ui/HeroKarte';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { Menueknopf } from '@/components/ui/Menueknopf';
import { Section } from '@/components/ui/Section';
import { Skelett, SkelettBereich } from '@/components/ui/Skelett';
import type { Termin } from '@/features/platform/api';
import { Besuchskarte } from '@/features/platform/Besuchskarte';
import { Notfallkarte } from '@/features/platform/Notfallkarte';
import '@/index.css';

/**
 * Einstieg der Prüfseite aus `plattform-bausteine.html` (Schritt 1a,
 * Handoff 2026-10-22): die Bausteine der Plattform unter `.plattform-schrift`,
 * wie sie die Übersicht, die Türen und die Nachrichten bekommen - ohne
 * Server, mit erfundenen Angaben.
 */
const schrift = new URLSearchParams(window.location.search).get('schrift');
if (schrift === 'gross' || schrift === 'sehr-gross') {
  document.documentElement.dataset.schrift = schrift;
}

const morgen = new Date();
morgen.setDate(morgen.getDate() + 2);
morgen.setHours(9, 30, 0, 0);
const ende = new Date(morgen);
ende.setHours(10, 30);

const TERMIN = {
  id: '77777777-7777-4777-8777-000000000001',
  starts_at: morgen.toISOString(),
  ends_at: ende.toISOString(),
  appointment_type: 'home_visit',
  staff_name: 'Anna-Katharina Leutheusser-Schnarrenberger',
  visit_street: 'Testweg',
  visit_house_number: '7',
  visit_postal_code: '72072',
  visit_city: 'Tuebingen',
  location_name: null,
} as unknown as Termin;

/** Zeichen der Aufgaben im Raster 24, Strich 2. */
const UHR = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
    <circle cx="12" cy="13" r="8" />
    <path d="M12 9v4l2.5 2.5M9 2h6" />
  </svg>
);
/** Eine Sprechblase für den Check-in - der Haken heißt sonst „erledigt“. */
const FRAGE = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M5 5h14v10h-8l-4 4v-4H5z" />
  </svg>
);

export function Seite() {
  return (
    <main className="plattform-schrift bg-canvas max-w-formular mx-auto flex flex-col gap-10 px-5 py-6">
      <h1 className="text-plattform-titel text-accent">Bausteine der Plattform</h1>

      <HeroKarte
        titel="Fragebogen vor Ihrem ersten Termin"
        satz="Etwa 10 Minuten. Ihre Therapeut:in sieht Ihre Angaben beim ersten Termin."
        aktion={{ text: 'Fragebogen beginnen', to: '/p/befundbogen' }}
      />
      <HeroKarte
        etikett="Nächster Besuch"
        titel="Besuch am Samstag"
        satz="09:30 bis 10:30"
        person={{
          name: 'Anna Beispiel',
          farbe: 'tanne',
          zeile: 'Anna Beispiel kommt zu Ihnen',
        }}
        aktion={{ text: 'Termin ansehen', to: '/p/termine' }}
      />

      <Section titel="Heute">
        <div className="flex flex-col gap-4">
          <Aufgabenkarte
            zeichen={UHR}
            titel="Eine kleine Gewohnheit"
            satz="Zwei Minuten Mobilität"
            to="/p/gewohnheiten"
          />
          <Aufgabenkarte
            zeichen={FRAGE}
            titel="Check-in"
            satz="Wie geht es Ihnen seit dem letzten Termin?"
            to="/p/checkin"
          />
        </div>
      </Section>

      <Section titel="Nächster Besuch">
        <Besuchskarte termin={TERMIN} to="/p/termine" />
      </Section>

      <Section titel="Neu für Sie">
        <ListRows>
          <ListRow titel="Antwort der Praxis" meta="Ihr Terminwunsch ist erledigt." to="/p" />
          <ListRow titel="Rechnung RG-2026-0007" meta="Fällig am 24.10.2026" to="/p" />
        </ListRows>
      </Section>

      <Section titel="Ohne Termin">
        <EmptyState
          markenform
          inKarte
          title="Noch keine Termine"
          description="Die Praxis trägt Ihren ersten Termin hier ein."
        />
      </Section>

      <Section titel="Über dem Nachrichtenfeld">
        <Notfallkarte werktage={2} />
      </Section>

      <Section titel="Laden">
        <SkelettBereich beschriftung="Übersicht wird geladen" className="flex flex-col gap-4">
          <Skelett form="zeile" className="w-2/3" />
          <Skelett form="hero" />
          <Skelett form="karte" />
        </SkelettBereich>
      </Section>

      <Section titel="Knöpfe">
        <div className="flex flex-col gap-3">
          <Button className="w-full">Termin wünschen</Button>
          <Button variant="secondary" className="w-full">
            Plan als PDF
          </Button>
          <Button variant="quiet" className="w-full">
            Später
          </Button>
          <div className="bg-surface-inverse rounded-card p-4">
            <ButtonLink variant="marke" to="/p/uebungen" className="w-full">
              Übungen beginnen
            </ButtonLink>
          </div>
          {/* Der Knopf „Menü“ unter 23rem (Stufe 3), zu und offen. */}
          <div className="flex gap-3">
            <Menueknopf offen={false} steuert="menue-probe" />
            <Menueknopf offen steuert="menue-probe" />
          </div>
          <nav id="menue-probe" aria-label="Menü der Prüfseite" hidden />
        </div>
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
