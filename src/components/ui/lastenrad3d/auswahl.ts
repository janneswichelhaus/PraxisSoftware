// Auswahl am 3D-Rad: Ein Tipp meldet die Gruppen unter dem Finger, die getroffene zuerst. Wählbare
// Gruppen leuchten grün und pulsieren, die Kamera fliegt zu ihnen; markierte tragen die Farbe ihrer
// Bedeutung. Die Ansicht selbst bleibt unverändert; dieses Modul arbeitet nur mit dem, was sie herausgibt.

import {
  Box3,
  Color,
  MathUtils,
  Raycaster,
  SRGBColorSpace,
  Spherical,
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
const KLEINSTER_AUSSCHNITT = 0.24; // Meter; ein kleines Teil zeigt noch, wo am Rad es sitzt
const LUFT = 1.08;
const BLICK = [1, 0.55, 1.25] as const; // das ganze Rad: von vorn rechts, leicht von oben
const BLICK_MEHRERE = [20, 80] as const; // Grad (θ, φ), wenn die Blicke der Gruppen sich aufheben
const FLUG = 700; // Millisekunden
const LEUCHTEN = 0x1f9d63; // wie im ersten Entwurf des Rads (FLT-003)
const PULS = [0.42, 0.72] as const; // Leuchtstärke zwischen diesen Werten; ruhig in der Mitte

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
  /** Nur diese Gruppen sind wählbar, sie leuchten und die Kamera zeigt sie; `null` heißt alle. */
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
  /** Die Bühne ist umgezogen, etwa auf die nächste Seite eines geführten Ablaufs. */
  umziehen: (container: HTMLElement) => void;
  dispose: () => void;
}

/** Blick auf eine Gruppe: θ um die Hochachse ab der rechten Seite, φ ab der Senkrechten, in Grad. */
export type Blick = readonly [theta: number, phi: number];

