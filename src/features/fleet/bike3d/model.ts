import {
  BackSide,
  Box3,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  PMREMGenerator,
  Quaternion,
  RingGeometry,
  Scene,
  Shape,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
  TubeGeometry,
  Vector3,
  type MeshStandardMaterialParameters,
  type Texture,
  type WebGLRenderer,
} from 'three';

/**
 * Das Lastenrad als 3D-Modell: Bauart Load 60 mit Riemenantrieb und
 * Nabenschaltung, mit Transportbox (Handoff Lastenrad 3D, Abschnitt 5).
 *
 * Portiert aus `docs/design/lastenrad-3d/kanvas/Lastenrad3D.dc.html`
 * (`buildCargoBike`, three.js r149) auf three.js 0.186: Farbräume statt
 * `encoding`, sonst unverändert - die Maße sind die des Entwurfs, damit
 * Punkte in Modellkoordinaten (ANN-550) an derselben Stelle bleiben.
 *
 * Einheiten in Metern. x zeigt nach vorn (Vorderrad), y nach oben, z nach
 * rechts (Antriebsseite). Boden bei y = 0.
 */

/**
 * Die Wortmarke auf dem Aufkleber kommt aus `public/marke/` (byte-gleich mit
 * `marke/logo/`, `src/marke.test.ts`) - keine zweite Fassung im Code.
 */
export const STICKER_LOGO_URL = '/marke/own-motion-block-unterzeile-papier.svg';

/** Seitenverhältnis der Wortmarke mit Unterzeile (viewBox der SVG-Datei). */
const LOGO_ASPECT = 5330.93 / 2492.83;

/**
 * Aufkleber nach `marke/README.md`: Tiefgrün, 40 × 17 cm, Eckradius 16 (bei
 * 800 × 340), Block mit Unterzeile in Papier, 230 von 340 hoch. Ohne geladene
 * Wortmarke bleibt die Fläche leer; `drawStickerLogo` zeichnet sie nach.
 */
export function makeStickerCanvas(): HTMLCanvasElement {
  const k = 2;
  const w = 800 * k;
  const h = 340 * k;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d');
  if (!g) return canvas;
  const r = 16 * k;
  g.clearRect(0, 0, w, h);
  g.fillStyle = '#042c1b';
  g.beginPath();
  g.moveTo(r, 0);
  g.lineTo(w - r, 0);
  g.quadraticCurveTo(w, 0, w, r);
  g.lineTo(w, h - r);
  g.quadraticCurveTo(w, h, w - r, h);
  g.lineTo(r, h);
  g.quadraticCurveTo(0, h, 0, h - r);
  g.lineTo(0, r);
  g.quadraticCurveTo(0, 0, r, 0);
  g.closePath();
  g.fill();
  return canvas;
}

export function drawStickerLogo(canvas: HTMLCanvasElement, logo: HTMLImageElement): void {
  const g = canvas.getContext('2d');
  if (!g) return;
  const logoH = (230 / 340) * canvas.height;
  const logoW = logoH * LOGO_ASPECT;
  g.drawImage(logo, (canvas.width - logoW) / 2, (canvas.height - logoH) / 2, logoW, logoH);
}

type Point2 = readonly [number, number];

/**
 * Riemenverlauf um zwei Scheiben (außen herum, gegen den Uhrzeigersinn): oben
 * nach hinten, um die hintere Scheibe, unten nach vorn, um die vordere.
 */
function beltLoop(c1: Vector3, r1: number, c2: Vector3, r2: number): Point2[] {
  const dx = c2.x - c1.x;
  const dy = c2.y - c1.y;
  const d = Math.hypot(dx, dy);
  const base = Math.atan2(dy, dx);
  const a = Math.acos((r1 - r2) / d);
  const top = base - a;
  const bot = base + a;
  const pts: Point2[] = [];
  function line(p: Point2, q: Point2, n: number) {
    for (let i = 0; i < n; i++) {
      const t = i / n;
      pts.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
    }
  }
  function arc(c: Vector3, r: number, from: number, to: number, n: number) {
    for (let i = 0; i < n; i++) {
      const t = from + ((to - from) * i) / n;
      pts.push([c.x + Math.cos(t) * r, c.y + Math.sin(t) * r]);
    }
  }
  const t1top: Point2 = [c1.x + Math.cos(top) * r1, c1.y + Math.sin(top) * r1];
  const t2top: Point2 = [c2.x + Math.cos(top) * r2, c2.y + Math.sin(top) * r2];
  const t2bot: Point2 = [c2.x + Math.cos(bot) * r2, c2.y + Math.sin(bot) * r2];
  const t1bot: Point2 = [c1.x + Math.cos(bot) * r1, c1.y + Math.sin(bot) * r1];
  line(t1top, t2top, 24);
  arc(c2, r2, top, bot, 28);
  line(t2bot, t1bot, 24);
  arc(c1, r1, bot, top + 2 * Math.PI, 40);
  return pts;
}

