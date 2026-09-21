import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { OffeneEntscheidung, VorschauBanner } from '@/features/preview/ui';
import { createMapDisplayConfig } from '@/lib/location/display';
import { Karte } from './Karte';
import { TESTSTOPPS } from './teststopps';

/**
 * Vorschauseite des Kartenprototyps (MAP-002c, ADR-019).
 *
 * Sie beantwortet **eine** Frage: Läuft eine interaktive Karte mit eigenen,
 * nummerierten Stopps innerhalb dieser Anwendung — auf dem Schreibtisch und
 * auf dem Telefon? Mehr ist hier nicht: keine Route, keine Fahrzeit, kein
 * Termin, keine Adresse. Route und Fahrzeit kommen mit MAP-003 und MAP-004,
 * echte Adressen frühestens mit MAP-006 und erst nach dem Gate aus ADR-019
 * Punkt 9.
 *
 * Die Seite liegt hinter der Anmeldung, obwohl sie nichts Schützenswertes
 * zeigt: Sie gehört in den Kalenderbereich und soll dort geprüft werden, wo
 * sie später steht.
 */
export function KartePage() {
  // Ein Mal je Seitenbesuch: Eine neue Konfiguration bei jedem Rendern
  // erzeugte jedes Mal eine neue Karte.
  const config = useMemo(() => createMapDisplayConfig(), []);

  return (
    <>
      <PageHeader
        title="Karte"
        description="Kartenprototyp mit synthetischen Teststopps in Tübingen."
      />

      <VorschauBanner
        bereich="Karte"
        beschreibung={
          'Acht erfundene Punkte im Stadtgebiet. Keine Adresse, kein Termin, keine Person — ' +
          'und nichts davon wird gespeichert. Zum Kartendienst gehen nur Kartenausschnitt und ' +
          'Zoom, nie die Stopps.'
        }
      />

      <Karte
        config={config}
        stopps={TESTSTOPPS}
        beschriftung={`Karte mit ${TESTSTOPPS.length} synthetischen Teststopps in Tübingen`}
      />

      <h2 className="text-h4 text-ink mt-6 mb-3 font-medium">Die Stopps</h2>
      <p className="text-ink-muted mb-3 text-sm">
        Dieselben Punkte als Liste — die Karte ist nicht der einzige Weg zu ihnen.
      </p>
      <ol className="border-line border-y">
        {TESTSTOPPS.map((stopp) => (
          <li
            key={stopp.label}
            className="border-line flex items-baseline gap-3 border-b py-3 last:border-b-0"
          >
            <span className="bg-accent-soft text-accent rounded-pill flex h-7 w-7 shrink-0 items-center justify-center text-sm font-semibold">
              {stopp.label}
            </span>
            <span className="text-ink text-[0.9375rem] tabular-nums">
              {koordinate(stopp.position.lat)} Nord · {koordinate(stopp.position.lon)} Ost
            </span>
          </li>
        ))}
      </ol>

      <OffeneEntscheidung titel="Der Kartendienst ist geprüft, aber nicht freigegeben">
        Kacheln sind der einzige direkte Kontakt des Browsers zum Anbieter; sie tragen
        Kartenausschnitt und Zoom, keine Adresse und keinen Namen. Bevor echte Adressen einen
        Kartendienst erreichen, sind Vertrag, §203 StGB und die Datenschutz-Folgenabschätzung zu
        klären — die neun Punkte des Gates aus ADR-019. Bis dahin bleibt es bei erfundenen
        Koordinaten.
      </OffeneEntscheidung>

      <p className="text-ink-subtle mt-4 text-sm">
        <Link to="/touren" className="text-accent hover:text-accent-hover underline">
          Zurück zur Besuchsfolge
        </Link>
      </p>
    </>
  );
}

/** Dezimalgrad in deutscher Schreibweise, auf rund elf Meter genau. */
function koordinate(wert: number): string {
  return wert.toFixed(4).replace('.', ',');
}
