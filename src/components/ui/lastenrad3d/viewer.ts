// Own Motion Lastenrad: 3D-Ansicht zum Drehen. Gezeichnet wird nur, wenn sich das Bild ändert
// (Drehen, Größenänderung, laufende Drehscheibe); außerhalb des sichtbaren Bereichs ruht die Ansicht.
// Der Schatten wird einmal berechnet, weil Rad und Licht stillstehen.

import {
  Box3,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  ShadowMaterial,
  Sphere,
  Vector3,
  WebGLRenderer,
  type Group,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildLastenrad, disposeLastenrad } from './build';

const BILDWINKEL = 30; // in Grad; kleiner = weniger Weitwinkel-Verzerrung
const LUFT = 1.06; // Rand um das Rad; 1 = randvoll
const TIEFER = 0.13; // Blickpunkt um diesen Anteil der Höhe unter der Mitte: Platz für den Schatten
const BLICK = [1, 0.55, 1.25] as const; // Startansicht: von vorn rechts, leicht von oben
const LICHT = [4, 7, 5] as const; // Richtung, aus der das Hauptlicht kommt
const SCHATTEN_ABSTAND = 0.006; // Meter, ab denen ein Teil auf das dahinterliegende Schatten wirft (verhindert Flimmern)

export interface MountOptions {
  /** Langsame Drehscheibe bis zur ersten Berührung; entfällt bei „Bewegung reduzieren“. */
  autoRotate?: boolean | undefined;
  /** false in scrollenden Seiten: Mausrad und senkrechtes Wischen scrollen die Seite, gedreht wird waagerecht. */
  zoom?: boolean | undefined;
  /** Teile je Material zusammenfassen (wenige Zeichenaufrufe). */
  merge?: boolean | undefined;
  /** Andere Adresse für die Wortmarke. */
  logoUrl?: string | undefined;
  /** Beschreibung für Screenreader. */
  label?: string | undefined;
  /** Nur nötig, wenn Werkzeuge das Bild aus dem Canvas auslesen. */
  preserveDrawingBuffer?: boolean | undefined;
}

export interface LastenradAnsicht {
  canvas: HTMLCanvasElement;
  model: Group;
  camera: PerspectiveCamera;
  controls: OrbitControls;
  /** Neu zeichnen, falls Kamera oder Modell von außen verändert wurden. */
  render: () => void;
  /** Hängt die Zeichenfläche samt Kamera in eine andere Bühne. */
  umziehen: (container: HTMLElement) => void;
  /** Hält alles an und gibt Speicher und Grafikkontext frei. */
  dispose: () => void;
}

