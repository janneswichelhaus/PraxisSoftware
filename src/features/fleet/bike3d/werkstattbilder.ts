import { Mesh, PerspectiveCamera, Raycaster, Vector3, type Material, type Object3D } from 'three';
import {
  createRenderer,
  createScene,
  disposeScene,
  fitRadius,
  loadStickerLogo,
  placeCamera,
  zoneOrbit,
  type Orbit,
} from './viewer';
import { BIKE_CENTER, isZoneKey, type ModelPoint } from './zones';

/**
 * Die Bilder der Unterlage für die Werkstatt (Handoff Lastenrad 3D,
 * Abschnitt 4): die rechte Seite mit dem Antrieb, die linke Seite und je
 * Stelle ein Ausschnitt am Modell - gerechnet in einem Zeichenkontext ohne
 * Bildschirm, als PNG.
 *
 * Die Nadeln zeichnet die Seite als SVG über das Bild, an der projizierten
 * Stelle des Punkts (in Prozent von Breite und Höhe), damit Nummer und Form
 * scharf drucken. Diese Datei liefert dafür die Lage und sagt, auf welcher
 * Seitenansicht eine Stelle steht:
 *
 *   * nach der z-Koordinate (z ≥ 0 rechte Seite mit Antrieb, sonst links),
 *   * per Strahl auf Verdeckung geprüft; verdeckt dort, die andere Seite,
 *     auf beiden verdeckt nur im Ausschnitt;
 *   * höchstens eine Seitenansicht je Stelle.
 *
 * Der Ausschnitt nimmt die Kamera des Bauteils; die Bremse vorne abweichend
 * von links, damit kein angeschnittener Aufkleber im Bild steht.
 *
 * Geladen wird die Datei wie der Betrachter nur auf Abruf (ANN-556).
 */

export interface Bildstelle {
  id: string;
  zone: string;
  point: ModelPoint | null;
}

export interface Bildpunkt {
  id: string;
  /** Lage in Prozent der Bildbreite und -höhe. */
  x: number;
  y: number;
}

export interface Werkstattbild {
  url: string;
  punkte: Bildpunkt[];
}

export interface Werkstattbilder {
  rechts: Werkstattbild;
  links: Werkstattbild;
  ausschnitte: Record<string, Werkstattbild>;
}

const DEG = Math.PI / 180;

const SEITEN = {
  rechts: { theta: 0, phi: 84 },
  links: { theta: 180, phi: 84 },
} as const;

/** Die Bremse vorne von links (Handoff, Abschnitt 4). */
const BREMSE_VORNE: Orbit = {
  theta: 180 * DEG,
  phi: 84 * DEG,
  radius: 1.05,
  target: new Vector3(1.06, 0.25, -0.06),
};

/** Der Aufkleber - ohne ihn trüge die Transportbox eine leere Fläche. */
function aufkleberGeladen(
  bike: Parameters<typeof loadStickerLogo>[0],
  wartezeit: number,
): Promise<void> {
  return new Promise((fertig) => {
    const uhr = window.setTimeout(fertig, wartezeit);
    loadStickerLogo(bike, () => {
      window.clearTimeout(uhr);
      fertig();
    });
  });
}

function sichtbarerStoff(objekt: Object3D): boolean {
  if (!(objekt instanceof Mesh) || !objekt.visible) return false;
  const stoffe = [objekt.material as Material | Material[]].flat();
  return stoffe.some((stoff) => stoff.visible);
}

