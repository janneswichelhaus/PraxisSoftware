import {
  Box3,
  CanvasTexture,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  PerspectiveCamera,
  Raycaster,
  Scene,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
  type BufferGeometry,
  type Color,
  type Material,
  type MeshStandardMaterial,
  type Object3D,
  type Texture,
} from 'three';
import {
  STICKER_LOGO_URL,
  buildCargoBike,
  drawStickerLogo,
  makeFloor,
  makeStudioEnvironment,
  type CargoBike,
} from './model';
import {
  BIKE_CENTER,
  PIN_COLORS,
  VIEW_PRESETS,
  isZoneKey,
  BIKE_ZONES,
  type BikeMarker,
  type BikePick,
  type ModelPoint,
  type PinKind,
  type ViewId,
  type ZoneView,
} from './zones';
import { kopfUeberSpitze, naechsteNadel, type Nadelkopf } from './nadeltreffer';

/**
 * Betrachter: Kamera um das Rad, Antippen wählt ein Bauteil, Nadeln für
 * markierte Stellen. Gezeichnet wird nur bei einer Änderung.
 *
 * Portiert aus `LrViewer` im Entwurf (Handoff Lastenrad 3D, Abschnitt 5):
 * Kamera mit 30° Öffnung, Einpassen über `fitRadius`, Antippen mit höchstens
 * 6 px Bewegung und unter 700 ms, der Strahl trifft zuerst Nadeln, dann
 * Bauteile. Ziehen dreht (am Telefon nur waagrecht, senkrecht scrollt die
 * Seite), zwei Finger und Strg mit Mausrad zoomen. Bei
 * reduzierter Bewegung kein Kameraflug und kein Pulsieren (AC 10).
 *
 * Die Lichtstärken sind gegenüber r149 mit π multipliziert: three.js rechnet
 * seit r155 physikalisch, der Entwurf noch im alten Maß.
 */

const DEG = Math.PI / 180;
const BACKGROUND = 0xf4f5f7; // --color-surface-sunken

/**
 * Abstand, in dem das ganze Rad ins Bild passt. `freiAnteil` ist der Teil der
 * Höhe, den keine Bedienung überdeckt: Liegt der Ansichtswechsel über dem
 * Bild, passt das Rad zwischen Hinweis und Knöpfe statt unter sie.
 */
export function fitRadius(aspect: number, freiAnteil = 1): number {
  const t = Math.tan(15 * DEG);
  return 1.12 * Math.max(1.27 / (t * aspect), 0.74 / (t * freiAnteil));
}

function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}

/**
 * Nadel: weißer Rand, farbige Fläche (Problem rund, Beobachten eckig), Nummer in
 * der Mitte, unten die Spitze. Die gelbe Nadel trägt eine dunkle Kontur (3 : 1
 * gegen die helle Fläche, Handoff Abschnitt 3).
 */