/** Flacher Riemen: rechteckiger Querschnitt entlang einer geschlossenen Linie. */
function beltGeometry(pts: readonly Point2[], z: number, w: number, th: number): BufferGeometry {
  const n = pts.length;
  const normals: Point2[] = [];
  for (let i = 0; i < n; i++) {
    const a = pts[(i - 1 + n) % n]!;
    const b = pts[(i + 1) % n]!;
    const tx = b[0] - a[0];
    const ty = b[1] - a[1];
    const l = Math.hypot(tx, ty) || 1;
    normals.push([ty / l, -tx / l]);
  }
  const h = th / 2;
  const sides: readonly [Point2, Point2, 'out' | 'in' | 'r' | 'l'][] = [
    [[h, -w / 2], [h, w / 2], 'out'],
    [[-h, w / 2], [-h, -w / 2], 'in'],
    [[h, w / 2], [-h, w / 2], 'r'],
    [[-h, -w / 2], [h, -w / 2], 'l'],
  ];
  const pos: number[] = [];
  const nor: number[] = [];
  const idx: number[] = [];
  for (const [first, second, kind] of sides) {
    const start = pos.length / 3;
    for (let i = 0; i < n; i++) {
      const p = pts[i]!;
      const nn = normals[i]!;
      for (const c of [first, second]) {
        pos.push(p[0] + nn[0] * c[0], p[1] + nn[1] * c[0], z + c[1]);
        if (kind === 'out') nor.push(nn[0], nn[1], 0);
        else if (kind === 'in') nor.push(-nn[0], -nn[1], 0);
        else if (kind === 'r') nor.push(0, 0, 1);
        else nor.push(0, 0, -1);
      }
    }
    for (let j = 0; j < n; j++) {
      const k = (j + 1) % n;
      const a0 = start + j * 2;
      const a1 = start + j * 2 + 1;
      const b0 = start + k * 2;
      const b1 = start + k * 2 + 1;
      idx.push(a0, a1, b1, a0, b1, b0);
    }
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new Float32BufferAttribute(nor, 3));
  geo.setIndex(idx);
  return geo;
}

/** Ein Bauteil im Modell: seine Flächen und Materialien, Mitte und Umriss. */
export interface ZoneParts {
  meshes: Mesh[];
  materials: MeshStandardMaterial[];
  center: Vector3;
  box: Box3;
}

export interface CargoBike {
  root: Group;
  zones: Record<string, ZoneParts>;
  sticker: CanvasTexture;
  stickerCanvas: HTMLCanvasElement;
}

type MaterialKey =
  | 'frame'
  | 'black'
  | 'satin'
  | 'rubber'
  | 'plastic'
  | 'belt'
  | 'saddle'
  | 'steel'
  | 'white'
  | 'edge'
  | 'reflex'
  | 'chrome'
  | 'lensFront'
  | 'lensRear'
  | 'led'
  | 'screen'
  | 'sticker';