export async function zeichneWerkstattbilder(
  stellen: readonly Bildstelle[],
  // Die Seitenansichten stehen auf Seite 1 nebeneinander, je 341 : 200 wie
  // im Entwurf; die Ausschnitte 3 : 2. Dreifach gerechnet, damit sie auf
  // Papier scharf bleiben.
  masse: { seite: [number, number]; ausschnitt: [number, number] } = {
    seite: [1023, 600],
    ausschnitt: [900, 600],
  },
): Promise<Werkstattbilder> {
  const renderer = createRenderer();
  renderer.setPixelRatio(1);
  const { scene, bike } = createScene(renderer);
  const camera = new PerspectiveCamera(30, 1, 0.03, 60);
  const raycaster = new Raycaster();
  const koerper: Object3D[] = [];
  bike.root.traverse((objekt) => {
    if (sichtbarerStoff(objekt)) koerper.push(objekt);
  });

  try {
    await aufkleberGeladen(bike, 3000);

    function kamera(breite: number, hoehe: number, orbit: Orbit) {
      renderer.setSize(breite, hoehe, false);
      camera.aspect = breite / hoehe;
      camera.updateProjectionMatrix();
      placeCamera(camera, orbit);
      camera.updateMatrixWorld();
    }

    function bild(): string {
      renderer.render(scene, camera);
      return renderer.domElement.toDataURL('image/png');
    }

    function lage(punkt: Vector3): { x: number; y: number } {
      const ndc = punkt.clone().project(camera);
      return { x: ((ndc.x + 1) / 2) * 100, y: ((1 - ndc.y) / 2) * 100 };
    }

    /**
     * Trifft der Strahl von der Kamera vor dem Punkt auf ein anderes Bauteil?
     * Das eigene zählt nicht: Ohne gespeicherten Punkt steht die Nadel in der
     * Mitte des Bauteils, also in ihm.
     */
    function verdeckt(punkt: Vector3, zone: string): boolean {
      const richtung = punkt.clone().sub(camera.position);
      const abstand = richtung.length();
      raycaster.set(camera.position, richtung.normalize());
      raycaster.far = abstand;
      return raycaster
        .intersectObjects(koerper, false)
        .some(
          (treffer) => treffer.distance < abstand - 0.025 && treffer.object.userData.zone !== zone,
        );
    }

    function punktVon(stelle: Bildstelle): Vector3 | null {
      if (stelle.point) return new Vector3(...stelle.point);
      const mitte = isZoneKey(stelle.zone) ? bike.zones[stelle.zone]?.center : undefined;
      return mitte ? mitte.clone() : null;
    }

    const [seitenBreite, seitenHoehe] = masse.seite;
    const seitenOrbit = (seite: keyof typeof SEITEN): Orbit => ({
      theta: SEITEN[seite].theta * DEG,
      phi: SEITEN[seite].phi * DEG,
      // Enger als im Betrachter: Auf Papier liegen keine Knöpfe über dem Rad.
      radius: fitRadius(seitenBreite / seitenHoehe) * 0.95,
      target: new Vector3(...BIKE_CENTER),
    });

    // Welche Stelle auf welcher Seite steht, entscheidet die Verdeckung.
    const sichtbar = { rechts: new Set<string>(), links: new Set<string>() };
    for (const seite of ['rechts', 'links'] as const) {
      kamera(seitenBreite, seitenHoehe, seitenOrbit(seite));
      for (const stelle of stellen) {
        const punkt = punktVon(stelle);
        if (punkt && !verdeckt(punkt, stelle.zone)) sichtbar[seite].add(stelle.id);
      }
    }
    const zuordnung = new Map<string, 'rechts' | 'links'>();
    for (const stelle of stellen) {
      const punkt = punktVon(stelle);
      if (!punkt) continue;
      const zuerst = punkt.z >= 0 ? 'rechts' : 'links';
      const sonst = zuerst === 'rechts' ? 'links' : 'rechts';
      if (sichtbar[zuerst].has(stelle.id)) zuordnung.set(stelle.id, zuerst);
      else if (sichtbar[sonst].has(stelle.id)) zuordnung.set(stelle.id, sonst);
    }

    function seitenbild(seite: 'rechts' | 'links'): Werkstattbild {
      kamera(seitenBreite, seitenHoehe, seitenOrbit(seite));
      const punkte: Bildpunkt[] = [];
      for (const stelle of stellen) {
        const punkt = punktVon(stelle);
        if (punkt && zuordnung.get(stelle.id) === seite)
          punkte.push({ id: stelle.id, ...lage(punkt) });
      }
      return { url: bild(), punkte };
    }

    const rechts = seitenbild('rechts');
    const links = seitenbild('links');

    const [ausschnittBreite, ausschnittHoehe] = masse.ausschnitt;
    const ausschnitte: Record<string, Werkstattbild> = {};
    for (const stelle of stellen) {
      const orbit =
        stelle.zone === 'bremse-vorne'
          ? BREMSE_VORNE
          : zoneOrbit(bike, [stelle.zone], ausschnittBreite / ausschnittHoehe);
      if (!orbit) continue;
      kamera(ausschnittBreite, ausschnittHoehe, orbit);
      const punkt = punktVon(stelle);
      ausschnitte[stelle.id] = {
        url: bild(),
        punkte: punkt ? [{ id: stelle.id, ...lage(punkt) }] : [],
      };
    }

    return { rechts, links, ausschnitte };
  } finally {
    disposeScene(scene);
    renderer.dispose();
  }
}
