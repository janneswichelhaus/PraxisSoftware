import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { createMapDisplayConfig } from '@/lib/location/display';
import { useMatrix } from '@/lib/location/matrix';
import { useRoute } from '@/lib/location/route';
import { Fahrzeitmatrix } from './Fahrzeitmatrix';
import { Karte } from './Karte';
import { NavigationHandoff } from './NavigationHandoff';
import { Routenangaben } from './Routenangaben';
import { TESTSTOPPS } from './teststopps';

/**
 * Die Kartenseite (MAP-002c, MAP-003b, MAP-004c und MAP-005b, ADR-019).
 *
 * Sie beantwortet vier Fragen: Läuft eine interaktive Karte mit eigenen,
 * nummerierten Stopps innerhalb dieser Anwendung — auf dem Schreibtisch und
 * auf dem Telefon? Liegt zwischen denselben Stopps eine Fahrradroute mit
 * Distanz und Fahrzeit? Sagen die Fahrzeiten zwischen je zwei Stopps
 * verlässlich, ob zwei Termine erreichbar wären? Und führt ein Tap von einem
 * Stopp in die Navigations-App des Geräts? Mehr ist hier nicht: kein Termin,
 * keine Adresse, keine Person. Echte Adressen kommen frühestens mit MAP-006
 * und erst nach dem Gate aus ADR-019 Punkt 9.
 *
 * **Seit MAP-003 verlassen Koordinaten das Haus** — die acht Teststopps gehen
 * über die eigene Edge Function an den Kartendienst, damit er eine Route
 * rechnen kann (ADR-019 Punkt 13 und 15). Gespeichert wird davon nichts; die
 * Stopps stehen fest in `teststopps.ts` und tragen keinen Personenbezug.
 *
 * **Ohne Kennzeichnungsbanner seit 2026-09-22.** Dass hier Teststopps liegen,
 * sagen die Seite und `teststopps.ts`; ein Warnkasten darüber sagte es ein
 * zweites Mal. Was die Zahlen tragen — Profil, Terminraster, Quelle der
 * Fahrzeiten —, steht weiterhin an den Zahlen selbst.
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

  /**
   * Die Matrix rechnet **nur** im Lastenradprofil (MAP-004).
   *
   * Anders als bei der Route ist hier kein Vergleich gefragt: Wo eine Planung
   * ein Profil braucht, ist es das gewählte (`TravelProfile` in
   * `src/lib/location/contract.ts`, Entscheidung vom 2026-09-22). Ein zweiter
   * Abruf kostete 64 weitere Relationen beim Anbieter und beantwortete nichts.
   */
  const matrix = useMatrix(wegpunkte, wegpunkte, 'cargo_bicycle');

  return (
    <>
      <PageHeader title="Karte" description="Teststopps in Tübingen mit Route und Fahrzeiten." />

      <Karte
        config={config}
        stopps={TESTSTOPPS}
        beschriftung={`Karte mit ${TESTSTOPPS.length} Teststopps in Tübingen`}
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

      <h2 className="text-h4 text-ink mt-6 mb-3 font-medium">Die Fahrzeiten</h2>
      <Fahrzeitmatrix
        stopps={TESTSTOPPS}
        laedt={matrix.isFetching}
        ergebnis={matrix.data}
        erneutVersuchen={() => {
          void matrix.refetch();
        }}
      />

      <h2 className="text-h4 text-ink mt-6 mb-3 font-medium">Die Stopps</h2>
      <NavigationHandoff stopps={TESTSTOPPS} />

      {/* Steht hier weiter, obwohl der Vorschaubanner gegangen ist: Wohin
        Koordinaten gehen und dass das Gate aus ADR-019 Punkt 9 noch offen ist,
        sind keine Entwicklungsnotizen — sie gelten unverändert, wenn diese
        Seite einmal echte Adressen trägt. Ohne Warnkasten, als Abschnitt wie
        die anderen. */}
      <h2 className="text-h4 text-ink mt-6 mb-3 font-medium">
        Der Kartendienst ist geprüft, aber nicht freigegeben
      </h2>
      <p className="text-ink-muted text-sm">
        Auf dieser Seite liegen acht feste Punkte im Stadtgebiet: Keine Adresse, kein Termin, keine
        Person — und gespeichert wird davon nichts. Für die Route gehen die acht Koordinaten über
        den eigenen Server an den Kartendienst, ohne Namen und ohne Uhrzeit; der Browser selbst lädt
        dort nur Kartenausschnitt und Zoom. Bevor echte Adressen einen Kartendienst erreichen, sind
        Vertrag, §203 StGB und die Datenschutz-Folgenabschätzung zu klären — die neun Punkte des
        Gates aus ADR-019.
      </p>

      <p className="text-ink-subtle mt-4 text-sm">
        <Link to="/touren" className="text-accent hover:text-accent-hover underline">
          Zurück zur Besuchsfolge
        </Link>
      </p>
    </>
  );
}