/** Setzt die 3D-Ansicht in einen Container mit fester Höhe; die Ansicht füllt ihn aus. */
export async function mountLastenrad(
  container: HTMLElement,
  {
    autoRotate = true,
    zoom = true,
    merge = true,
    logoUrl,
    label = '3D-Modell des Own Motion Lastenrads',
    preserveDrawingBuffer = false,
  }: MountOptions = {},
): Promise<LastenradAnsicht> {
  const renderer = new WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.autoUpdate = false;
  const canvas = renderer.domElement;
  canvas.style.cssText = 'display:block;width:100%;height:100%;outline:none';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', label);

  let model: Group;
  try {
    model = await buildLastenrad({ logoUrl, merge });
  } catch (fehler) {
    renderer.dispose();
    throw fehler;
  }
  model.traverse((o) => {
    if ((o as Partial<Mesh>).isMesh) o.castShadow = o.receiveShadow = true;
  });
  const box = new Box3().setFromObject(model, true);
  const kugel = box.getBoundingSphere(new Sphere());

  /* Licht: weiches Himmelslicht, ein Hauptlicht mit Schatten, eine schwache Aufhellung von hinten.
     Die Schattenkamera umschließt genau das Rad: so wird die Schattenkarte voll ausgenutzt. */
  const scene = new Scene();
  scene.add(model, new HemisphereLight(0xffffff, 0xd8d2c4, 1.0));
  const aufhellung = new DirectionalLight(0xfff4e6, 0.5);
  aufhellung.position.set(-5, 3, -4);
  const licht = new DirectionalLight(0xffffff, 2.2);
  licht.position.copy(kugel.center).add(new Vector3(...LICHT));
  licht.target.position.copy(kugel.center);
  licht.castShadow = true;
  licht.shadow.mapSize.set(2048, 2048);
  const r = kugel.radius * 1.03,
    weite = licht.position.distanceTo(kugel.center);
  Object.assign(licht.shadow.camera, {
    left: -r,
    right: r,
    top: r,
    bottom: -r,
    near: weite - r,
    far: weite + 2 * r,
  });
  licht.shadow.camera.updateProjectionMatrix();
  licht.shadow.bias = -SCHATTEN_ABSTAND / (3 * r);
  scene.add(aufhellung, licht, licht.target);

  // Unsichtbarer Boden, der nur den Schatten zeigt; nur so groß, wie der Schatten reicht
  const boden = new Mesh(
    new PlaneGeometry(4 * kugel.radius, 4 * kugel.radius),
    new ShadowMaterial({ opacity: 0.18 }),
  );
  boden.rotation.x = -Math.PI / 2;
  boden.position.set(kugel.center.x, box.min.y, kugel.center.z);
  boden.receiveShadow = true;
  scene.add(boden);

  /* Kamera und Bedienung */
  const ziel = box.getCenter(new Vector3());
  ziel.y -= TIEFER * (box.max.y - box.min.y);
  const ecken = [0, 1, 2, 3, 4, 5, 6, 7].map((i) =>
    new Vector3(
      i & 1 ? box.max.x : box.min.x,
      i & 2 ? box.max.y : box.min.y,
      i & 4 ? box.max.z : box.min.z,
    ).sub(ziel),
  );
  const camera = new PerspectiveCamera(BILDWINKEL, 1, 0.05, 100);
  camera.position.copy(ziel).add(new Vector3(...BLICK));
  const controls = new OrbitControls(camera, canvas);
  controls.target.copy(ziel);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enableZoom = controls.enablePan = zoom;
  controls.minDistance = 0.6;
  controls.autoRotate = autoRotate && !matchMedia('(prefers-reduced-motion: reduce)').matches;
  controls.autoRotateSpeed = 1.2;
  canvas.style.touchAction = zoom ? 'none' : 'pan-y';

  // Kameraabstand so wählen, dass das Rad über die ganze Drehung gerade ins Bild passt, auch im Hochformat
  function rahmen() {
    const blick = camera.position.clone().sub(controls.target);
    const se = blick.y / blick.length(),
      ce = Math.sqrt(1 - se * se);
    const tanV = Math.tan((BILDWINKEL * Math.PI) / 360),
      tanH = tanV * camera.aspect;
    let abstand = 0;
    for (let k = 0; k < 48; k++) {
      const a = (k / 48) * Math.PI * 2,
        ca = Math.cos(a),
        sa = Math.sin(a);
      for (const e of ecken) {
        const quer = e.z * ca - e.x * sa,
          laengs = e.x * ca + e.z * sa;
        const hoch = e.y * ce - laengs * se,
          tief = laengs * ce + e.y * se;
        abstand = Math.max(abstand, Math.abs(quer) / tanH + tief, Math.abs(hoch) / tanV + tief);
      }
    }
    controls.maxDistance = abstand * LUFT * 3;
    camera.position.copy(ziel).add(blick.setLength(abstand * LUFT));
  }

  /* Zeichnen nur bei Bedarf */
  let bild = 0,
    zuletzt = 0,
    sichtbar = true,
    selbstBedient = false;
  function zeichne(zeit = performance.now()) {
    bild = 0;
    controls.update(Math.min((zeit - zuletzt) / 1000, 0.1)); // meldet weitere Bewegung selbst über „change"
    zuletzt = zeit;
    renderer.render(scene, camera);
  }
  const anfordern = () => {
    if (!bild && sichtbar) bild = requestAnimationFrame(zeichne);
  };
  controls.addEventListener('change', anfordern);
  controls.addEventListener('start', () => {
    controls.autoRotate = false;
    selbstBedient = true;
  });

  // Größe folgt dem Container; neu gerahmt wird, bis jemand selbst dreht oder zoomt
  let ort = container;
  const groesse = new ResizeObserver(() => {
    const w = ort.clientWidth,
      h = ort.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (!selbstBedient) rahmen();
    cancelAnimationFrame(bild);
    zeichne(); // sofort, damit beim Ziehen nichts flackert
  });
  const blickfeld = new IntersectionObserver(([e]) => {
    sichtbar = e!.isIntersecting;
    anfordern();
  });
  const wiederDa = () => {
    renderer.shadowMap.needsUpdate = true;
    anfordern();
  };
  canvas.addEventListener('webglcontextrestored', wiederDa);

  renderer.shadowMap.needsUpdate = true;
  ort.appendChild(canvas);
  groesse.observe(ort);
  blickfeld.observe(ort);

  return {
    canvas,
    model,
    camera,
    controls,
    /** Neu zeichnen, falls Kamera oder Modell von außen verändert wurden. */
    render: anfordern,
    umziehen(neu) {
      groesse.unobserve(ort);
      blickfeld.unobserve(ort);
      ort = neu;
      ort.appendChild(canvas);
      groesse.observe(ort);
      blickfeld.observe(ort);
    },
    /** Hält alles an und gibt Speicher und Grafikkontext frei. */
    dispose() {
      sichtbar = false;
      cancelAnimationFrame(bild);
      groesse.disconnect();
      blickfeld.disconnect();
      canvas.removeEventListener('webglcontextrestored', wiederDa);
      controls.dispose();
      disposeLastenrad(model);
      boden.geometry.dispose();
      boden.material.dispose();
      licht.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}