export function buildCargoBike({ anisotropy = 4 }: { anisotropy?: number } = {}): CargoBike {
  const root = new Group();
  const zones: Record<string, { meshes: Mesh[]; materials: MeshStandardMaterial[] }> = {};
  const UP = new Vector3(0, 1, 0);
  const ZAX = new Vector3(0, 0, 1);
  const V = (x: number, y: number, z = 0) => new Vector3(x, y, z);

  const stickerCanvas = makeStickerCanvas();
  const stickerTex = new CanvasTexture(stickerCanvas);
  stickerTex.colorSpace = SRGBColorSpace;
  stickerTex.anisotropy = anisotropy;

  const base: Record<MaterialKey, MeshStandardMaterialParameters> = {
    frame: { color: 0x3a4046, roughness: 0.46, metalness: 0.45 },
    black: { color: 0x1d1f21, roughness: 0.5, metalness: 0.3 },
    satin: { color: 0x26292c, roughness: 0.38, metalness: 0.55 },
    rubber: { color: 0x19191a, roughness: 0.92, metalness: 0 },
    plastic: { color: 0x1c1e20, roughness: 0.78, metalness: 0, envMapIntensity: 0.6 },
    belt: { color: 0x141516, roughness: 0.62, metalness: 0.1, side: DoubleSide },
    saddle: { color: 0x212325, roughness: 0.72, metalness: 0.05 },
    steel: { color: 0xb9bec3, roughness: 0.28, metalness: 0.95 },
    white: { color: 0xf4f5f2, roughness: 0.62, metalness: 0 },
    edge: { color: 0x1f2123, roughness: 0.42, metalness: 0.4 },
    reflex: { color: 0xc9cdd1, roughness: 0.45, metalness: 0.25 },
    chrome: { color: 0xdfe3e6, roughness: 0.16, metalness: 1 },
    lensFront: {
      color: 0xfff8e6,
      roughness: 0.15,
      metalness: 0,
      emissive: 0xfff1c2,
      emissiveIntensity: 0.6,
    },
    lensRear: {
      color: 0xa8231b,
      roughness: 0.3,
      metalness: 0,
      emissive: 0xff2a14,
      emissiveIntensity: 0.6,
    },
    led: {
      color: 0x2f8f5c,
      roughness: 0.3,
      metalness: 0,
      emissive: 0x39c27a,
      emissiveIntensity: 0.9,
    },
    screen: { color: 0x0d1012, roughness: 0.12, metalness: 0.3 },
    sticker: {
      map: stickerTex,
      roughness: 0.75,
      metalness: 0,
      envMapIntensity: 0.25,
      alphaTest: 0.5,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    },
  };
  const matCache = new Map<string, MeshStandardMaterial>();
  function zoneEntry(zone: string) {
    zones[zone] ??= { meshes: [], materials: [] };
    return zones[zone];
  }
  function mat(zone: string, key: MaterialKey): MeshStandardMaterial {
    const id = `${zone}|${key}`;
    let material = matCache.get(id);
    if (!material) {
      material = new MeshStandardMaterial(base[key]);
      material.userData.baseEmissive = material.emissive.clone();
      material.userData.baseEmissiveIntensity = material.emissiveIntensity;
      matCache.set(id, material);
      zoneEntry(zone).materials.push(material);
    }
    return material;
  }
  function add(
    zone: string,
    geo: BufferGeometry,
    key: MaterialKey,
    pos?: Vector3,
    rot?: readonly [number, number, number],
  ): Mesh {
    const mesh = new Mesh(geo, mat(zone, key));
    if (pos) mesh.position.copy(pos);
    if (rot) mesh.rotation.set(rot[0], rot[1], rot[2]);
    mesh.userData.zone = zone;
    zoneEntry(zone).meshes.push(mesh);
    root.add(mesh);
    return mesh;
  }
  function joint(zone: string, p: Vector3, r: number, key: MaterialKey) {
    return add(zone, new SphereGeometry(r, 14, 10), key, p);
  }
  function rod(
    zone: string,
    a: Vector3,
    b: Vector3,
    r: number,
    key: MaterialKey,
    caps = false,
    r2?: number,
  ): Mesh {
    const dir = new Vector3().subVectors(b, a);
    const len = dir.length();
    const geo = new CylinderGeometry(r2 ?? r, r, len, 16, 1, false);
    const mesh = add(zone, geo, key);
    mesh.position.copy(a).addScaledVector(dir, 0.5);
    mesh.quaternion.setFromUnitVectors(UP, dir.normalize());
    if (caps) {
      joint(zone, a, r, key);
      joint(zone, b, r2 ?? r, key);
    }
    return mesh;
  }
  function tube(
    zone: string,
    pts: Vector3[],
    r: number,
    key: MaterialKey,
    closed = false,
    type: 'centripetal' | 'chordal' | 'catmullrom' = 'centripetal',
    segs?: number,
  ): Mesh {
    const curve = new CatmullRomCurve3(pts, closed, type, 0.5);
    const geo = new TubeGeometry(curve, segs ?? Math.max(32, pts.length * 14), r, 12, closed);
    return add(zone, geo, key);
  }
  // Unsichtbare Trefferflächen für dünne Teile (Speichen, Riemen, Hebel): nicht
  // gezeichnet, aber beim Antippen getroffen.
  const proxyMat = new MeshBasicMaterial({ side: DoubleSide });
  function proxy(
    zone: string,
    geo: BufferGeometry,
    pos?: Vector3,
    rot?: readonly [number, number, number],
  ): Mesh {
    const m = new Mesh(geo, proxyMat);
    m.visible = false;
    if (pos) m.position.copy(pos);
    if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
    m.userData.zone = zone;
    m.userData.proxy = true;
    zoneEntry(zone).meshes.push(m);
    root.add(m);
    return m;
  }
  function proxyRod(zone: string, a: Vector3, b: Vector3, r: number) {
    const dir = new Vector3().subVectors(b, a);
    const m = proxy(zone, new CylinderGeometry(r, r, dir.length(), 8));
    m.position.copy(a).addScaledVector(dir, 0.5);
    m.quaternion.setFromUnitVectors(UP, dir.normalize());
    return m;
  }
  function disc(zone: string, c: Vector3, r: number, thick: number, key: MaterialKey, z: number) {
    return add(zone, new CylinderGeometry(r, r, thick, 48), key, V(c.x, c.y, z), [
      Math.PI / 2,
      0,
      0,
    ]);
  }
  function box(
    zone: string,
    size: readonly [number, number, number],
    pos: Vector3,
    key: MaterialKey,
    rotZ?: number,
  ) {
    const m = add(zone, new BoxGeometry(size[0], size[1], size[2]), key, pos);
    if (rotZ) m.rotation.z = rotZ;
    return m;
  }
  function roundedSlab(
    zone: string,
    w: number,
    h: number,
    r: number,
    depth: number,
    bevel: number,
    key: MaterialKey,
    pos: Vector3,
  ) {
    const s = new Shape();
    const x0 = -w / 2;
    const y0 = -h / 2;
    s.moveTo(x0 + r, y0);
    s.lineTo(x0 + w - r, y0);
    s.quadraticCurveTo(x0 + w, y0, x0 + w, y0 + r);
    s.lineTo(x0 + w, y0 + h - r);
    s.quadraticCurveTo(x0 + w, y0 + h, x0 + w - r, y0 + h);
    s.lineTo(x0 + r, y0 + h);
    s.quadraticCurveTo(x0, y0 + h, x0, y0 + h - r);
    s.lineTo(x0, y0 + r);
    s.quadraticCurveTo(x0, y0, x0 + r, y0);
    const geo = new ExtrudeGeometry(s, {
      depth,
      bevelEnabled: true,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: 3,
      curveSegments: 10,
    });
    geo.translate(0, 0, -depth / 2);
    return add(zone, geo, key, pos);
  }
  // Ein Bogenstück (Schutzblech): Mittelpunkt c, Radius r, Breite w, Winkel in
  // Grad von +x gegen den Uhrzeigersinn in der Radebene.
  function arcBand(
    zone: string,
    c: Vector3,
    r: number,
    w: number,
    fromDeg: number,
    toDeg: number,
    key: MaterialKey,
  ) {
    const a0 = ((fromDeg + 90) * Math.PI) / 180;
    const len = ((toDeg - fromDeg) * Math.PI) / 180;
    const geo = new CylinderGeometry(r, r, w, 48, 1, true, a0, len);
    const m = add(zone, geo, key, V(c.x, c.y, 0), [Math.PI / 2, 0, 0]);
    (m.material as MeshStandardMaterial).side = DoubleSide;
    return m;
  }

  // --- Eckpunkte ------------------------------------------------------------
  const RA = V(-0.93, 0.34); // Hinterachse
  const FA = V(0.99, 0.26); // Vorderachse
  const BB = V(-0.27, 0.29); // Tretlager / Motor
  const stBot = V(-0.29, 0.33);
  const stTop = V(-0.56, 0.88);
  const stDir = new Vector3().subVectors(stTop, stBot).normalize();
  function onSeatTube(y: number) {
    const t = (y - stBot.y) / stDir.y;
    return V(stBot.x + stDir.x * t, y);
  }
  const DZ = 0.084; // Ebene von Riemen und Riemenscheiben

  // --- Laufräder --------------------------------------------------------------
  function wheel(suffix: string, c: Vector3, R: number, spokes: number, hubR: number) {
    const t = 0.028;
    const tire = `reifen-${suffix}`;
    const hub = `laufrad-${suffix}`;
    add(tire, new TorusGeometry(R - t, t, 20, 120), 'rubber', c);
    for (const s of [-1, 1]) {
      add(tire, new TorusGeometry(R - t - 0.006, 0.0034, 6, 120), 'reflex', V(c.x, c.y, s * 0.021));
    }
    const rimR = R - 2 * t + 0.004;
    const rim = add(hub, new TorusGeometry(rimR, 0.0115, 10, 120), 'satin', c);
    rim.scale.set(1, 1, 1.45);
    for (const s of [-1, 1]) {
      add(
        hub,
        new CylinderGeometry(hubR + 0.004, hubR + 0.004, 0.004, 28),
        'satin',
        V(c.x, c.y, s * 0.032),
        [Math.PI / 2, 0, 0],
      );
    }
    const geo = new CylinderGeometry(0.0012, 0.0012, 1, 5);
    const inst = new InstancedMesh(geo, mat(hub, 'steel'), spokes);
    const m4 = new Matrix4();
    const q = new Quaternion();
    const sc = new Vector3();
    for (let i = 0; i < spokes; i++) {
      const side = i % 2 ? 1 : -1;
      const a = (i / spokes) * Math.PI * 2;
      const p0 = V(Math.cos(a) * hubR, Math.sin(a) * hubR, side * 0.032);
      const b = a + ((i >> 1) % 2 ? 1 : -1) * 0.5;
      const p1 = V(Math.cos(b) * (rimR - 0.006), Math.sin(b) * (rimR - 0.006), side * 0.003);
      const d = new Vector3().subVectors(p1, p0);
      const L = d.length();
      q.setFromUnitVectors(UP, d.clone().normalize());
      sc.set(1, L, 1);
      m4.compose(p0.clone().addScaledVector(d, 0.5).add(c), q, sc);
      inst.setMatrixAt(i, m4);
    }
    inst.instanceMatrix.needsUpdate = true;
    inst.frustumCulled = false;
    inst.userData.zone = hub;
    zoneEntry(hub).meshes.push(inst);
    root.add(inst);
    // Ring statt Scheibe: Bremsscheibe, Nabe und Riemenscheibe bleiben antippbar.
    proxy(hub, new RingGeometry(0.1, rimR - 0.008, 48), c);
    return rimR;
  }
  wheel('hinten', RA, 0.34, 32, 0.052);
  wheel('vorne', FA, 0.26, 28, 0.031);
  add('laufrad-vorne', new CylinderGeometry(0.022, 0.022, 0.1, 20), 'satin', FA, [
    Math.PI / 2,
    0,
    0,
  ]);

  // --- Bremsen (Scheiben links, also -z) -------------------------------------
  function brake(suffix: string, c: Vector3, caliperDeg: number) {
    const z = `bremse-${suffix}`;
    disc(z, c, 0.09, 0.0022, 'steel', -0.058);
    disc(z, c, 0.05, 0.004, 'black', -0.058);
    const a = (caliperDeg * Math.PI) / 180;
    const p = V(c.x + Math.cos(a) * 0.082, c.y + Math.sin(a) * 0.082, -0.062);
    const cal = box(z, [0.07, 0.032, 0.034], p, 'black');
    cal.rotation.z = a + Math.PI / 2;
    box(z, [0.05, 0.014, 0.012], V(p.x, p.y, -0.081), 'satin', a + Math.PI / 2);
  }
  brake('hinten', RA, 28);
  brake('vorne', FA, 150);

  // --- Hinterbau, Rahmen ----------------------------------------------------
  const J = onSeatTube(0.8);
  rod('rahmen', stBot, stTop, 0.024, 'frame', true);
  rod('rahmen', J, V(0.02, 0.72), 0.026, 'frame', true);
  const lowRear = onSeatTube(0.4);
  rod('rahmen', V(0.02, 0.4), lowRear, 0.03, 'frame', true);
  // Lenkkopf hinten (Lenksäule)
  rod('rahmen', V(0.02, 0.35), V(0.02, 0.785), 0.034, 'frame', false);
  joint('rahmen', V(0.02, 0.785), 0.034, 'frame');
  // Schwinge: Kettenstreben unten, Sitzstreben setzen über dem Riemen an.
  const PV = V(-0.37, 0.33);
  const K = V(-0.6, 0.645);
  const SS = V(RA.x - 0.025, RA.y + 0.075);
  for (const s of [-1, 1]) {
    rod('rahmen', V(PV.x, PV.y, s * 0.05), V(RA.x, RA.y, s * 0.068), 0.016, 'frame', true, 0.013);
    rod('rahmen', V(SS.x, SS.y, s * 0.068), V(K.x, K.y, s * 0.042), 0.014, 'frame', true);
    // Ausfallende, nach oben verlängert bis zur Sitzstrebe
    box('rahmen', [0.05, 0.035, 0.008], V(RA.x, RA.y, s * 0.072), 'frame');
    box('rahmen', [0.03, 0.09, 0.008], V(RA.x - 0.014, RA.y + 0.04, s * 0.072), 'frame', 0.3);
  }
  rod('rahmen', V(PV.x, PV.y, -0.05), V(PV.x, PV.y, 0.05), 0.02, 'frame', false);

  // Dämpfer mit Umlenkhebel
  const RP = onSeatTube(0.655);
  const RF = V(-0.38, 0.665);
  const SF = V(-0.14, 0.675);
  for (const s of [-1, 1]) {
    rod('daempfer', V(K.x, K.y, s * 0.036), V(RF.x, RF.y, s * 0.036), 0.012, 'black', true);
  }
  rod('daempfer', V(K.x, K.y, -0.042), V(K.x, K.y, 0.042), 0.009, 'satin', false);
  rod('daempfer', V(RP.x, RP.y, -0.04), V(RP.x, RP.y, 0.04), 0.012, 'satin', false);
  rod('daempfer', V(RF.x, RF.y, -0.04), V(RF.x, RF.y, 0.04), 0.009, 'satin', false);
  // Dämpferkörper, Kolbenstange, Feder
  const shockDir = new Vector3().subVectors(SF, RF);
  const shockMid = RF.clone().addScaledVector(shockDir, 0.55);
  rod('daempfer', RF, shockMid, 0.017, 'black', true);
  rod('daempfer', shockMid, SF, 0.009, 'steel', false);
  joint('daempfer', SF, 0.014, 'black');
  const coilPts: Vector3[] = [];
  const turns = 7;
  const n = turns * 24;
  const coilA = RF.clone().addScaledVector(shockDir, 0.18);
  const coilB = RF.clone().addScaledVector(shockDir, 0.88);
  const cd = new Vector3().subVectors(coilB, coilA);
  for (let i = 0; i <= n; i++) {
    const tt = i / n;
    const ang = tt * turns * Math.PI * 2;
    const p = coilA.clone().addScaledVector(cd, tt);
    p.y += Math.cos(ang) * 0.027;
    p.z += Math.sin(ang) * 0.027;
    coilPts.push(p);
  }
  tube('daempfer', coilPts, 0.0042, 'black', false, 'centripetal', n * 2);
  // Aufnahme am Oberrohr
  box('rahmen', [0.03, 0.06, 0.03], V(SF.x, SF.y + 0.035, 0), 'frame');

  // --- Motor, Akku ------------------------------------------------------------
  roundedSlab('motor', 0.2, 0.18, 0.04, 0.1, 0.01, 'black', V(BB.x, BB.y, 0));
  disc('motor', BB, 0.05, 0.012, 'satin', 0.058);
  disc('motor', BB, 0.05, 0.012, 'satin', -0.058);
  roundedSlab('akku', 0.27, 0.09, 0.032, 0.072, 0.009, 'black', V(-0.165, 0.478, 0));
  for (let li = 0; li < 5; li++) {
    box('akku', [0.006, 0.006, 0.003], V(-0.215 + li * 0.012, 0.462, 0.046), 'led');
  }
  box('akku', [0.05, 0.012, 0.003], V(-0.085, 0.5, 0.046), 'satin');

  // --- Riemenantrieb: Riemenscheiben, Riemen, Nabenschaltung ------------------
  const fR = 0.094;
  const rR = 0.056;
  add('riemen', new TorusGeometry(fR, 0.009, 8, 96), 'steel', V(BB.x, BB.y, DZ));
  for (let sa = 0; sa < 5; sa++) {
    const aa = (sa / 5) * Math.PI * 2 + 0.3;
    rod(
      'riemen',
      V(BB.x, BB.y, DZ),
      V(BB.x + Math.cos(aa) * (fR - 0.006), BB.y + Math.sin(aa) * (fR - 0.006), DZ),
      0.008,
      'black',
      false,
    );
  }
  disc('riemen', BB, 0.032, 0.012, 'black', DZ);
  disc('riemen', RA, rR, 0.012, 'steel', DZ);
  disc('riemen', RA, 0.03, 0.016, 'black', DZ);
  const loop = beltLoop(BB, fR + 0.0115, RA, rR + 0.0025);
  add('riemen', beltGeometry(loop, DZ, 0.012, 0.005), 'belt');
  proxy(
    'riemen',
    new TubeGeometry(
      new CatmullRomCurve3(
        loop.map((p) => V(p[0], p[1], DZ)),
        true,
        'centripetal',
        0.5,
      ),
      140,
      0.016,
      6,
      true,
    ),
  );
  // Nabenschaltung: großes Nabengehäuse, Schaltbox rechts, Zug nach vorn
  add('nabenschaltung', new CylinderGeometry(0.044, 0.044, 0.072, 32), 'steel', RA, [
    Math.PI / 2,
    0,
    0,
  ]);
  for (const s of [-1, 1]) {
    disc('nabenschaltung', RA, 0.047, 0.006, 'satin', s * 0.02);
  }
  box(
    'nabenschaltung',
    [0.05, 0.03, 0.02],
    V(RA.x + 0.006, RA.y - 0.036, DZ + 0.018),
    'black',
    0.2,
  );
  tube(
    'nabenschaltung',
    [
      V(RA.x + 0.03, RA.y - 0.042, DZ + 0.018),
      V(RA.x + 0.12, RA.y - 0.03, 0.08),
      V(RA.x + 0.3, RA.y - 0.012, 0.07),
      V(PV.x - 0.02, PV.y + 0.002, 0.066),
    ],
    0.0026,
    'black',
  );

  // Kurbeln und Pedale (außerhalb der Riemenebene)
  disc('kurbeln', BB, 0.022, 0.03, 'satin', 0.098);
  rod('kurbeln', V(BB.x, BB.y, 0.104), V(BB.x + 0.17, BB.y, 0.108), 0.011, 'black', true);
  rod('kurbeln', V(BB.x, BB.y, -0.086), V(BB.x - 0.17, BB.y, -0.09), 0.011, 'black', true);
  for (const [x, s, z] of [
    [BB.x + 0.17, 1, 0.108],
    [BB.x - 0.17, -1, 0.09],
  ] as const) {
    rod('kurbeln', V(x, BB.y, s * z), V(x, BB.y, s * (z + 0.02)), 0.006, 'steel', false);
    box('kurbeln', [0.095, 0.02, 0.078], V(x, BB.y, s * (z + 0.062)), 'black');
  }

  // --- Sattel ------------------------------------------------------------------
  const postTop = stTop.clone().addScaledVector(stDir, 0.165);
  rod('sattel', stTop, postTop, 0.0155, 'black', false);
  const clamp = add('sattel', new TorusGeometry(0.026, 0.006, 8, 24), 'black', stTop);
  clamp.quaternion.setFromUnitVectors(ZAX, stDir);
  box('sattel', [0.07, 0.016, 0.045], V(postTop.x - 0.005, postTop.y + 0.006, 0), 'black');
  const ss = new Shape();
  ss.moveTo(0.14, 0);
  ss.bezierCurveTo(0.14, 0.022, 0.1, 0.028, 0.05, 0.03);
  ss.bezierCurveTo(0.0, 0.032, -0.05, 0.074, -0.1, 0.084);
  ss.bezierCurveTo(-0.142, 0.09, -0.152, 0.04, -0.152, 0);
  ss.bezierCurveTo(-0.152, -0.04, -0.142, -0.09, -0.1, -0.084);
  ss.bezierCurveTo(-0.05, -0.074, 0.0, -0.032, 0.05, -0.03);
  ss.bezierCurveTo(0.1, -0.028, 0.14, -0.022, 0.14, 0);
  const sg = new ExtrudeGeometry(ss, {
    depth: 0.028,
    bevelEnabled: true,
    bevelThickness: 0.014,
    bevelSize: 0.012,
    bevelSegments: 5,
    curveSegments: 24,
  });
  sg.rotateX(-Math.PI / 2);
  add('sattel', sg, 'saddle', V(postTop.x - 0.01, postTop.y + 0.028, 0));

  // --- Lenksäule, Lenker, Klingel, Display -------------------------------------
  rod('lenker', V(0.02, 0.785), V(0.0, 1.065), 0.018, 'black', false);
  const barPts = [
    V(-0.135, 1.1, -0.33),
    V(-0.07, 1.095, -0.22),
    V(-0.008, 1.076, -0.09),
    V(0.0, 1.07, 0),
    V(-0.008, 1.076, 0.09),
    V(-0.07, 1.095, 0.22),
    V(-0.135, 1.1, 0.33),
  ];
  tube('lenker', barPts, 0.011, 'black', false, 'catmullrom', 80);
  box('lenker', [0.04, 0.045, 0.06], V(0.0, 1.07, 0), 'black');
  // Griffe; rechts innen der Drehgriff der Nabenschaltung
  rod('lenker', V(-0.074, 1.095, -0.215), V(-0.137, 1.1, -0.335), 0.017, 'rubber', true);
  rod('lenker', V(-0.088, 1.096, 0.24), V(-0.137, 1.1, 0.335), 0.017, 'rubber', true);
  rod('lenker', V(-0.072, 1.095, 0.212), V(-0.088, 1.096, 0.24), 0.02, 'satin', false);
  for (const s of [-1, 1]) {
    // Bremsgriffe
    box('bremsgriffe', [0.034, 0.026, 0.03], V(-0.058, 1.094, s * 0.192), 'black');
    rod('bremsgriffe', V(-0.048, 1.09, s * 0.2), V(0.03, 1.066, s * 0.3), 0.0055, 'satin', true);
    proxyRod('bremsgriffe', V(-0.06, 1.092, s * 0.19), V(0.035, 1.064, s * 0.305), 0.018);
  }
  // Klingel links
  const bellBase = V(-0.038, 1.1, -0.155);
  add('klingel', new CylinderGeometry(0.011, 0.011, 0.014, 16), 'black', bellBase);
  const dome = add(
    'klingel',
    new SphereGeometry(0.021, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2),
    'chrome',
    V(bellBase.x, bellBase.y + 0.007, bellBase.z),
  );
  dome.scale.set(1, 0.8, 1);
  proxy('klingel', new SphereGeometry(0.036, 10, 8), V(bellBase.x, bellBase.y + 0.008, bellBase.z));
  add(
    'klingel',
    new CylinderGeometry(0.021, 0.021, 0.004, 20),
    'chrome',
    V(bellBase.x, bellBase.y + 0.007, bellBase.z),
  );
  // Display
  box('display', [0.05, 0.012, 0.078], V(0.028, 1.108, 0), 'black', 0.55);
  box('display', [0.04, 0.003, 0.064], V(0.025, 1.114, 0), 'screen', 0.55);
  rod('display', V(0.0, 1.07, 0), V(0.025, 1.1, 0), 0.006, 'black', false);
  // Züge
  for (const s of [-1, 1]) {
    tube(
      'lenker',
      [
        V(-0.012, 1.066, s * 0.05),
        V(0.06, 1.0, s * 0.072),
        V(0.086, 0.885, s * 0.06),
        V(0.055, 0.795, s * 0.032),
        V(0.035, 0.74, s * 0.02),
      ],
      0.0034,
      'black',
    );
  }
  // Lenksäule unten mit Lenkhebel
  rod('lenkung', V(0.02, 0.35), V(0.02, 0.155), 0.016, 'black', false);
  rod('lenkung', V(0.02, 0.155), V(0.075, 0.155), 0.01, 'black', true);

  // --- Ladefläche (60 cm): Seitenrahmen, Boden ----------------------------------
  for (const s of [-1, 1]) {
    tube(
      'rahmen',
      [
        V(0.02, 0.47, s * 0.325),
        V(0.35, 0.47, s * 0.325),
        V(0.65, 0.47, s * 0.325),
        V(0.75, 0.53, s * 0.24),
        V(0.802, 0.62, s * 0.1),
        V(0.812, 0.66, s * 0.03),
      ],
      0.019,
      'frame',
      false,
      'centripetal',
      90,
    );
    tube(
      'rahmen',
      [
        V(0.03, 0.22, s * 0.3),
        V(0.35, 0.22, s * 0.3),
        V(0.59, 0.22, s * 0.3),
        V(0.71, 0.27, s * 0.27),
        V(0.79, 0.4, s * 0.17),
        V(0.835, 0.54, s * 0.05),
      ],
      0.019,
      'frame',
      false,
      'centripetal',
      90,
    );
    rod('rahmen', V(0.03, 0.22, s * 0.3), V(0.02, 0.47, s * 0.325), 0.016, 'frame', true);
    const bx = [0.12, 0.355, 0.59] as const;
    const tx = [0.24, 0.47] as const;
    rod('rahmen', V(bx[0], 0.22, s * 0.3), V(tx[0], 0.47, s * 0.325), 0.012, 'frame', true);
    rod('rahmen', V(tx[0], 0.47, s * 0.325), V(bx[1], 0.22, s * 0.3), 0.012, 'frame', true);
    rod('rahmen', V(bx[1], 0.22, s * 0.3), V(tx[1], 0.47, s * 0.325), 0.012, 'frame', true);
    rod('rahmen', V(tx[1], 0.47, s * 0.325), V(bx[2], 0.22, s * 0.3), 0.012, 'frame', true);
  }
  rod('rahmen', V(0.02, 0.47, -0.325), V(0.02, 0.47, 0.325), 0.017, 'frame', false);
  for (const x of [0.03, 0.355, 0.59]) {
    rod('rahmen', V(x, 0.22, -0.3), V(x, 0.22, 0.3), 0.015, 'frame', false);
  }
  box('rahmen', [0.59, 0.012, 0.58], V(0.345, 0.236, 0), 'black');
  // Lenkkopf vorn
  const HB = V(0.838, 0.56);
  const HT = V(0.766, 0.76);
  rod('rahmen', HB, HT, 0.03, 'frame', false);
  joint('rahmen', HT, 0.03, 'frame');

  // --- Federgabel -------------------------------------------------------------
  box('gabel', [0.055, 0.032, 0.165], V(0.862, 0.538, 0), 'black', 0.35);
  for (const s of [-1, 1]) {
    rod('gabel', V(0.88, 0.535, s * 0.066), V(0.922, 0.42, s * 0.066), 0.016, 'satin', false);
    rod(
      'gabel',
      V(0.916, 0.44, s * 0.066),
      V(FA.x, FA.y + 0.006, s * 0.066),
      0.021,
      'black',
      true,
      0.019,
    );
  }

  // --- Lenkstange --------------------------------------------------------------
  const rodPts = [V(0.075, 0.155, 0), V(0.61, 0.155, 0), V(0.78, 0.53, 0), V(0.836, 0.552, 0)];
  for (let ri = 0; ri < rodPts.length - 1; ri++) {
    const a = rodPts[ri]!;
    const b = rodPts[ri + 1]!;
    rod('lenkung', a, b, ri === 2 ? 0.009 : 0.008, 'satin', true);
    proxyRod('lenkung', a, b, 0.02);
  }

  // --- Schutzbleche -------------------------------------------------------------
  arcBand('schutzblech-hinten', RA, 0.372, 0.074, 25, 205, 'plastic');
  arcBand('schutzblech-vorne', FA, 0.288, 0.07, 15, 135, 'plastic');
  for (const s of [-1, 1]) {
    const a = (200 * Math.PI) / 180;
    rod(
      'schutzblech-hinten',
      V(RA.x, RA.y, s * 0.06),
      V(RA.x + Math.cos(a) * 0.37, RA.y + Math.sin(a) * 0.37, s * 0.034),
      0.003,
      'satin',
      false,
    );
    const b = (25 * Math.PI) / 180;
    rod(
      'schutzblech-vorne',
      V(FA.x, FA.y, s * 0.07),
      V(FA.x + Math.cos(b) * 0.286, FA.y + Math.sin(b) * 0.286, s * 0.033),
      0.003,
      'satin',
      false,
    );
  }

  // --- Gepäckträger, Rücklicht ------------------------------------------------
  const rackY = 0.78;
  for (const s of [-1, 1]) {
    rod(
      'gepaecktraeger',
      V(-0.545, rackY, s * 0.085),
      V(-1.2, rackY, s * 0.085),
      0.0085,
      'black',
      true,
    );
    rod(
      'gepaecktraeger',
      V(-1.18, rackY, s * 0.085),
      V(RA.x - 0.012, RA.y + 0.02, s * 0.098),
      0.0075,
      'black',
      true,
    );
    rod(
      'gepaecktraeger',
      V(-0.86, rackY, s * 0.085),
      V(RA.x + 0.005, RA.y + 0.03, s * 0.098),
      0.0075,
      'black',
      true,
    );
  }
  for (const x of [-0.545, -0.7, -0.87, -1.04, -1.2]) {
    rod('gepaecktraeger', V(x, rackY, -0.085), V(x, rackY, 0.085), 0.0075, 'black', false);
  }
  proxy('gepaecktraeger', new BoxGeometry(0.66, 0.025, 0.19), V(-0.872, rackY, 0));
  box('licht-hinten', [0.03, 0.04, 0.09], V(-1.214, 0.752, 0), 'black');
  proxy('licht-hinten', new BoxGeometry(0.06, 0.07, 0.13), V(-1.218, 0.752, 0));
  box('licht-hinten', [0.004, 0.028, 0.074], V(-1.231, 0.752, 0), 'lensRear');

  // --- Licht vorn ---------------------------------------------------------------
  rod('licht-vorne', V(0.78, 0.745, 0), V(0.818, 0.79, 0), 0.006, 'black', false);
  const lamp = add(
    'licht-vorne',
    new CylinderGeometry(0.026, 0.022, 0.06, 24),
    'black',
    V(0.835, 0.792, 0),
  );
  lamp.rotation.z = -Math.PI / 2;
  const lens = add(
    'licht-vorne',
    new CylinderGeometry(0.022, 0.022, 0.004, 24),
    'lensFront',
    V(0.866, 0.792, 0),
  );
  lens.rotation.z = -Math.PI / 2;
  proxy('licht-vorne', new SphereGeometry(0.05, 10, 8), V(0.838, 0.792, 0));

  // --- Ständer -------------------------------------------------------------------
  rod('staender', V(0.36, 0.205, -0.13), V(0.36, 0.205, 0.13), 0.012, 'black', false);
  for (const s of [-1, 1]) {
    rod('staender', V(0.36, 0.205, s * 0.12), V(0.3, 0.014, s * 0.3), 0.011, 'black', true);
    proxyRod('staender', V(0.36, 0.205, s * 0.12), V(0.3, 0.014, s * 0.3), 0.026);
    box('staender', [0.07, 0.012, 0.045], V(0.3, 0.006, s * 0.3), 'rubber');
  }
  rod('staender', V(0.36, 0.205, 0), V(0.34, 0.229, 0), 0.01, 'black', false);

  // --- Transportbox -----------------------------------------------------------
  const bw = 0.29;
  const prof = [
    V(0.12, 0.25),
    V(0.59, 0.25),
    V(0.71, 0.4),
    V(0.71, 0.8),
    V(0.07, 0.8),
    V(0.07, 0.34),
  ];
  const bs = new Shape();
  bs.moveTo(prof[0]!.x, prof[0]!.y);
  for (let pi = 1; pi < prof.length; pi++) bs.lineTo(prof[pi]!.x, prof[pi]!.y);
  bs.closePath();
  const bgeo = new ExtrudeGeometry(bs, {
    depth: bw * 2,
    bevelEnabled: true,
    bevelThickness: 0.004,
    bevelSize: 0.004,
    bevelSegments: 2,
  });
  bgeo.translate(0, 0, -bw);
  add('transportbox', bgeo, 'white');
  const er = 0.011;
  for (let ei = 0; ei < prof.length; ei++) {
    const a0 = prof[ei]!;
    const a1 = prof[(ei + 1) % prof.length]!;
    for (const s of [-1, 1]) {
      rod(
        'transportbox',
        V(a0.x, a0.y, s * (bw + 0.003)),
        V(a1.x, a1.y, s * (bw + 0.003)),
        er,
        'edge',
        true,
      );
    }
    rod('transportbox', V(a0.x, a0.y, -bw - 0.003), V(a0.x, a0.y, bw + 0.003), er, 'edge', false);
  }
  // Deckel: schwarzer Rahmen, weiße Fläche
  box('transportbox', [0.66, 0.022, 0.61], V(0.39, 0.813, 0), 'edge');
  box('transportbox', [0.59, 0.006, 0.54], V(0.39, 0.826, 0), 'white');
  for (const z of [-0.16, 0.16]) {
    rod('transportbox', V(0.075, 0.81, z - 0.04), V(0.075, 0.81, z + 0.04), 0.008, 'satin', false);
  }
  box('transportbox', [0.012, 0.05, 0.08], V(0.718, 0.765, 0), 'satin');
  box('transportbox', [0.006, 0.018, 0.03], V(0.726, 0.765, 0), 'black');
  // Aufkleber: beide Seiten und Front
  const stG = new PlaneGeometry(0.4, 0.17);
  add('transportbox', stG, 'sticker', V(0.39, 0.65, bw + 0.0045));
  add('transportbox', stG, 'sticker', V(0.39, 0.65, -bw - 0.0045), [0, Math.PI, 0]);
  add('transportbox', stG, 'sticker', V(0.7145, 0.6, 0), [0, Math.PI / 2, 0]);

  // --- Zonen: Mittelpunkte ----------------------------------------------------
  root.updateMatrixWorld(true);
  const result: Record<string, ZoneParts> = {};
  for (const [id, zone] of Object.entries(zones)) {
    const bb = new Box3();
    for (const m of zone.meshes) {
      if (!(m instanceof InstancedMesh)) bb.expandByObject(m);
    }
    result[id] = { ...zone, center: bb.getCenter(new Vector3()), box: bb };
  }
  return { root, zones: result, sticker: stickerTex, stickerCanvas };
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
