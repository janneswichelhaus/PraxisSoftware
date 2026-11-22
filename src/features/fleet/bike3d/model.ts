import {
  BackSide,
  Box3,
  CanvasTexture,
  DoubleSide,
  Float32BufferAttribute,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  PMREMGenerator,
  Scene,
  SphereGeometry,
  Vector3,
  type BufferGeometry,
  type Group,
  type MeshStandardMaterial,
  type Texture,
  type WebGLRenderer,
} from 'three';
import { buildLastenrad, disposeLastenrad } from './lastenrad-build';

/**
 * Dünne Anpassung des Modells aus dem Entwurf (Übergabe Lastenrad 2) an die Ansicht: Bauteile,
 * Materialien je Bauteil und Trefferflächen kommen aus `lastenrad-build.ts`. Hier werden sie nur
 * nach Bauteil gesammelt, wie die Ansicht sie erwartet.
 */

/**
 * Die Wortmarke auf der Box, aus `public/marke/` (byte-gleich mit `marke/logo/`). Die Box ist
 * Papier: Die farbige Fassung, nicht die des alten tiefgrünen Aufklebers (ANN-871).
 */
export const WORTMARKE_URL = '/marke/own-motion-block-unterzeile-farbig.svg';

/** Ein Bauteil im Modell: seine Flächen und Materialien, Mitte und Umriss. */
export interface ZoneParts {
  meshes: Mesh[];
  /** Die sichtbaren Materialien; jedes gehört nur diesem Bauteil. */
  materials: MeshStandardMaterial[];
  center: Vector3;
  box: Box3;
  /** Wo eine Nadel ohne Punkt sitzt: auf der Fläche, nicht in der Mitte eines Rings (Reifen). */
  anker: Vector3;
}

export interface CargoBike {
  root: Group;
  zones: Record<string, ZoneParts>;
}

type Teil = Mesh<BufferGeometry, MeshStandardMaterial>;

/** Baut das Rad; asynchron, weil das Modell die Wortmarke lädt. */
export async function buildCargoBike({
  logoUrl = WORTMARKE_URL,
}: { logoUrl?: string } = {}): Promise<CargoBike> {
  const root = await buildLastenrad({ bauteile: true, merge: true, logoUrl });
  root.updateMatrixWorld(true);
  const zones: Record<string, ZoneParts> = {};
  root.traverse((o) => {
    if (!(o as Partial<Mesh>).isMesh) return;
    const mesh = o as Teil;
    const zone = mesh.userData.zone as string | undefined;
    if (!zone) return;
    const eintrag = (zones[zone] ??= {
      meshes: [],
      materials: [],
      center: new Vector3(),
      box: new Box3(),
      anker: new Vector3(),
    });
    eintrag.meshes.push(mesh);
    // Trefferflächen zählen beim Umriss mit, nicht beim Leuchten.
    eintrag.box.expandByObject(mesh, true);
    if (!mesh.userData.trefferflaeche && !eintrag.materials.includes(mesh.material)) {
      mesh.material.userData.baseEmissive = mesh.material.emissive.clone();
      mesh.material.userData.baseEmissiveIntensity = mesh.material.emissiveIntensity;
      eintrag.materials.push(mesh.material);
    }
  });
  const ecke = new Vector3();
  for (const eintrag of Object.values(zones)) {
    eintrag.box.getCenter(eintrag.center);
    eintrag.anker.copy(eintrag.center);
    let naehe = Infinity;
    for (const mesh of eintrag.meshes) {
      if (mesh.userData.trefferflaeche) continue;
      const ecken = mesh.geometry.getAttribute('position');
      for (let i = 0; i < ecken.count; i += 1) {
        ecke.fromBufferAttribute(ecken, i).applyMatrix4(mesh.matrixWorld);
        const abstand = ecke.distanceToSquared(eintrag.center);
        if (abstand < naehe) {
          naehe = abstand;
          eintrag.anker.copy(ecke);
        }
      }
    }
  }
  return { root, zones };
}

/** Gibt Geometrien, Materialien und die Textur der Wortmarke frei. */
export function disposeCargoBike(bike: CargoBike): void {
  disposeLastenrad(bike.root);
}

/** Sanftes Studiolicht als Umgebung (für Glanz an Metallteilen). */
export function makeStudioEnvironment(renderer: WebGLRenderer): Texture {
  const scene = new Scene();
  const geo = new SphereGeometry(10, 32, 16);
  const col: number[] = [];
  const pos = geo.attributes.position!;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 10;
    const v = y > 0 ? 0.92 + 0.08 * y : 0.78 + 0.14 * (1 + y);
    col.push(v, v, v);
  }
  geo.setAttribute('color', new Float32BufferAttribute(col, 3));
  scene.add(new Mesh(geo, new MeshBasicMaterial({ vertexColors: true, side: BackSide })));
  function softbox(w: number, h: number, p: Vector3, intensity: number) {
    const m = new Mesh(new PlaneGeometry(w, h), new MeshBasicMaterial({ side: DoubleSide }));
    m.material.color.setScalar(intensity);
    m.position.copy(p);
    m.lookAt(0, 0, 0);
    scene.add(m);
  }
  softbox(6, 3, new Vector3(3, 6, 4), 3);
  softbox(4, 4, new Vector3(-6, 3, -2), 1.6);
  softbox(5, 2, new Vector3(0, 4, -6), 1.4);
  const pm = new PMREMGenerator(renderer);
  const env = pm.fromScene(scene, 0.04).texture;
  pm.dispose();
  scene.traverse((o) => {
    if (o instanceof Mesh) {
      const mesh = o as Mesh<BufferGeometry, MeshBasicMaterial>;
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
  });
  return env;
}

/** Weicher Boden unter dem Rad. */
export function makeFloor(): Mesh {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const g = c.getContext('2d');
  if (g) {
    const grd = g.createRadialGradient(256, 256, 4, 256, 256, 252);
    grd.addColorStop(0, 'rgba(20,24,27,0.13)');
    grd.addColorStop(0.5, 'rgba(20,24,27,0.06)');
    grd.addColorStop(1, 'rgba(20,24,27,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 512, 512);
  }
  const tex = new CanvasTexture(c);
  const m = new Mesh(
    new PlaneGeometry(3.3, 1.3),
    new MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.set(0.0, 0.0005, 0);
  m.renderOrder = -1;
  return m;
}