export function pinCanvas(label: string, kind: PinKind, active: boolean): HTMLCanvasElement {
  const w = 128;
  const h = 160;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  if (!g) return c;
  const cx = 64;
  const cy = 62;
  const r = 44;
  const col = PIN_COLORS[kind];
  if (active) {
    g.fillStyle = '#004429';
    g.beginPath();
    g.arc(cx, cy, r + 14, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.moveTo(cx - 20, cy + 34);
  g.lineTo(cx, h - 2);
  g.lineTo(cx + 20, cy + 34);
  g.closePath();
  g.fill();
  g.beginPath();
  g.arc(cx, cy, r + 7, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = col.fill;
  g.beginPath();
  if (kind === 'beobachten') {
    const s = r * 0.86;
    const k = 14;
    g.moveTo(cx - s + k, cy - s);
    g.lineTo(cx + s - k, cy - s);
    g.quadraticCurveTo(cx + s, cy - s, cx + s, cy - s + k);
    g.lineTo(cx + s, cy + s - k);
    g.quadraticCurveTo(cx + s, cy + s, cx + s - k, cy + s);
    g.lineTo(cx - s + k, cy + s);
    g.quadraticCurveTo(cx - s, cy + s, cx - s, cy + s - k);
    g.lineTo(cx - s, cy - s + k);
    g.quadraticCurveTo(cx - s, cy - s, cx - s + k, cy - s);
  } else {
    g.arc(cx, cy, r, 0, Math.PI * 2);
  }
  g.fill();
  if (kind === 'beobachten') {
    g.lineWidth = 5;
    g.strokeStyle = col.kontur;
    g.stroke();
  }
  g.fillStyle = col.ink;
  g.font = '800 50px "Hanken Grotesk", ui-sans-serif, system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(label, cx, cy + 3);
  return c;
}

/** Lädt die Wortmarke für den Aufkleber; ohne sie bleibt die Fläche leer. */
export function loadStickerLogo(bike: CargoBike, onLoaded: () => void): void {
  const logo = new Image();
  logo.decoding = 'async';
  logo.onload = () => {
    drawStickerLogo(bike.stickerCanvas, logo);
    bike.sticker.needsUpdate = true;
    onLoaded();
  };
  logo.src = STICKER_LOGO_URL;
}

/** Szene mit Licht, Umgebung, Rad und Boden - für Betrachter und PDF-Bilder. */
export function createScene(renderer: WebGLRenderer): { scene: Scene; bike: CargoBike } {
  const scene = new Scene();
  scene.environment = makeStudioEnvironment(renderer);
  scene.add(new HemisphereLight(0xffffff, 0xdfe2e5, 0.35 * Math.PI));
  const key = new DirectionalLight(0xffffff, 0.9 * Math.PI);
  key.position.set(2, 4, 3);
  scene.add(key);
  const fill = new DirectionalLight(0xffffff, 0.3 * Math.PI);
  fill.position.set(-3, 2, -2);
  scene.add(fill);
  const bike = buildCargoBike({ anisotropy: renderer.capabilities.getMaxAnisotropy() });
  scene.add(bike.root);
  scene.add(makeFloor());
  return { scene, bike };
}

export function createRenderer(canvas?: HTMLCanvasElement): WebGLRenderer {
  const renderer = new WebGLRenderer({
    ...(canvas ? { canvas } : {}),
    antialias: true,
    alpha: false,
    powerPreference: 'low-power',
    preserveDrawingBuffer: !canvas,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.setClearColor(BACKGROUND, 1);
  return renderer;
}

export function disposeScene(scene: Scene): void {
  scene.traverse((o: Object3D) => {
    if (!(o instanceof Mesh) && !(o instanceof Sprite)) return;
    const objekt = o as Mesh<BufferGeometry, Material | Material[]>;
    objekt.geometry.dispose();
    for (const m of [objekt.material].flat()) {
      const map = (m as Material & { map?: Texture | null }).map;
      map?.dispose();
      m.dispose();
    }
  });
  scene.environment?.dispose();
}

/** Die Kamera einer festen Ansicht oder eines Bauteils: θ, φ, Abstand, Ziel. */
export interface Orbit {
  theta: number;
  phi: number;
  radius: number;
  target: Vector3;
}

export function placeCamera(camera: PerspectiveCamera, o: Orbit): void {
  const sp = Math.sin(o.phi);
  camera.position.set(
    o.target.x + o.radius * sp * Math.sin(o.theta),
    o.target.y + o.radius * Math.cos(o.phi),
    o.target.z + o.radius * sp * Math.cos(o.theta),
  );
  camera.lookAt(o.target);
}

/** Kamera auf ein Bauteil (θ, φ und Abstand aus dem Katalog, Ziel die Bauteilmitte). */
export function zoneOrbit(
  bike: CargoBike,
  zones: readonly string[],
  aspect: number,
  view?: ZoneView,
): Orbit | null {
  const box = new Box3();
  for (const id of zones) {
    const parts = bike.zones[id];
    if (parts) box.union(parts.box);
  }
  if (box.isEmpty()) return null;
  const first = zones[0];
  const v: ZoneView =
    view ??
    (zones.length === 1 && first && isZoneKey(first) ? BIKE_ZONES[first].view : [20, 80, null]);
  const r = v[2] ? v[2] * Math.max(1, 1.35 / aspect) : fitRadius(aspect) * 0.95;
  return { theta: v[0] * DEG, phi: v[1] * DEG, radius: r, target: box.getCenter(new Vector3()) };
}

export interface ViewerOptions {
  onPick?: (hit: BikePick | null) => void;
  onHover?: (zone: string | null) => void;
  onViewChange?: (view: ViewId | null) => void;
  /** Wie viel der Höhe die Bedienung über dem Bild überdeckt, in px. */
  rand?: number;
}

interface Press {
  id: number;
  x: number;
  y: number;
  t: number;
  moved: number;
}

export class BikeViewer {
  private readonly canvas: HTMLCanvasElement;
  private readonly opts: ViewerOptions;
  private readonly renderer: WebGLRenderer;
  private readonly scene: Scene;
  private readonly bike: CargoBike;
  private readonly camera = new PerspectiveCamera(30, 1, 0.03, 60);
  private readonly raycaster = new Raycaster();
  private readonly pins = new Group();
  private readonly pickables: Object3D[] = [];
  private readonly reduced: boolean;
  private readonly orbit: Orbit & { auto: boolean };
  private markers: BikeMarker[] = [];
  private draft: { zone: string; point: ModelPoint | null; number: number } | null = null;
  private activeId: string | null = null;
  private highlight: string[] = [];
  private hover: string | null = null;
  private hoverAt: { x: number; y: number } | null = null;
  private anim: { t0: number; ms: number; from: Orbit; to: Orbit } | null = null;
  private dirty = true;
  private glowDirty = false;
  private disposed = false;
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private press: Press | null = null;
  private pinch: { d: number; r: number } | null = null;
  private size = { w: 0, h: 0 };
  private raf = 0;
  private readonly resizeObserver: ResizeObserver | null;

  constructor(canvas: HTMLCanvasElement, opts: ViewerOptions = {}) {
    this.canvas = canvas;
    this.opts = opts;
    this.reduced = Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
    this.renderer = createRenderer(canvas);
    const { scene, bike } = createScene(this.renderer);
    this.scene = scene;
    this.bike = bike;
    scene.add(this.pins);
    bike.root.traverse((o) => {
      if (o instanceof Mesh && o.userData.zone) this.pickables.push(o);
    });
    const v = VIEW_PRESETS[0];
    this.orbit = {
      theta: v.theta * DEG,
      phi: v.phi * DEG,
      radius: 4,
      target: new Vector3(...BIKE_CENTER),
      auto: true,
    };
    loadStickerLogo(bike, () => {
      this.dirty = true;
    });
    this.resize();

    canvas.addEventListener('pointerdown', this.onDown);
    canvas.addEventListener('pointermove', this.onMove);
    canvas.addEventListener('pointerup', this.onUp);
    canvas.addEventListener('pointercancel', this.onCancel);
    canvas.addEventListener('pointerleave', this.onLeave);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    this.resizeObserver =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => this.resize());
    this.resizeObserver?.observe(canvas);
    // Die Nummern der Nadeln stehen in Hanken Grotesk; ohne geladene Schrift
    // stünde die Ersatzschrift darin.
    void document.fonts?.ready.then(() => {
      if (!this.disposed) this.buildPins();
    });
    this.raf = requestAnimationFrame(this.loop);
  }

  private aspect() {
    return this.size.w / Math.max(1, this.size.h);
  }

  /** Abstand für das ganze Rad, frei von Hinweis und Ansichtswechsel. */
  private einpassen() {
    const h = Math.max(1, this.size.h);
    const frei = clamp((h - (this.opts.rand ?? 0)) / h, 0.4, 1);
    return fitRadius(this.aspect(), frei);
  }

  resize(): void {
    const w = Math.max(1, this.canvas.clientWidth);
    const h = Math.max(1, this.canvas.clientHeight);
    if (w === this.size.w && h === this.size.h) return;
    this.size = { w, h };
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.orbit.auto) this.orbit.radius = this.einpassen();
    this.scalePins();
    this.dirty = true;
  }

  private readonly loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    let busy = false;
    if (this.anim) {
      const a = this.anim;
      const k = a.ms > 0 ? clamp((now - a.t0) / a.ms, 0, 1) : 1;
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      const o = this.orbit;
      o.theta = a.from.theta + (a.to.theta - a.from.theta) * e;
      o.phi = a.from.phi + (a.to.phi - a.from.phi) * e;
      o.radius = a.from.radius + (a.to.radius - a.from.radius) * e;
      o.target.lerpVectors(a.from.target, a.to.target, e);
      if (k >= 1) this.anim = null;
      busy = true;
    }
    if (this.hoverAt) {
      const at = this.hoverAt;
      this.hoverAt = null;
      const hit = this.raycast(at.x, at.y);
      this.setHover(hit && !hit.markerId ? hit.zone : null);
    }
    const pulsing = this.highlight.length > 0 && !this.reduced;
    if (pulsing || this.glowDirty) {
      this.applyGlow(now);
      this.glowDirty = false;
      busy = true;
    }
    if (this.dirty || busy) {
      placeCamera(this.camera, this.orbit);
      this.renderer.render(this.scene, this.camera);
      this.dirty = false;
    }
  };

  private applyGlow(now: number) {
    const selected = new Set(this.highlight);
    const pulse = this.reduced ? 0.6 : 0.42 + 0.3 * (0.5 + 0.5 * Math.sin(now / 260));
    for (const [id, zone] of Object.entries(this.bike.zones)) {
      const mode = selected.has(id) ? 'sel' : this.hover === id ? 'hover' : null;
      for (const m of zone.materials) {
        if (m.map) continue;
        if (mode === 'sel') {
          m.emissive.setHex(0x1f9d63);
          m.emissiveIntensity = pulse;
        } else if (mode === 'hover') {
          m.emissive.setHex(0x2a8a5c);
          m.emissiveIntensity = 0.3;
        } else {
          m.emissive.copy(m.userData.baseEmissive as Color);
          m.emissiveIntensity = m.userData.baseEmissiveIntensity as number;
        }
      }
    }
  }

  private setHover(zone: string | null) {
    if (zone === this.hover) return;
    this.hover = zone;
    this.glowDirty = true;
    this.canvas.style.cursor = zone ? 'pointer' : 'grab';
    this.opts.onHover?.(zone);
  }

  setHighlight(zones: readonly string[]): void {
    this.highlight = zones.filter(Boolean);
    this.glowDirty = true;
  }

  private raycast(x: number, y: number): BikePick | null {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    // Kamera und Nadeln führt sonst erst das nächste Bild nach: Ein Antippen
    // gleich nach dem Setzen der Nadeln träfe eine Nadel, die noch in voller
    // Größe am Ursprung steht.
    placeCamera(this.camera, this.orbit);
    this.camera.updateMatrixWorld();
    this.pins.updateMatrixWorld(true);
    const ndc = new Vector2(
      ((x - rect.left) / rect.width) * 2 - 1,
      -((y - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    const nadel = naechsteNadel(x, y, this.nadelkoepfe(rect));
    if (nadel) return nadel;
    for (const hit of this.raycaster.intersectObjects(this.pins.children, false)) {
      const data = hit.object.userData as { markerId?: string; zone: string; point: ModelPoint };
      if (data.markerId) return { zone: data.zone, markerId: data.markerId, point: data.point };
    }
    for (const hit of this.raycaster.intersectObjects(this.pickables, false)) {
      const zone = hit.object.userData.zone as string | undefined;
      if (zone) {
        const p = hit.point;
        const round = (v: number) => Math.round(v * 1000) / 1000;
        return { zone, point: [round(p.x), round(p.y), round(p.z)] };
      }
    }
    return null;
  }

  /** Wo die Köpfe der Nadeln am Bildschirm stehen (ohne die Nadel im Entwurf). */
  private nadelkoepfe(rect: DOMRect): Nadelkopf<BikePick>[] {
    const ort = new Vector3();
    const koepfe: Nadelkopf<BikePick>[] = [];
    for (const s of this.pins.children) {
      const data = s.userData as { markerId?: string; zone: string; point: ModelPoint; px: number };
      if (!data.markerId) continue;
      s.getWorldPosition(ort).project(this.camera);
      if (ort.z > 1) continue;
      const spitzeY = rect.top + ((1 - ort.y) / 2) * rect.height;
      koepfe.push({
        x: rect.left + ((ort.x + 1) / 2) * rect.width,
        y: spitzeY - kopfUeberSpitze(data.px * 1.25),
        nadel: { zone: data.zone, markerId: data.markerId, point: data.point },
      });
    }
    return koepfe;
  }

  private readonly onDown = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      // Ohne Capture geht es auch.
    }
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 1) {
      this.press = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), moved: 0 };
    } else if (this.pointers.size === 2) {
      this.press = null;
      this.pinch = { d: this.pinchDistance(), r: this.orbit.radius };
    }
    this.anim = null;
    this.canvas.style.cursor = 'grabbing';
    e.preventDefault();
  };

  private pinchDistance() {
    const pts = [...this.pointers.values()];
    const [a, b] = pts;
    if (!a || !b) return 1;
    return Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
  }

  private readonly onMove = (e: PointerEvent) => {
    const p = this.pointers.get(e.pointerId);
    if (!p) {
      if (e.pointerType === 'mouse') this.hoverAt = { x: e.clientX, y: e.clientY };
      return;
    }
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (this.pointers.size === 1) {
      if (this.press) this.press.moved += Math.abs(dx) + Math.abs(dy);
      if (!this.press || this.press.moved > 5) {
        this.orbit.theta -= dx * 0.009;
        this.orbit.phi = clamp(this.orbit.phi - dy * 0.007, 0.18, 1.54);
        this.dirty = true;
        this.opts.onViewChange?.(null);
      }
    } else if (this.pointers.size === 2 && this.pinch) {
      const fit = this.einpassen();
      this.orbit.radius = clamp(
        (this.pinch.r * this.pinch.d) / this.pinchDistance(),
        0.55,
        fit * 1.6,
      );
      this.orbit.auto = false;
      this.dirty = true;
    }
  };

  private readonly onUp = (e: PointerEvent) => {
    const pr = this.press;
    const tap = Boolean(
      pr && pr.id === e.pointerId && pr.moved <= 6 && performance.now() - pr.t < 700,
    );
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinch = null;
    this.press = null;
    this.canvas.style.cursor = this.hover ? 'pointer' : 'grab';
    if (tap) this.opts.onPick?.(this.raycast(e.clientX, e.clientY));
  };

  private readonly onCancel = (e: PointerEvent) => {
    this.pointers.delete(e.pointerId);
    this.press = null;
    this.pinch = null;
  };

  private readonly onLeave = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' && this.pointers.size === 0) this.setHover(null);
  };

  private readonly onWheel = (e: WheelEvent) => {
    // Nur mit Strg (oder ⌘): Sonst rollte die Seite nicht mehr über das Rad.
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    this.zoomBy(Math.exp(e.deltaY * 0.0025));
  };

  private flyTo(to: Orbit, ms: number) {
    const o = this.orbit;
    let d = to.theta - o.theta;
    d = ((((d + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;
    this.anim = {
      t0: performance.now(),
      ms: this.reduced ? 0 : ms,
      from: { theta: o.theta, phi: o.phi, radius: o.radius, target: o.target.clone() },
      to: { theta: o.theta + d, phi: to.phi, radius: to.radius, target: to.target.clone() },
    };
  }

  setView(id: ViewId): void {
    const v = VIEW_PRESETS.find((preset) => preset.id === id);
    if (!v) return;
    this.orbit.auto = true;
    this.flyTo(
      {
        theta: v.theta * DEG,
        phi: v.phi * DEG,
        radius: this.einpassen(),
        target: new Vector3(...BIKE_CENTER),
      },
      650,
    );
  }

  /** „Am Rad zeigen“: Kamera auf die Bauteile, mit Flug nur ohne reduzierte Bewegung. */
  focusZones(zones: readonly string[], view?: ZoneView): void {
    const to = zoneOrbit(this.bike, zones, this.aspect(), view);
    if (!to) return;
    this.orbit.auto = false;
    this.flyTo(to, 700);
  }

  zoomBy(f: number): void {
    const fit = this.einpassen();
    this.anim = null;
    this.orbit.radius = clamp(this.orbit.radius * f, 0.55, fit * 1.6);
    this.orbit.auto = false;
    this.dirty = true;
  }

  private zoneCenter(zone: string): ModelPoint | null {
    const c = this.bike.zones[zone]?.center;
    return c ? [c.x, c.y, c.z] : null;
  }

  setMarkers(
    markers: readonly BikeMarker[],
    draft: { zone: string; point: ModelPoint | null; number: number } | null,
    activeId: string | null,
  ): void {
    this.markers = [...markers];
    this.draft = draft;
    this.activeId = activeId;
    this.buildPins();
  }

  private buildPins() {
    for (const s of [...this.pins.children]) {
      this.pins.remove(s);
      if (s instanceof Sprite) {
        s.material.map?.dispose();
        s.material.dispose();
      }
    }
    const pin = (
      label: string,
      kind: PinKind,
      active: boolean,
      point: ModelPoint,
      data: { markerId?: string; zone: string; point: ModelPoint },
      order: number,
    ) => {
      const tex = new CanvasTexture(pinCanvas(label, kind, active));
      tex.colorSpace = SRGBColorSpace;
      const mat = new SpriteMaterial({
        map: tex,
        depthTest: false,
        depthWrite: false,
        sizeAttenuation: false,
        transparent: true,
      });
      const s = new Sprite(mat);
      s.center.set(0.5, 0.0);
      s.position.set(point[0], point[1], point[2]);
      s.renderOrder = 100 + order;
      s.userData = { ...data, px: active ? 40 : 32 };
      this.pins.add(s);
    };
    this.markers.forEach((m, i) => {
      const point = m.point ?? this.zoneCenter(m.zone);
      if (!point) return;
      const active = m.id === this.activeId;
      pin(
        String(m.number),
        m.severity,
        active,
        point,
        { markerId: m.id, zone: m.zone, point },
        active ? 90 : i,
      );
    });
    if (this.draft) {
      const point = this.draft.point ?? this.zoneCenter(this.draft.zone);
      if (point)
        pin(String(this.draft.number), 'neu', true, point, { zone: this.draft.zone, point }, 95);
    }
    this.scalePins();
    this.dirty = true;
  }

  private scalePins() {
    const h = Math.max(1, this.size.h);
    const t = Math.tan((this.camera.fov * DEG) / 2);
    for (const s of this.pins.children) {
      const px = (s.userData as { px: number }).px;
      const sy = (px * 1.25 * 2 * t) / h;
      s.scale.set(sy / 1.25, sy, 1);
    }
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObserver?.disconnect();
    const cv = this.canvas;
    cv.removeEventListener('pointerdown', this.onDown);
    cv.removeEventListener('pointermove', this.onMove);
    cv.removeEventListener('pointerup', this.onUp);
    cv.removeEventListener('pointercancel', this.onCancel);
    cv.removeEventListener('pointerleave', this.onLeave);
    cv.removeEventListener('wheel', this.onWheel);
    disposeScene(this.scene);
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}

/** Material eines Bauteils, für Tests der Hervorhebung. */
export type ZoneMaterial = MeshStandardMaterial;