function richtung([theta, phi]: Blick): Vector3 {
  const [t, p] = [MathUtils.degToRad(theta), MathUtils.degToRad(phi)];
  return new Vector3(Math.sin(p) * Math.sin(t), Math.cos(p), Math.sin(p) * Math.cos(t));
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
  blickVon: (gruppe: string) => Blick | null = () => null,
): Auswahl {
  const { canvas, camera, controls, model } = ansicht;
  model.updateMatrixWorld(true);
  const ruhig = matchMedia('(prefers-reduced-motion: reduce)').matches;

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
  // Je Material eine leuchtende Fassung: Das Modell teilt Materialien über viele Teile.
  const leuchtende = new Map<MeshStandardMaterial, MeshStandardMaterial>();
  const leuchtend = (original: MeshStandardMaterial) => {
    let material = leuchtende.get(original);
    if (!material) {
      material = original.clone();
      material.emissive.setHex(LEUCHTEN);
      material.emissiveIntensity = ruhig ? (PULS[0] + PULS[1]) / 2 : PULS[0];
      leuchtende.set(original, material);
    }
    return material;
  };
  const getoente = new Map<string, MeshStandardMaterial>();
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

  // Die Kamera zeigt die wählbaren Teile groß aus dem Blick ihrer Gruppen, das ganze Rad eng
  // eingepasst von vorn rechts. Abstand aus den Ecken des Kastens, quer und hoch im Bild.
  function zielDerKamera(): { position: Vector3; ziel: Vector3 } | null {
    const kasten = new Box3();
    for (const teil of teile) {
      if (stand.waehlbar === null || istWaehlbar(teil.gruppe)) kasten.union(teil.kasten);
    }
    if (kasten.isEmpty()) return null;
    const mitte = kasten.getCenter(new Vector3());
    const halb = kasten.getSize(new Vector3()).multiplyScalar(0.5);
    let blick = new Vector3(...BLICK).normalize();
    if (stand.waehlbar !== null) {
      halb.max(new Vector3(KLEINSTER_AUSSCHNITT, KLEINSTER_AUSSCHNITT, KLEINSTER_AUSSCHNITT));
      const summe = new Vector3();
      for (const gruppe of stand.waehlbar) {
        const eigener = blickVon(gruppe);
        if (eigener) summe.add(richtung(eigener));
      }
      blick = summe.length() > 0.3 ? summe.normalize() : richtung(BLICK_MEHRERE);
    }
    const quer = new Vector3().crossVectors(new Vector3(0, 1, 0), blick).normalize();
    const auf = new Vector3().crossVectors(blick, quer);
    const tanHoch = Math.tan((camera.fov * Math.PI) / 360);
    const tanQuer = tanHoch * camera.aspect;
    let abstand = controls.minDistance;
    const ecke = new Vector3();
    for (let i = 0; i < 8; i += 1) {
      ecke.set(i & 1 ? halb.x : -halb.x, i & 2 ? halb.y : -halb.y, i & 4 ? halb.z : -halb.z);
      const tief = ecke.dot(blick);
      abstand = Math.max(
        abstand,
        Math.abs(ecke.dot(quer)) / tanQuer + tief,
        Math.abs(ecke.dot(auf)) / tanHoch + tief,
      );
    }
    return { position: mitte.clone().addScaledVector(blick, abstand * LUFT), ziel: mitte };
  }

  // Geflogen wird auf der Kugel um das Ziel, nicht geradeaus: So geht die Kamera nie durchs Rad.
  let flug: { start: number; von: Spherical; nach: Spherical; ab: Vector3; bis: Vector3 } | null =
    null;
  let flugBild = 0;
  const kugel = (position: Vector3, ziel: Vector3) =>
    new Spherical().setFromVector3(position.clone().sub(ziel));
  function fliege(sofort: boolean) {
    const nach = zielDerKamera();
    if (!nach) return;
    if (sofort || ruhig) {
      flug = null;
      controls.target.copy(nach.ziel);
      camera.position.copy(nach.position);
      ansicht.render();
      return;
    }
    const von = kugel(camera.position, controls.target);
    const ziel = kugel(nach.position, nach.ziel);
    // Der kürzere Weg um die Hochachse.
    ziel.theta =
      von.theta +
      MathUtils.euclideanModulo(ziel.theta - von.theta + Math.PI, 2 * Math.PI) -
      Math.PI;
    flug = {
      start: performance.now(),
      von,
      nach: ziel,
      ab: controls.target.clone(),
      bis: nach.ziel,
    };
    flugBild ||= requestAnimationFrame(fliegen);
  }
  const zwischen = new Spherical();
  function fliegen(jetzt: number) {
    flugBild = 0;
    if (!flug) return;
    const k = MathUtils.clamp((jetzt - flug.start) / FLUG, 0, 1);
    const e = k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2;
    zwischen.set(
      MathUtils.lerp(flug.von.radius, flug.nach.radius, e),
      MathUtils.lerp(flug.von.phi, flug.nach.phi, e),
      MathUtils.lerp(flug.von.theta, flug.nach.theta, e),
    );
    controls.target.lerpVectors(flug.ab, flug.bis, e);
    camera.position.setFromSpherical(zwischen).add(controls.target);
    ansicht.render();
    if (k < 1) flugBild = requestAnimationFrame(fliegen);
    else flug = null;
  }

  // Was leuchtet, pulsiert, solange es leuchtet; bei „Bewegung reduzieren“ ruhig.
  let leuchtet = false;
  let pulsBild = 0;
  function pulsiere(jetzt: number) {
    pulsBild = 0;
    if (!leuchtet) return;
    const staerke = PULS[0] + (PULS[1] - PULS[0]) * (0.5 + 0.5 * Math.sin(jetzt / 260));
    for (const material of leuchtende.values()) material.emissiveIntensity = staerke;
    ansicht.render();
    pulsBild = requestAnimationFrame(pulsiere);
  }

  let erstesMal = true;
  function setze(neu: Auswahlstand) {
    stand = neu;
    const farben = new Map(neu.marken.map((marke) => [marke.gruppe, marke.farbe]));
    leuchtet = false;
    for (const teil of teile) {
      const farbe = teil.gruppe === null ? undefined : farben.get(teil.gruppe);
      // Was ein Bild trägt, ist die Wortmarke: Sie wird weder umgefärbt noch beleuchtet.
      if (teil.original.map) teil.mesh.material = teil.original;
      else if (farbe !== undefined) teil.mesh.material = getoent(teil.original, farbe);
      else if (neu.waehlbar !== null && istWaehlbar(teil.gruppe)) {
        teil.mesh.material = leuchtend(teil.original);
        leuchtet = true;
      } else teil.mesh.material = teil.original;
    }
    if (leuchtet && !ruhig) pulsBild ||= requestAnimationFrame(pulsiere);
    selbstGedreht = false;
    // Beim ersten Mal steht die Kamera noch nirgends: Von dort wäre der Flug ein Sprung.
    fliege(erstesMal);
    erstesMal = false;
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
    flug = null;
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

  // Nach der Ansicht angemeldet, läuft also nach ihr: Sie rahmt das ganze Rad für die Drehscheibe,
  // dies passt es ein. Ein laufender Flug nimmt das neue Ziel mit.
  let ort = container;
  const groesse = new ResizeObserver(() => {
    if (selbstGedreht) return;
    fliege(flug === null);
  });
  groesse.observe(ort);

  return {
    setze,
    umziehen(neu) {
      groesse.unobserve(ort);
      ort = neu;
      groesse.observe(ort);
    },
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
      leuchtet = false;
      flug = null;
      cancelAnimationFrame(pulsBild);
      cancelAnimationFrame(flugBild);
      canvas.removeEventListener('pointerdown', druecken);
      canvas.removeEventListener('pointerup', loslassen);
      // Die Ansicht gibt beim Verlassen frei, was am Teil hängt: also wieder das Original.
      for (const teil of teile) teil.mesh.material = teil.original;
      for (const material of [...leuchtende.values(), ...getoente.values()]) material.dispose();
    },
  };
}
