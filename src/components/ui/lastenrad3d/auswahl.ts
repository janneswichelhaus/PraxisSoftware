// Auswahl am 3D-Rad: Ein Tipp meldet die Gruppen unter dem Finger, die getroffene zuerst. Wählbare
// Gruppen stehen in Farbe, der Rest tritt zurück, markierte tragen die Farbe ihrer Bedeutung. Die
// Ansicht selbst bleibt unverändert; dieses Modul arbeitet nur mit dem, was sie herausgibt.

import {
  Box3,
  Color,
  Raycaster,
  SRGBColorSpace,
  type ShadowMaterial,
  Vector2,
  Vector3,
  type BufferGeometry,
  type Mesh,
  type MeshStandardMaterial,
  type Object3D,
} from 'three';
import type { LastenradAnsicht } from './viewer';

const TIPP_WEG = 12; // Bildpunkte; darüber dreht die Hand das Rad
const TIPP_DAUER = 800; // Millisekunden; länger ist ein Halten
const FINGER = 22; // Bildpunkte um den Tipp: Der Daumen deckt 44, was darunter liegt, steht zur Wahl
const TREFFER_NAEHE = 28; // Bildpunkte um die Mitte eines Teils, falls unter dem Finger nichts liegt
const GEIST = 0.16; // Deckkraft dessen, was nicht wählbar ist
const KLEINSTER_AUSSCHNITT = 0.28; // Meter; ein kleines Teil zeigt noch, wo am Rad es sitzt
const LUFT = 1.08;
const BLICK = [1, 0.55, 1.25] as const; // wie die Startansicht: von vorn, leicht von oben
const BLICK_FLACH = 0.12; // unter dem Ladeboden hilft nur der Blick von der Seite

// Die Mitte, ein Ring auf halbem Weg und einer am Rand des Fingers, gegeneinander versetzt.
const FINGERPUNKTE: readonly (readonly [number, number])[] = [
  [0, 0],
  ...Array.from({ length: 16 }, (_, nummer): [number, number] => {
    const radius = nummer < 8 ? FINGER / 2 : FINGER;
    const winkel = ((nummer % 8) + (nummer < 8 ? 0 : 0.5)) * (Math.PI / 4);
    return [Math.cos(winkel) * radius, Math.sin(winkel) * radius];
  }),
];

type Teil = Mesh<BufferGeometry, MeshStandardMaterial>;

export interface Marke {
  gruppe: string;
  /** Eine CSS-Farbe, etwa der Wert eines Tokens. */
  farbe: string;
}

export interface Auswahlstand {
  /** Nur diese Gruppen sind wählbar; `null` heißt alle. */
  waehlbar: readonly string[] | null;
  marken: readonly Marke[];
}

export interface Auswahl {
  setze: (stand: Auswahlstand) => void;
  /**
   * Ein Punkt im Fenster, an dem ein Tipp die Gruppe trifft, `allein`, wenn unter dem Finger keine
   * zweite liegt; verdeckt oder ohne Teil `null`.
   */
  punkt: (gruppe: string) => { x: number; y: number; allein: boolean } | null;
  dispose: () => void;
}

// Der Browser kennt jede CSS-Schreibweise einer Farbe; ein Bildpunkt liefert sie als sRGB.
function farbwert(css: string): Color | null {
  const flaeche = document.createElement('canvas');
  flaeche.width = flaeche.height = 1;
  const stift = flaeche.getContext('2d');
  if (!stift || !css) return null;
  stift.fillStyle = css;
  stift.fillRect(0, 0, 1, 1);
  const [r = 0, g = 0, b = 0] = stift.getImageData(0, 0, 1, 1).data;
  return new Color().setRGB(r / 255, g / 255, b / 255, SRGBColorSpace);
}

