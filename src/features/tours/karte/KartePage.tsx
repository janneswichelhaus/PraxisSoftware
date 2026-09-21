import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { OffeneEntscheidung, VorschauBanner } from '@/features/preview/ui';
import { createMapDisplayConfig } from '@/lib/location/display';
import { useRoute } from '@/lib/location/route';
import { Karte } from './Karte';
import { Routenangaben } from './Routenangaben';
import { TESTSTOPPS } from './teststopps';

/**
 * Vorschauseite des Kartenprototyps (MAP-002c und MAP-003b, ADR-019).
 *
 * Sie beantwortet zwei Fragen: Läuft eine interaktive Karte mit eigenen,
 * nummerierten Stopps innerhalb dieser Anwendung — auf dem Schreibtisch und
 * auf dem Telefon? Und liegt zwischen denselben Stopps eine Fahrradroute mit
 * Distanz und Fahrzeit? Mehr ist hier nicht: kein Termin, keine Adresse,
 * keine Person. Die Fahrzeitmatrix kommt mit MAP-004, echte Adressen
 * frühestens mit MAP-006 und erst nach dem Gate aus ADR-019 Punkt 9.
 *
 * **Seit MAP-003 verlassen Koordinaten das Haus** — die acht erfundenen
 * Punkte gehen über die eigene Edge Function an den Kartendienst, damit er
 * eine Route rechnen kann (ADR-019 Punkt 13 und 15). Nichts davon wird
 * gespeichert, und der Banner sagt es.
 *
 * Die Seite liegt hinter der Anmeldung, obwohl sie nichts Schützenswertes
 * zeigt: Sie gehört in den Kalenderbereich und soll dort geprüft werden, wo
 * sie später steht.
 */
export function KartePage() {
  // Ein Mal je Seitenbesuch: Eine neue Konfiguration bei jedem Rendern
  // erzeugte jedes Mal eine neue Karte.
  const config = useMemo(() => createMapDisplayConfig(), []);
  const wegpunkte = useMemo(() => TESTSTOPPS.map((stopp) => stopp.position), []);

  /**
   * Zwei Abrufe auf denselben Stopps — das ist die Messung aus MAP-003c.
   *
   * Sie ist keine Einstellung: Gezeichnet wird das Fahrradprofil, das
   * Lastenradprofil steht als Zahl daneben. Welches von beiden die Räder der
   * Praxis abbildet, entscheidet Jannes nach dem lokalen Lauf.
   */
  const fahrrad = useRoute(wegpunkte, 'bicycle');
  const lastenrad = useRoute(wegpunkte, 'cargo_bicycle');
  const route = fahrrad.data?.ok === true ? fahrrad.data.value.route.geometry : undefined;

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
          'und nichts davon wird gespeichert. Für die Route gehen die acht Koordinaten über ' +
          'den eigenen Server an den Kartendienst; der Browser selbst lädt dort nur ' +
          'Kartenausschnitt und Zoom.'
        }
      />

      <Karte
        config={config}
        stopps={TESTSTOPPS}
        beschriftung={`Karte mit ${TESTSTOPPS.length} synthetischen Teststopps in Tübingen`}
        route={route}
      />

      <h2 className="text-h4 text-ink mt-6 mb-3 font-medium">Die Route</h2>
      <Routenangaben
        laedt={fahrrad.isFetching}
        ergebnis={fahrrad.data}
        lastenrad={lastenrad.data}
        erneutVersuchen={() => {
          void fahrrad.refetch();
          void lastenrad.refetch();
        }}
      />

      <h2 className="text-h4 text-ink mt-6 mb-3 font-medium">Die Stopps</h2>
      <p className="text-ink-muted mb-3 text-sm">
        Dieselben Punkte als Liste — die Karte ist nicht der einzige Weg zu ihnen.
      </p>
      <ol aria-label="Die Stopps" className="border-line border-y">
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
        Kartenausschnitt und Zoom, keine Adresse und keinen Namen. Die Route rechnet der Anbieter
        auf Anfrage des eigenen Servers, und zwar aus Koordinaten ohne Namen und ohne Uhrzeit;
        gespeichert wird weder Strecke noch Fahrzeit. Bevor echte Adressen einen Kartendienst
        erreichen, sind Vertrag, §203 StGB und die Datenschutz-Folgenabschätzung zu klären — die
        neun Punkte des Gates aus ADR-019. Bis dahin bleibt es bei erfundenen Koordinaten.
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