export function richteAuswahlEin(
  ansicht: LastenradAnsicht,
  container: HTMLElement,
  gruppeVon: (teil: string) => string | null,
  onWahl: (gruppen: readonly string[]) => void,
): Auswahl {
  const { canvas, camera, controls, model } = ansicht;
  model.updateMatrixWorld(true);

  // Das Rad steht still: Kasten und Mitte jedes Teils gelten für die ganze Lebenszeit.
  const teile: {
    mesh: Teil;
    gruppe: string | null;
    original: MeshStandardMaterial;
    kasten: Box3;
    mitte: Vector3;
  }[] = [];
  const gruppeJeTeil = new Map<Object3D, string | null>();
  model.traverse((o) => {
    if (!(o as Partial<Mesh>).isMesh) return;
    const mesh = o as Teil;
    const kasten = new Box3().setFromObject(mesh, true);
    const gruppe = gruppeVon(mesh.name);
    gruppeJeTeil.set(mesh, gruppe);
    teile.push({
      mesh,
      gruppe,
      original: mesh.material,
      kasten,
      mitte: kasten.getCenter(new Vector3()),
    });
  });
  // Wie groß eine Gruppe am Rad ist: Unter dem Finger zählt das Kleine vor dem, was dahinter liegt.
  const ausmass = new Map<string, number>();
  for (const gruppe of new Set(teile.map((teil) => teil.gruppe))) {
    if (gruppe === null) continue;
    const kasten = new Box3();
    for (const teil of teile) if (teil.gruppe === gruppe) kasten.union(teil.kasten);
    ausmass.set(gruppe, kasten.getSize(new Vector3()).length());
  }
  // Der Boden der Ansicht zeigt nur den Schatten des ganzen Rads.
  const schatten = model.parent?.children.find(
    (o) => (o as Partial<Mesh<BufferGeometry, ShadowMaterial>>).material?.isShadowMaterial,
  );

  const geister = new Map<MeshStandardMaterial, MeshStandardMaterial>();
  const getoente = new Map<string, MeshStandardMaterial>();
  const geist = (original: MeshStandardMaterial) => {
    let material = geister.get(original);
    if (!material) {
      material = original.clone();
      material.transparent = true;
      material.opacity = GEIST;
      material.depthWrite = false;
      geister.set(original, material);
    }
    return material;
  };
  const getoent = (original: MeshStandardMaterial, css: string) => {
    const schluessel = `${original.uuid}|${css}`;
    let material = getoente.get(schluessel);
    if (!material) {
      const farbe = farbwert(css);
      if (!farbe) return original;
      material = original.clone();
      material.color.copy(farbe);
      // Etwas Eigenlicht: Die Marke bleibt auch im Schatten der Box erkennbar.
      material.emissive.copy(farbe).multiplyScalar(0.35);
      getoente.set(schluessel, material);
    }
    return material;
  };

  let stand: Auswahlstand = { waehlbar: null, marken: [] };
  let selbstGedreht = false;
  const istWaehlbar = (gruppe: string | null): gruppe is string =>
    gruppe !== null && (stand.waehlbar === null || stand.waehlbar.includes(gruppe));

  const bild = new Vector3();
  function imFenster(ort: Vector3): { x: number; y: number; sichtbar: boolean } {
    const flaeche = canvas.getBoundingClientRect();
    bild.copy(ort).project(camera);
    return {
      x: flaeche.left + ((bild.x + 1) / 2) * flaeche.width,
      y: flaeche.top + ((1 - bild.y) / 2) * flaeche.height,
      sichtbar: Math.abs(bild.x) <= 1 && Math.abs(bild.y) <= 1 && bild.z <= 1,
    };
  }

  // Der Ausschnitt zeigt die wählbaren Teile groß, immer von derselben Seite: Vorn bleibt rechts.
  // Was auf der anderen Seite sitzt, etwa die Bremsscheiben, scheint durch das Zurückgetretene.
  function rahme() {
    if (stand.waehlbar === null) return;
    const kasten = new Box3();
    for (const teil of teile) if (istWaehlbar(teil.gruppe)) kasten.union(teil.kasten);
    if (kasten.isEmpty()) return;
    const mitte = kasten.getCenter(new Vector3());
    const halb = kasten.getSize(new Vector3()).multiplyScalar(0.5);
    halb.max(new Vector3(KLEINSTER_AUSSCHNITT, KLEINSTER_AUSSCHNITT, KLEINSTER_AUSSCHNITT));
    const hoch = mitte.y < 0.32 ? BLICK_FLACH : BLICK[1];
    const richtung = new Vector3(BLICK[0], hoch, BLICK[2]).normalize();
    // Wie die Ansicht selbst: Der Abstand folgt aus den Ecken des Kastens, quer und hoch im Bild.
    const quer = new Vector3().crossVectors(new Vector3(0, 1, 0), richtung).normalize();
    const auf = new Vector3().crossVectors(richtung, quer);
    const tanHoch = Math.tan((camera.fov * Math.PI) / 360);
    const tanQuer = tanHoch * camera.aspect;
    let abstand = controls.minDistance;
    const ecke = new Vector3();
    for (let i = 0; i < 8; i += 1) {
      ecke.set(i & 1 ? halb.x : -halb.x, i & 2 ? halb.y : -halb.y, i & 4 ? halb.z : -halb.z);
      const tief = ecke.dot(richtung);
      abstand = Math.max(
        abstand,
        Math.abs(ecke.dot(quer)) / tanQuer + tief,
        Math.abs(ecke.dot(auf)) / tanHoch + tief,
      );
    }
    controls.target.copy(mitte);
    camera.position.copy(mitte).addScaledVector(richtung, abstand * LUFT);
  }

  function setze(neu: Auswahlstand) {
    stand = neu;
    const farben = new Map(neu.marken.map((marke) => [marke.gruppe, marke.farbe]));
    for (const teil of teile) {
      const farbe = teil.gruppe === null ? undefined : farben.get(teil.gruppe);
      teil.mesh.material =
        farbe === undefined
          ? istWaehlbar(teil.gruppe) || neu.waehlbar === null
            ? teil.original
            : geist(teil.original)
          : // Was ein Bild trägt, ist die Wortmarke: Sie wird nicht umgefärbt.
            teil.original.map
            ? teil.original
            : getoent(teil.original, farbe);
    }
    // Im Ausschnitt wäre der Schatten des zurückgetretenen Rads das Dunkelste im Bild.
    if (schatten) schatten.visible = neu.waehlbar === null;
    selbstGedreht = false;
    rahme();
    ansicht.render();
  }

  const strahl = new Raycaster();
  const ziel = new Vector2();
  // Was zurücktritt, steht einem Treffer nicht im Weg.
  function getroffen(x: number, y: number, flaeche: DOMRect, waehlbare: Teil[]): string | null {
    if (x < flaeche.left || x > flaeche.right || y < flaeche.top || y > flaeche.bottom) return null;
    ziel.set(
      ((x - flaeche.left) / flaeche.width) * 2 - 1,
      -((y - flaeche.top) / flaeche.height) * 2 + 1,
    );
    strahl.setFromCamera(ziel, camera);
    const erster = strahl.intersectObjects(waehlbare, false)[0];
    return erster ? (gruppeJeTeil.get(erster.object) ?? null) : null;
  }

  // Die Gruppen unter dem Finger: zuerst die in der Mitte, dann die kleinen vor den großen.
  function unterDemFinger(x: number, y: number): string[] {
    const flaeche = canvas.getBoundingClientRect();
    if (!flaeche.width || !flaeche.height) return [];
    const waehlbare = teile.filter((teil) => istWaehlbar(teil.gruppe));
    const meshes = waehlbare.map((teil) => teil.mesh);
    const mitte = getroffen(x, y, flaeche, meshes);
    const gefunden = new Set<string>();
    for (const [dx, dy] of FINGERPUNKTE) {
      const gruppe = getroffen(x + dx, y + dy, flaeche, meshes);
      if (gruppe !== null) gefunden.add(gruppe);
    }
    // Ein kleines Teil rutscht zwischen den Punkten durch: Liegt seine Mitte frei unter dem Finger, zählt es.
    let naechste: string | null = null;
    let naehe = TREFFER_NAEHE;
    for (const teil of waehlbare) {
      const ort = imFenster(teil.mitte);
      const weg = Math.hypot(ort.x - x, ort.y - y);
      if (!ort.sichtbar || weg >= TREFFER_NAEHE) continue;
      if (weg <= FINGER && getroffen(ort.x, ort.y, flaeche, meshes) === teil.gruppe) {
        gefunden.add(teil.gruppe!);
      }
      if (weg < naehe) {
        naehe = weg;
        naechste = teil.gruppe;
      }
    }
    if (gefunden.size === 0) return naechste === null ? [] : [naechste];
    return [...gefunden].sort(
      (a, b) =>
        Number(b === mitte) - Number(a === mitte) || (ausmass.get(a) ?? 0) - (ausmass.get(b) ?? 0),
    );
  }

  let ab: { x: number; y: number; zeit: number } | null = null;
  const druecken = (ereignis: PointerEvent) => {
    ab = ereignis.isPrimary
      ? { x: ereignis.clientX, y: ereignis.clientY, zeit: ereignis.timeStamp }
      : null;
  };
  const loslassen = (ereignis: PointerEvent) => {
    const start = ab;
    ab = null;
    if (!start || ereignis.timeStamp - start.zeit > TIPP_DAUER) return;
    if (Math.hypot(ereignis.clientX - start.x, ereignis.clientY - start.y) > TIPP_WEG) {
      selbstGedreht = true;
      return;
    }
    const gruppen = unterDemFinger(ereignis.clientX, ereignis.clientY);
    if (gruppen.length > 0) onWahl(gruppen);
  };
  canvas.addEventListener('pointerdown', druecken);
  canvas.addEventListener('pointerup', loslassen);

  // Nach der Ansicht angemeldet, läuft also nach ihr: Sie rahmt das ganze Rad, dies den Ausschnitt.
  const groesse = new ResizeObserver(() => {
    if (selbstGedreht) return;
    rahme();
    ansicht.render();
  });
  groesse.observe(container);

  return {
    setze,
    punkt(gruppe) {
      // Eckpunkte der Teile durchgehen, bis einer frei liegt; am besten einer ohne Nachbarn.
      if (!istWaehlbar(gruppe)) return null;
      const flaeche = canvas.getBoundingClientRect();
      const meshes = teile.filter((teil) => istWaehlbar(teil.gruppe)).map((teil) => teil.mesh);
      const daneben = [
        [0, 0],
        [2, 0],
        [-2, 0],
        [0, 2],
        [0, -2],
      ] as const;
      const ecke = new Vector3();
      let sonst: { x: number; y: number; allein: boolean } | null = null;
      let versuche = 80;
      for (const teil of teile) {
        if (teil.gruppe !== gruppe) continue;
        const ecken = teil.mesh.geometry.getAttribute('position');
        const schritt = Math.max(1, Math.floor(ecken.count / 120));
        for (let i = 0; i < ecken.count && versuche > 0; i += schritt) {
          ecke.fromBufferAttribute(ecken, i).applyMatrix4(teil.mesh.matrixWorld);
          const ort = imFenster(ecke);
          // Ein Tipp kommt auf ganzen Bildpunkten an und nie genau: Auch knapp daneben muss er treffen.
          const [x, y] = [Math.round(ort.x), Math.round(ort.y)];
          if (!ort.sichtbar || getroffen(x, y, flaeche, meshes) !== gruppe) continue;
          versuche -= 1;
          const umher = daneben.map(([dx, dy]) => unterDemFinger(x + dx, y + dy));
          if (umher.some((gruppen) => gruppen[0] !== gruppe)) continue;
          if (umher.every((gruppen) => gruppen.length === 1)) return { x, y, allein: true };
          sonst ??= { x, y, allein: false };
        }
      }
      return sonst;
    },
    dispose() {
      groesse.disconnect();
      canvas.removeEventListener('pointerdown', druecken);
      canvas.removeEventListener('pointerup', loslassen);
      // Die Ansicht gibt beim Verlassen frei, was am Teil hängt: also wieder das Original.
      for (const teil of teile) teil.mesh.material = teil.original;
      if (schatten) schatten.visible = true;
      for (const material of [...geister.values(), ...getoente.values()]) material.dispose();
    },
  };
}
