// Own Motion Lastenrad: Riese & Müller Load 60 mit MoreCargoBox in Papier, nach dem Herstellerfoto
// vermessen. Front = +x, Antriebsseite = +z, Boden y = 0, Maße in Metern. Geometrie, Maße, Farben und
// Namen kommen aus dem Entwurf und werden in diesem Repository nicht geändert.

import {
  Box3,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CapsuleGeometry,
  CatmullRomCurve3,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  LatheGeometry,
  MathUtils,
  Matrix3,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  RingGeometry,
  SRGBColorSpace,
  TorusGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
  type Object3D,
} from 'three';

// Die Wortmarke kommt aus `public/marke/`, der byte-gleichen Kopie von `marke/logo/`:
// keine zweite Fassung neben dieser Datei.
const WORTMARKE = '/marke/own-motion-block-unterzeile-farbig.svg';

type P2 = readonly [number, number];
type P3 = readonly [number, number, number];
/** Punkt in der Mittelebene (ohne z) oder im Raum. */
type Punkt = readonly [number, number, number?];
type Stoff = MeshStandardMaterial;
type Teil = Mesh<BufferGeometry, Stoff>;
type Laufrad = { x: number; y: number; r: number };

const istTeil = (o: Object3D): o is Teil => (o as Partial<Mesh>).isMesh === true;

/* Bauteile der Praxissoftware. Jedes Teil gehört zu genau einem Bauteil; dessen Schlüssel steht in
   mesh.userData.zone. Geprüft wird von oben nach unten, die erste passende Regel gilt.
   Der Gepäckträger hat keine eigenen Teile, nur eine Trefferfläche (siehe unten). */
const BAUTEIL_REGELN: readonly (readonly [string, RegExp])[] = [
  ['reifen-vorne', /^vorderrad_reifen/],
  ['reifen-hinten', /^hinterrad_reifen/],
  ['bremse-vorne', /^(vorderrad_bremsscheibe|bremssattel_vorn)/],
  ['bremse-hinten', /^hinterrad_bremsscheibe/],
  ['laufrad-vorne', /^vorderrad_/],
  ['laufrad-hinten', /^hinterrad_/],
  ['bremsgriffe', /^(bremsgeber|bremshebel|bremsleitung)_/],
  ['riemen', /^kette_/],
  ['nabenschaltung', /^(kassette|schaltwerk|schaltroellchen)/],
  ['kurbeln', /^((kurbel|pedal)_|tretlager|kettenblatt|kettenschutz)/],
  ['motor', /^mittelmotor/],
  ['akku', /^akku/],
  ['licht-vorne', /^scheinwerfer/],
  ['licht-hinten', /^ruecklicht/],
  ['sattel', /^sattel/],
  ['klingel', /^klingel/],
  ['schutzblech-vorne', /^(schutzblech_vorn|spritzlappen)/],
  ['schutzblech-hinten', /^schutzblech/],
  ['staender', /^staender_/],
  ['transportbox', /^(transportbox|box_|werbeflaeche_)/],
  ['display', /^(display|bedieneinheit)/],
  ['lenker', /^(lenker$|vorbau|griff_|schalthebel)/],
  ['lenkung', /^(lenkhebel|lenkgestaenge|lenkplatte|steuersatz_)/],
  ['gabel', /^(gabel|standrohr_|tauchrohr_)/],
  ['daempfer', /^daempfer(_|feder|bolzen)/],
  [
    'rahmen',
    /^(sitzrohr|oberrohr|lenksaeule|haupttraeger|motorhalter|schwinge|ausfallende_|daempferhalter|reling|bodenholm_|strebe_|bug_|rueckstrahler_|quertraeger_|ladeboden|steuerrohr)/,
  ],
];
const bauteilVon = (name: string) => BAUTEIL_REGELN.find(([, regel]) => regel.test(name))?.[0];

/** Die Schlüssel aller Bauteile, wie sie in mesh.userData.zone vorkommen (Reihenfolge wie in der Praxissoftware). */
export const BAUTEILE = [
  'reifen-vorne',
  'reifen-hinten',
  'laufrad-vorne',
  'laufrad-hinten',
  'bremse-vorne',
  'bremse-hinten',
  'bremsgriffe',
  'riemen',
  'nabenschaltung',
  'kurbeln',
  'motor',
  'akku',
  'licht-vorne',
  'licht-hinten',
  'sattel',
  'klingel',
  'schutzblech-vorne',
  'schutzblech-hinten',
  'staender',
  'transportbox',
  'rahmen',
  'lenker',
  'display',
  'lenkung',
  'gabel',
  'daempfer',
  'gepaecktraeger',
] as const;

export interface BuildOptions {
  /** Andere Adresse für die Wortmarke (SVG oder PNG). */
  logoUrl?: string | undefined;
  /** Teile je Material zusammenfassen: nur für die Anzeige, die Teilenamen entfallen dabei. */
  merge?: boolean | undefined;
  /**
   * Für die Praxissoftware: Jedes Bauteil bekommt eigene Materialien (Name „bauteil|material“),
   * damit es einzeln leuchten kann, und dünne Teile bekommen unsichtbare Trefferflächen
   * (userData.trefferflaeche). Mit merge bleibt dann ein Mesh je Bauteil und Material.
   */
  bauteile?: boolean | undefined;
}

/** Baut das Lastenrad als Gruppe benannter Meshes mit benannten Materialien. */
export async function buildLastenrad({
  logoUrl,
  merge = false,
  bauteile = false,
}: BuildOptions = {}): Promise<Group> {
  // Wortmarke als Bild laden (nie neu gesetzt). Fehlt sie, bleibt die Box ohne Aufdruck.
  const logoImg = await new Promise<HTMLImageElement | null>((res) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => res(null);
    im.src = logoUrl || WORTMARKE;
  });

  /* ------------------------------------------------------------------ Material */
  const MAT = {
    ink: new MeshStandardMaterial({
      name: 'tiefgruen',
      color: 0x042c1b,
      roughness: 0.52,
      metalness: 0.3,
      side: DoubleSide,
    }),
    deck: new MeshStandardMaterial({
      name: 'ladeflaeche',
      color: 0x111e17,
      roughness: 0.9,
      metalness: 0.05,
      side: DoubleSide,
    }),
    rust: new MeshStandardMaterial({
      name: 'hauptfarbe',
      color: 0x004429,
      roughness: 0.42,
      metalness: 0.16,
    }),
    tire: new MeshStandardMaterial({
      name: 'reifen',
      color: 0x151515,
      roughness: 0.94,
      metalness: 0.0,
    }),
    alu: new MeshStandardMaterial({
      name: 'aluminium',
      color: 0xc6c3bd,
      roughness: 0.28,
      metalness: 0.45,
      side: DoubleSide,
    }),
    black: new MeshStandardMaterial({
      name: 'kunststoff',
      color: 0x111e17,
      roughness: 0.65,
      metalness: 0.1,
    }),
    rot: new MeshStandardMaterial({
      name: 'rueckstrahler',
      color: 0xb5121b,
      roughness: 0.35,
      metalness: 0.1,
    }),
  };

  /* ------------------------------------------------------------------- Helfer */
  const model = new Group();
  model.name = 'own_motion_lastenrad';

  const part = <T extends Object3D>(mesh: T, name: string, group?: Group): T => {
    mesh.name = name;
    mesh.userData.zone = bauteilVon(name);
    (group || model).add(mesh);
    return mesh;
  };
  const vec = (p: Punkt) => new Vector3(p[0], p[1], p[2] || 0);
  const off = (p: Punkt, dx: number, dy: number, dz = 0): P3 => [
    p[0] + dx,
    p[1] + dy,
    (p[2] || 0) + dz,
  ];

  // Stab von a nach b als loses Mesh. rund = Enden als Halbkugeln: Rohre, die sich in
  // einem Knoten treffen, laufen dann ohne überstehende Stümpfe ineinander.
  function stab(a: Punkt, b: Punkt, r: number, mat: Stoff | null, seg = 16, rund = false) {
    const A = vec(a),
      B = vec(b),
      len = A.distanceTo(B);
    const m = new Mesh(
      rund ? new CapsuleGeometry(r, len, 4, seg) : new CylinderGeometry(r, r, len, seg),
      mat as Stoff,
    );
    m.position.copy(A).add(B).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), B.clone().sub(A).normalize());
    return m;
  }
  const tube = (
    a: Punkt,
    b: Punkt,
    r: number,
    mat: Stoff,
    name: string,
    group?: Group,
    seg?: number,
  ) => part(stab(a, b, r, mat, seg), name, group);
  const rohr = (a: Punkt, b: Punkt, r: number, mat: Stoff, name: string, seg?: number) =>
    part(stab(a, b, r, mat, seg, true), name); // Rahmenrohr, runde Enden

  // Gebogenes Rohr durch die Punkte pts
  function bogen(pts: readonly Punkt[], r: number, mat: Stoff, name: string, seg = 48, rseg = 10) {
    const kurve = new CatmullRomCurve3(pts.map(vec), false, 'catmullrom', 0.3);
    return part(new Mesh(new TubeGeometry(kurve, seg, r, rseg, false), mat), name);
  }

  // Lose Meshes zu einem Teil verschmelzen: ein Name, ein Draw Call
  function merged(meshes: readonly Mesh[], mat: Stoff, name: string, group?: Group) {
    const pos: number[] = [],
      nor: number[] = [];
    for (const m of meshes) {
      m.updateMatrix();
      const g = m.geometry.toNonIndexed().applyMatrix4(m.matrix);
      for (const v of g.getAttribute('position').array) pos.push(v);
      for (const v of g.getAttribute('normal').array) nor.push(v);
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new Float32BufferAttribute(nor, 3));
    return part(new Mesh(geo, mat), name, group);
  }

  function slab(
    w: number,
    h: number,
    d: number,
    pos: Punkt,
    mat: Stoff,
    name: string,
    rotZ?: number,
  ) {
    const m = new Mesh(new BoxGeometry(w, h, d), mat);
    m.position.set(pos[0], pos[1], pos[2] || 0);
    if (rotZ) m.rotation.z = rotZ;
    return part(m, name);
  }

  function disc(
    r: number,
    len: number,
    pos: Punkt,
    mat: Stoff,
    name: string,
    group?: Group,
    seg = 40,
  ) {
    const m = new Mesh(new CylinderGeometry(r, r, len, seg), mat);
    m.rotation.x = Math.PI / 2;
    m.position.set(pos[0], pos[1], pos[2] || 0);
    return part(m, name, group);
  }

  // Flacher Ring in der Radebene, als loses Mesh zum Verschmelzen
  function ring(r1: number, r2: number, pos: Punkt) {
    const m = new Mesh(new RingGeometry(r1, r2, 48));
    m.position.set(pos[0], pos[1], pos[2] || 0);
    return m;
  }

  // Drehkörper aus einem Profil [Radius, Höhe]. three lässt die Normale am Profilende
  // unnormiert; normalizeNormals zieht das nach, damit der GLB-Export nicht nachrechnen muss.
  function lathe(prof: readonly P2[], seg: number, von?: number, spanne?: number) {
    const g = new LatheGeometry(
      prof.map((p) => new Vector2(p[0], p[1])),
      seg,
      von,
      spanne,
    );
    g.normalizeNormals();
    return g;
  }

  const SIDES = [1, -1];
  const sfx = (s: number) => (s > 0 ? 'r' : 'l');
  const pol = (r: number, a: number, z: number): P3 => [r * Math.cos(a), r * Math.sin(a), z]; // Punkt in der Radebene

  /* ------------------------------------------------ Maßpunkte aus dem Herstellerfoto
     Seitenansicht des Load 60, 1500 × 1000 px; aus dem Radstand von 1,825 m folgt 1 px = 1,6287 mm,
     Boden bei y = 840,3 px. Teile außerhalb der Mittelebene sind entzerrt (Kameraabstand rund 9,5 m). */
  const F = (px: number, py: number, z = 0): P3 => [
    (px - 217.9) * 0.0016287 - 0.9,
    (840.3 - py) * 0.0016287,
    z,
  ];

  /* ----------------------------------- Räder: 26" hinten, 20" vorn, Reifen 55 mm breit */
  const REAR = { x: -0.9, y: 0.335, r: 0.335 };
  const FRONT = { x: 0.9235, y: 0.259, r: 0.259 };
  const TB = 0.0275; // Reifenradius im Querschnitt

  function wheel(w: Laufrad, name: string, spokes: number) {
    const g = new Group();
    g.name = name;
    g.position.set(w.x, w.y, 0);
    model.add(g);

    part(new Mesh(new TorusGeometry(w.r - TB, TB, 18, 64), MAT.tire), name + '_reifen', g);

    // Felge als Hohlkammerprofil [Radius, z]: das Horn steckt im Reifen, die Flanke ist von der Seite sichtbar
    const ro = w.r - 2 * TB + 0.008,
      ri = ro - 0.026,
      hw = 0.014;
    const prof: P2[] = [
      [ro, -hw],
      [ro, hw],
      [ri + 0.008, hw],
      [ri, hw * 0.4],
      [ri, -hw * 0.4],
      [ri + 0.008, -hw],
      [ro, -hw],
    ];
    const rim = new Mesh(lathe(prof, 64), MAT.alu);
    rim.rotation.x = Math.PI / 2;
    part(rim, name + '_felge', g);

    // Nabe mit zwei Flanschen; die Achse reicht beidseitig bis in die Ausfallenden
    const FZ = 0.03,
      FR = 0.034; // Flansch: Abstand von der Radmitte, Lochkreisradius
    merged(
      [
        stab([0, 0, -0.05], [0, 0, 0.05], 0.024, null, 24),
        ...SIDES.map((s) =>
          stab([0, 0, s * (FZ - 0.003)], [0, 0, s * (FZ + 0.003)], FR + 0.005, null, 24),
        ),
      ],
      MAT.ink,
      name + '_nabe',
      g,
    );
    disc(0.01, 0.2, [0, 0, 0], MAT.alu, name + '_achse', g, 12);

    // Speichen: gekreuzt vom Nabenflansch zur Felgenmitte, abwechselnd links und rechts, als ein Teil
    const kreuz = (12 * Math.PI) / spokes;
    merged(
      [...Array<undefined>(spokes)].map((_, i) => {
        const a = (i / spokes) * Math.PI * 2,
          s = i % 2 ? 1 : -1,
          h = a + ((i >> 1) % 2 ? kreuz : -kreuz);
        return stab(pol(FR, h, s * FZ), pol(ri + 0.003, a, s * 0.004), 0.0024, null, 6);
      }),
      MAT.alu,
      name + '_speichen',
      g,
    );

    // Bremsscheibe links, 180 mm: Reibring, sechs schräge Stege und Träger
    const br = 0.09,
      bz = -0.046;
    merged(
      [
        ring(br - 0.016, br, [0, 0, bz]),
        ring(0.012, 0.034, [0, 0, bz]),
        ...[0, 1, 2, 3, 4, 5].map((k) =>
          stab(
            pol(0.03, (k * Math.PI) / 3, bz),
            pol(br - 0.013, (k * Math.PI) / 3 + 0.5, bz),
            0.004,
            null,
            6,
          ),
        ),
      ],
      MAT.alu,
      name + '_bremsscheibe',
      g,
    );
    return g;
  }
  wheel(REAR, 'hinterrad', 36);
  wheel(FRONT, 'vorderrad', 32);

  // Schutzblech: gewölbtes Blech mit Wandstärke knapp über dem Reifen.
  // von/spanne in Grad um die Achse (0 = unten, 90 = vorn, 180 = oben), luft = Abstand zum Reifen.
  // streben: je [Winkel am Blech, Befestigungspunkt, halber Abstand z am Befestigungspunkt].
  function fender(
    w: Laufrad,
    von: number,
    spanne: number,
    luft: number,
    name: string,
    streben: readonly (readonly [number, Punkt, number])[],
  ) {
    const rc = w.r - TB,
      rf = TB + luft,
      OFFEN = Math.PI / 3,
      rad = MathUtils.degToRad;
    const profil = (r: number, dir: number) =>
      [...Array<undefined>(9)].map((_, i): P2 => {
        const t = dir * OFFEN * (1 - i / 4);
        return [rc + r * Math.cos(t), r * Math.sin(t)];
      });
    const prof = [...profil(rf + 0.003, -1), ...profil(rf, 1)]; // außen hin, innen zurück
    prof.push(prof[0]!);
    const m = new Mesh(lathe(prof, 48, rad(von), rad(spanne)), MAT.ink);
    m.rotation.x = Math.PI / 2;
    m.position.set(w.x, w.y, 0);
    part(m, name);
    const re = rc + rf * Math.cos(OFFEN),
      ze = rf * Math.sin(OFFEN); // Blechkante
    streben.forEach(([deg, p, az], i) => {
      for (const s of SIDES) {
        tube(
          [p[0], p[1], s * az],
          [w.x + re * Math.sin(rad(deg)), w.y - re * Math.cos(rad(deg)), s * ze],
          0.003,
          MAT.black,
          name + '_strebe_' + (i + 1) + '_' + sfx(s),
          undefined,
          6,
        );
      }
    });
  }
  fender(REAR, 88, 165, 0.008, 'schutzblech_hinten', [
    [176, F(241, 611), 0.092],
    [224, F(245, 639), 0.092],
  ]);
  fender(FRONT, 145, 128, 0.01, 'schutzblech_vorn', [[154, F(1307.6, 604), 0.075]]);
  slab(0.02, 0.16, 0.085, F(1172, 743), MAT.black, 'spritzlappen', 0.122);
  slab(0.11, 0.02, 0.06, F(394, 569), MAT.black, 'schutzblechhalter', 0.05);
  // Rücklicht sitzt hinten oben auf dem Schutzblech
  slab(0.036, 0.016, 0.06, F(87, 465), MAT.black, 'ruecklicht', 0.66);
  slab(0.005, 0.015, 0.054, F(77.5, 472.5), MAT.rot, 'ruecklicht_glas', 0.66);

  /* ------------------------------------------------------- Hauptrahmen (Mittelebene)
     Sitzrohr mit 68° Sitzwinkel, Oberrohr bis zur Lenksäule, Hauptträger vom Motor
     nach vorn. Die Lenksäule ist Teil des Rahmens und trägt oben den Vorbau.        */
  const BB = F(499.8, 654.7);
  const SEAT_TOP = F(388, 388);
  rohr(SEAT_TOP, F(474, 600), 0.019, MAT.ink, 'sitzrohr');
  rohr(F(443, 508), F(472, 594), 0.024, MAT.ink, 'sitzrohr_unten');
  rohr(F(424, 463), F(716, 512), 0.021, MAT.ink, 'oberrohr');
  rohr(F(404, 409), F(486, 462), 0.011, MAT.ink, 'oberrohr_strebe');
  rohr(F(703, 428), F(733, 690), 0.022, MAT.ink, 'lenksaeule');
  slab(0.34, 0.078, 0.075, F(650, 666), MAT.ink, 'haupttraeger');
  slab(0.19, 0.125, 0.07, F(500, 637), MAT.ink, 'motorhalter');
  slab(0.045, 0.032, 0.05, F(388, 386), MAT.ink, 'sattelklemme', -0.39);

  // Sattelstütze (gefedert: dickes Unterteil, schlankes Tauchrohr) und Sattel
  const KOPF = F(355, 272); // Stützenkopf mit Sattelklemmung
  rohr(SEAT_TOP, KOPF, 0.0125, MAT.alu, 'sattelstuetze');
  tube(SEAT_TOP, F(375, 350), 0.018, MAT.black, 'sattelstuetze_huelse', undefined, 20);
  {
    // Sattel: Schale aus Profilpunkten (Nase schmal, Heck breit), Heck leicht angehoben
    const L = 0.27,
      prof: P3[] = [
        // [t entlang Länge 0..1, halbe Breite, Höhe der Sitzfläche]
        [0.0, 0.012, 0.01],
        [0.12, 0.018, 0.016],
        [0.3, 0.024, 0.02],
        [0.48, 0.034, 0.022],
        [0.62, 0.052, 0.024],
        [0.76, 0.072, 0.024],
        [0.88, 0.078, 0.02],
        [0.96, 0.068, 0.012],
        [1.0, 0.05, 0.004],
      ];
    const pos: number[] = [],
      push = (p: P3) => pos.push(p[0], p[1], p[2]);
    const N = 10,
      rings = prof.map(([t, hw, h]) => {
        const r: P3[] = [];
        for (let k = 0; k <= N; k++) {
          const a = Math.PI * (k / N); // Halbkreis oben
          r.push([-(t * L), h * Math.sin(a) * 0.9 + 0.004, hw * Math.cos(a)]);
        }
        for (let k = 0; k <= N; k++) {
          // flache Unterseite
          const a = Math.PI * (k / N);
          r.push([-(t * L), -0.012 * Math.sin(a) - 0.002, -hw * Math.cos(a)]);
        }
        return r;
      });
    const M = rings[0]!.length;
    for (let i = 0; i < rings.length - 1; i++)
      for (let k = 0; k < M; k++) {
        const a = rings[i]![k]!,
          b = rings[i]![(k + 1) % M]!,
          c = rings[i + 1]![(k + 1) % M]!,
          d = rings[i + 1]![k]!;
        push(a);
        push(d);
        push(c);
        push(a);
        push(c);
        push(b);
      }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
    geo.computeVertexNormals();
    const saddle = new Mesh(geo, MAT.black);
    saddle.position.set(KOPF[0] + 0.116, KOPF[1] + 0.025, 0);
    saddle.rotation.z = -0.068;
    part(saddle, 'sattel');
    // Sattelgestell: zwei Streben unter der Schale, geklemmt am Stützenkopf
    for (const s of SIDES) {
      rohr(
        off(KOPF, 0.085, 0.004, s * 0.022),
        off(KOPF, -0.085, 0.012, s * 0.022),
        0.0035,
        MAT.alu,
        'sattelgestell_' + sfx(s),
        8,
      );
      rohr(
        off(KOPF, 0.085, 0.004, s * 0.022),
        off(KOPF, 0.105, 0.02, s * 0.008),
        0.0035,
        MAT.alu,
        'sattelgestell_nase_' + sfx(s),
        8,
      );
      rohr(
        off(KOPF, -0.085, 0.012, s * 0.022),
        off(KOPF, -0.105, 0.03, s * 0.03),
        0.0035,
        MAT.alu,
        'sattelgestell_heck_' + sfx(s),
        8,
      );
    }
    slab(0.046, 0.026, 0.05, off(KOPF, 0, 0.004), MAT.ink, 'sattelklemmkopf');
  }

  /* ----------------------------------- Hinterbau: Schwinge mit liegendem Federbein
     Die Schwinge dreht hinter dem Tretlager; ihr oberer Arm läuft beidseitig am
     Sitzrohr vorbei und drückt vorn auf das Federbein unter dem Oberrohr.           */
  const LAGER = F(453, 667),
    AUGE = F(459.4, 505),
    DZ = 0.092; // Schwingenlager, Dämpferauge, Ausfallenden-Abstand
  for (const s of SIDES) {
    rohr(
      [REAR.x, REAR.y, s * DZ],
      off(AUGE, 0, 0, s * 0.045),
      0.017,
      MAT.ink,
      'schwinge_oben_' + sfx(s),
    );
    rohr(
      F(237, 668.4, s * DZ),
      off(LAGER, 0, 0, s * 0.04),
      0.0195,
      MAT.ink,
      'schwinge_unten_' + sfx(s),
    );
    rohr(
      off(AUGE, 0, 0, s * 0.045),
      off(LAGER, 0, 0, s * 0.04),
      0.013,
      MAT.ink,
      'schwinge_strebe_' + sfx(s),
    );
    slab(0.05, 0.085, 0.012, F(237, 648.5, s * DZ), MAT.ink, 'ausfallende_' + sfx(s), 0.2);
  }
  tube(off(LAGER, 0, 0, -0.055), off(LAGER, 0, 0, 0.055), 0.015, MAT.ink, 'schwingenlager');
  tube(
    off(AUGE, 0, 0, -0.058),
    off(AUGE, 0, 0, 0.058),
    0.01,
    MAT.alu,
    'daempferbolzen',
    undefined,
    12,
  );

  // Federbein, 165 mm Einbaulänge, zwischen Schwinge und Halter am Oberrohr
  const SH_A = AUGE,
    SH_B = F(558, 523);
  const lerp = (a: Punkt, b: Punkt, t: number): P3 => [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    0,
  ];
  rohr(F(546, 483), SH_B, 0.012, MAT.ink, 'daempferhalter');
  rohr(SH_B, F(628, 497), 0.009, MAT.ink, 'daempferhalter_strebe');
  tube(SH_A, SH_B, 0.008, MAT.alu, 'daempfer_kolbenstange');
  tube(lerp(SH_A, SH_B, 0.55), lerp(SH_A, SH_B, 0.95), 0.016, MAT.black, 'daempfer_koerper');
  {
    // Schraubenfeder
    const A = vec(SH_A),
      B = vec(SH_B),
      len = A.distanceTo(B) * 0.6,
      pts: Vector3[] = [];
    for (let i = 0; i <= 160; i++) {
      const t = i / 160,
        a = t * Math.PI * 2 * 7;
      pts.push(new Vector3(Math.cos(a) * 0.021, -len / 2 + t * len, Math.sin(a) * 0.021));
    }
    const spring = new Mesh(
      new TubeGeometry(new CatmullRomCurve3(pts), 200, 0.0045, 6, false),
      MAT.rust,
    );
    spring.position.copy(A).lerp(B, 0.42);
    spring.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), B.clone().sub(A).normalize());
    part(spring, 'daempferfeder');
  }

  /* ------------------------------------------- Antrieb: Mittelmotor, Akku, Kettenschaltung */
  disc(0.078, 0.105, F(516, 673), MAT.black, 'mittelmotor');
  disc(0.012, 0.2, BB, MAT.alu, 'tretlager', undefined, 16);
  slab(0.33, 0.1, 0.09, F(606, 602), MAT.black, 'akku', -0.16);
  slab(0.27, 0.03, 0.07, F(596, 639), MAT.black, 'akkuhalter', -0.16);
  disc(0.097, 0.004, off(BB, 0, 0, 0.064), MAT.alu, 'kettenblatt', undefined, 48);
  // Kettenschutz: schwarzer Ring mit fünf Armen vor dem Kettenblatt
  merged(
    [
      ring(0.082, 0.104, off(BB, 0, 0, 0.07)),
      ring(0.014, 0.036, off(BB, 0, 0, 0.07)),
      ...[0, 1, 2, 3, 4].map((k) => {
        const a = k * Math.PI * 0.4 + 0.3;
        return stab(
          off(BB, 0.03 * Math.cos(a), 0.03 * Math.sin(a), 0.07),
          off(BB, 0.088 * Math.cos(a + 0.35), 0.088 * Math.sin(a + 0.35), 0.07),
          0.007,
          null,
          6,
        );
      }),
    ],
    MAT.black,
    'kettenschutz',
  );
  // Kassette: acht abgestufte Ritzel, das größte innen; die Kette läuft auf dem fünften (Radius 0.055).
  // Vor jedem Ritzel sitzt ein dunkler Distanzring, 1,5 mm größer als das Ritzel: Er trennt die Stufen sichtbar.
  const ritzel = (dz0: number, dz1: number, dr: number) =>
    [...Array<undefined>(8)].map((_, k) =>
      stab(
        [REAR.x, REAR.y, 0.036 + k * 0.0048 + dz0],
        [REAR.x, REAR.y, 0.036 + k * 0.0048 + dz1],
        0.091 - k * 0.009 + dr,
        null,
        36,
      ),
    );
  merged(ritzel(0.0026, 0.0048, 0), MAT.alu, 'kassette');
  merged(ritzel(0, 0.0026, 0.0015), MAT.black, 'kassette_distanzringe');
  // Schaltwerk mit zwei Röllchen, Kette in vier Abschnitten
  const ROLLE_O = F(224, 706, 0.06),
    ROLLE_U = F(232, 766, 0.06);
  slab(0.05, 0.06, 0.03, F(224, 676, 0.08), MAT.black, 'schaltwerk');
  disc(0.022, 0.01, ROLLE_O, MAT.black, 'schaltroellchen_oben', undefined, 16);
  disc(0.022, 0.01, ROLLE_U, MAT.black, 'schaltroellchen_unten', undefined, 16);
  tube(
    off(ROLLE_O, 0, 0, 0.008),
    off(ROLLE_U, 0, 0, 0.008),
    0.006,
    MAT.black,
    'schaltwerk_kaefig',
    undefined,
    8,
  );
  tube(
    off(BB, 0, 0.097, 0.064),
    [REAR.x, REAR.y + 0.057, 0.058],
    0.005,
    MAT.alu,
    'kette_oben',
    undefined,
    8,
  );
  tube(
    off(BB, 0, -0.097, 0.064),
    off(ROLLE_U, 0, -0.022),
    0.005,
    MAT.alu,
    'kette_unten',
    undefined,
    8,
  );
  tube(
    off(ROLLE_U, -0.022, 0),
    off(ROLLE_O, -0.022, 0),
    0.005,
    MAT.alu,
    'kette_kaefig',
    undefined,
    8,
  );
  tube(
    off(ROLLE_O, 0.022, 0),
    [REAR.x + 0.04, REAR.y - 0.04, 0.058],
    0.005,
    MAT.alu,
    'kette_ruecklauf',
    undefined,
    8,
  );
  // Kurbeln 170 mm, rechte Kurbel zeigt nach vorn oben wie im Foto
  const KD: P2 = [0.1414, 0.0943];
  rohr(off(BB, 0, 0, 0.09), off(BB, KD[0], KD[1], 0.09), 0.013, MAT.rust, 'kurbel_rechts');
  rohr(off(BB, 0, 0, -0.09), off(BB, -KD[0], -KD[1], -0.09), 0.013, MAT.rust, 'kurbel_links');
  slab(0.095, 0.02, 0.09, off(BB, KD[0], KD[1], 0.145), MAT.black, 'pedal_rechts');
  slab(0.095, 0.02, 0.09, off(BB, -KD[0], -KD[1], -0.145), MAT.black, 'pedal_links');

  /* ---------------------------------------------------- Vorbau und Lenker
     Verstellbarer Vorbau mit Gelenk auf der Lenksäule, gerader Lenker mit 9° Kröpfung. */
  const BAR = F(712, 208);
  disc(0.03, 0.06, F(706, 405), MAT.black, 'vorbaugelenk', undefined, 24);
  bogen(
    [F(707, 405), F(709, 350), F(718, 300), F(724, 250), F(718, 212)],
    0.019,
    MAT.black,
    'vorbau',
    32,
    14,
  );
  slab(0.05, 0.042, 0.055, BAR, MAT.black, 'vorbauklemme');
  {
    const halb: P3[] = [
      [0, 0, 0],
      [0, 0, 0.07],
      [-0.002, 0.002, 0.15],
      [-0.007, 0.004, 0.24],
      [-0.013, 0.006, 0.31],
    ]; // rechte Hälfte, relativ zur Klemmung
    bogen(
      [
        ...halb
          .slice(1)
          .reverse()
          .map((p) => off(BAR, p[0], p[1], -p[2])),
        ...halb.map((p) => off(BAR, p[0], p[1], p[2])),
      ],
      0.0115,
      MAT.alu,
      'lenker',
      64,
      12,
    );
    for (const s of SIDES) {
      rohr(
        off(BAR, -0.005, 0.003, s * 0.2),
        off(BAR, -0.013, 0.006, s * 0.31),
        0.0165,
        MAT.black,
        'griff_' + sfx(s),
        20,
      );
      slab(
        0.04,
        0.012,
        0.034,
        off(BAR, -0.026, 0, s * 0.275),
        MAT.black,
        'griff_fluegel_' + sfx(s),
      ).rotation.y = -s * 0.07;
      // Bremsgriff: Geber am Lenker, Hebel nach vorn unten
      slab(
        0.045,
        0.02,
        0.018,
        off(BAR, 0.012, -0.006, s * 0.175),
        MAT.black,
        'bremsgeber_' + sfx(s),
      );
      rohr(
        off(BAR, 0.03, -0.012, s * 0.175),
        off(BAR, 0.07, -0.04, s * 0.25),
        0.006,
        MAT.alu,
        'bremshebel_' + sfx(s),
        10,
      );
      // Bremsleitung hinunter zum Vorbaugelenk
      bogen(
        [
          off(BAR, 0.04, -0.03, s * 0.165),
          F(737, 255, s * 0.08),
          F(722, 300, s * 0.045),
          F(712, 350, s * 0.035),
          F(709, 398, s * 0.03),
        ],
        0.005,
        MAT.black,
        'bremsleitung_' + sfx(s),
        32,
        6,
      );
    }
    slab(0.03, 0.02, 0.045, off(BAR, 0.012, -0.018, 0.14), MAT.black, 'schalthebel');
    slab(0.03, 0.02, 0.05, off(BAR, 0.002, 0.012, -0.09), MAT.black, 'bedieneinheit_links');
    slab(0.04, 0.012, 0.05, off(BAR, 0.024, 0.03), MAT.black, 'display', 0.3);
    tube(
      off(BAR, -0.002, 0.012, -0.14),
      off(BAR, -0.002, 0.036, -0.14),
      0.012,
      MAT.alu,
      'klingel',
      undefined,
      16,
    );
  }

  /* --------------------------------- Ladefläche: Rahmen des Load 60
     Bodenholme eng (Ladebreite 40 cm), Reling weiter außen. Zwei Streben je Seite,
     vorn ein A-förmiger Bug, dessen Beine am Steuerrohr zusammenlaufen.             */
  const ZL = 0.225,
    ZU = 0.26; // halber Abstand der Bodenholme und der Reling
  // Bug je Seite: Fuß am Bodenholm, Relinganschluss, Knick, Steuerrohr
  const BUG: readonly [P3, P3, P3, P3] = [
    F(1119, 668, ZL),
    F(1146, 585, ZU),
    F(1173.6, 519.5, 0.25),
    F(1197, 441, 0.03),
  ];
  const seite = (p: P3, s: number): P3 => [p[0], p[1], s * p[2]];
  for (const s of SIDES) {
    rohr(F(738, 509.5, s * ZU), seite(BUG[1], s), 0.023, MAT.rust, 'reling_' + sfx(s));
    slab(0.585, 0.068, 0.032, F(936.5, 658.6, s * ZL), MAT.ink, 'bodenholm_' + sfx(s));
    rohr(F(824.2, 642, s * ZL), F(882.3, 554.5, s * ZU), 0.02, MAT.ink, 'strebe_hinten_' + sfx(s));
    rohr(F(811, 642, s * ZL), F(868, 553, s * ZU), 0.012, MAT.ink, 'strebe_hinten_blech_' + sfx(s)); // Lasche für Seitenwände
    rohr(F(1025.3, 642, s * ZL), F(971.8, 570, s * ZU), 0.02, MAT.ink, 'strebe_vorn_' + sfx(s));
    rohr(seite(BUG[0], s), seite(BUG[1], s), 0.025, MAT.ink, 'bug_unten_' + sfx(s));
    rohr(seite(BUG[1], s), seite(BUG[2], s), 0.023, MAT.ink, 'bug_mitte_' + sfx(s));
    rohr(seite(BUG[2], s), seite(BUG[3], s), 0.023, MAT.ink, 'bug_oben_' + sfx(s));
    tube(
      F(748.5, 666.9, s * ZL),
      F(753.5, 666.9, s * ZL),
      0.016,
      MAT.rot,
      'rueckstrahler_' + sfx(s),
      undefined,
      20,
    );
  }
  rohr(F(738, 509.5, -ZU), F(738, 509.5, ZU), 0.023, MAT.rust, 'reling_hinten');
  rohr(F(757, 658.6, -ZL), F(757, 658.6, ZL), 0.03, MAT.ink, 'quertraeger_hinten');
  rohr(seite(BUG[0], -1), seite(BUG[0], 1), 0.025, MAT.ink, 'quertraeger_vorn');
  slab(0.57, 0.012, 0.42, F(936, 648.6), MAT.deck, 'ladeboden');

  // Zweibeinständer, hochgeklappt unter der Ladefläche
  tube(
    F(864.4, 691.3, -ZL),
    F(864.4, 691.3, ZL),
    0.009,
    MAT.black,
    'staender_achse',
    undefined,
    10,
  );
  slab(0.07, 0.04, 0.3, F(868, 701), MAT.black, 'staender_gelenk');
  for (const s of SIDES) {
    rohr(
      F(864.4, 691.3, s * 0.13),
      F(705.6, 700.2, s * 0.13),
      0.011,
      MAT.black,
      'staender_bein_' + sfx(s),
    );
    tube(
      F(705.6, 700.2, s * 0.108),
      F(705.6, 700.2, s * 0.152),
      0.016,
      MAT.black,
      'staender_fuss_' + sfx(s),
      undefined,
      16,
    );
    slab(0.05, 0.032, 0.006, F(864.4, 684, s * (ZL - 0.02)), MAT.ink, 'staender_lasche_' + sfx(s));
  }

  /* --------------------------------------------- Vorderbau: Steuerrohr, Federgabel, Lenkgestänge */
  tube(F(1198, 413), F(1220, 465), 0.024, MAT.ink, 'steuerrohr', undefined, 24);
  rohr(F(1199, 446), F(1208, 492), 0.022, MAT.ink, 'steuerrohr_knoten');
  tube(F(1195, 406), F(1198, 413), 0.016, MAT.black, 'steuersatz_kappe', undefined, 16);
  tube(F(1220, 465), F(1232, 491), 0.027, MAT.black, 'steuersatz_unten', undefined, 24);
  slab(0.06, 0.036, 0.2, F(1241, 500), MAT.black, 'gabelkrone', -0.44);
  for (const s of SIDES) {
    // Tauchrohre laufen hinter der Achse aus, das Ausfallende greift nach vorn
    tube(F(1252, 505, s * 0.075), F(1277.5, 568, s * 0.075), 0.016, MAT.alu, 'standrohr_' + sfx(s));
    rohr(
      F(1271, 555, s * 0.075),
      F(1329.4, 684.5, s * 0.075),
      0.024,
      MAT.black,
      'tauchrohr_' + sfx(s),
    );
    rohr(
      F(1327, 679, s * 0.075),
      [FRONT.x, FRONT.y, s * 0.075],
      0.016,
      MAT.black,
      'gabelausfallende_' + sfx(s),
    );
  }
  slab(0.035, 0.07, 0.03, F(1287, 668, -0.05), MAT.black, 'bremssattel_vorn', -0.44);
  tube(F(1238, 468), F(1250, 452), 0.006, MAT.alu, 'scheinwerferhalter', undefined, 8);
  slab(0.04, 0.05, 0.05, F(1270, 445), MAT.black, 'scheinwerfer');
  tube(F(1281, 445), F(1283, 445), 0.02, MAT.alu, 'scheinwerfer_linse', undefined, 24);

  // Gestängelenkung rechts unter dem Ladeboden: Hebel an der Lenksäule, Stange nach vorn,
  // Platte und Lenkhebel hinauf zur Gabelkrone
  const LZ = 0.095;
  rohr(F(733, 690), F(735.2, 708.9, LZ), 0.009, MAT.black, 'lenkhebel_hinten', 10);
  bogen(
    [F(735.2, 708.9, LZ), F(878.7, 725, LZ), F(1010, 716, LZ), F(1146, 701, LZ)],
    0.011,
    MAT.black,
    'lenkgestaenge',
    32,
    8,
  );
  slab(0.132, 0.008, 0.035, F(1174.7, 672.5, LZ), MAT.alu, 'lenkplatte', 0.749);
  bogen(
    [F(1238.1, 507.9, LZ), F(1223.2, 559.4, LZ), F(1208.4, 608.9, LZ), F(1203.4, 643.6, LZ)],
    0.011,
    MAT.black,
    'lenkhebel',
    24,
    10,
  );

  /* ============================ Transportbox (Form der MoreCargoBike-Box) =====
     Aus dem Rahmen abgeleitet und ohne Luft darin: auf dem Ladeboden, hinten an Lenksäule und
     Vorbaugelenk, vorn am Bug; die Seitenwände folgen der Reling. Der Korpus ist rundum geschlossen. */
  const boxWhite = new MeshStandardMaterial({
    name: 'box_papier',
    color: 0xf6f7f4,
    roughness: 0.36,
    metalness: 0.03,
  });

  const BY = F(0, 648.6)[1] + 0.0063; // Boden auf dem Ladeboden
  const H = 0.475,
    UEB = 0.008; // Korpushöhe bis zur Deckelfuge, Deckelüberstand
  const Z0 = ZL - 0.016,
    Z1 = ZU - 0.023; // halbe Breite: zwischen den Bodenholmen, an der Reling
  // x der Vorder- (seite = 1) oder Rückseite (-1) eines Rohrs a–b mit Radius r in Höhe y
  const rohrKante = (a: Punkt, b: Punkt, r: number, y: number, seite: number) => {
    const m = (b[0] - a[0]) / (b[1] - a[1]);
    return a[0] + (y - a[1]) * m + seite * r * Math.hypot(1, m);
  };
  // Rückwand: eine ebene, leicht geneigte Fläche, die unten an der Lenksäule und oben am
  // Vorbaugelenk anliegt. Die hintere Reling liegt in einer Aussparung der Rückwand.
  const GELENK = F(706, 405);
  const BX = rohrKante(F(703, 428), F(733, 690), 0.022, BY, 1); // hintere Unterkante
  const RS = (GELENK[0] + 0.03 - BX) / (GELENK[1] - BY); // Neigung der Rückwand (x je Höhe)
  const XF0 = F(936, 0)[0] + 0.285 + 0.001 - BX; // Frontkante am Boden: 1 mm vor dem Ladeboden
  const XN = rohrKante(BUG[2], BUG[3], 0.023, BUG[3][1], -1) - BX,
    YN = BUG[3][1] - BY; // Nase auf Höhe der Bugspitze
  const XT = XN - 0.03; // Frontkante am Deckel
  // Knick der Seitenwand entlang der Reling-Innenkante: hinten hoch, vorn tief
  const RELING: readonly [P3, P3] = [F(738, 509.5), BUG[1]];
  const knickY = (x: number) =>
    RELING[0][1] -
    BY +
    ((RELING[1][1] - RELING[0][1]) * (BX + x - RELING[0][0])) / (RELING[1][0] - RELING[0][0]);
  const yR = knickY(0) / (1 - RS * (knickY(1) - knickY(0))); // Knickhöhe an der Rückwand
  const bF = (XN - XF0) / YN,
    yK = (knickY(0) + (knickY(1) - knickY(0)) * XF0) / (1 - (knickY(1) - knickY(0)) * bF); // und an der Front
  const XK = XF0 + bF * yK;

  {
    const pos: number[] = [];
    // Ecken von außen gesehen gegen den Uhrzeigersinn, damit die Fläche nach außen zeigt
    const tri = (a: P3, b: P3, c: P3) => {
      for (const p of [a, b, c]) pos.push(p[0], p[1], p[2]);
    };
    const quad = (a: P3, b: P3, c: P3, d: P3) => {
      tri(a, b, c);
      tri(a, c, d);
    };
    const kante = (f: (t: number) => P3) => [...Array<undefined>(13)].map((_, i) => f(i / 12));
    const xHinten = (y: number) => RS * y;
    quad([0, 0, -Z0], [XF0, 0, -Z0], [XF0, 0, Z0], [0, 0, Z0]); // Boden
    quad([xHinten(H), H, -Z1], [xHinten(H), H, Z1], [XT, H, Z1], [XT, H, -Z1]); // Oberseite unter dem Deckel
    quad([0, 0, -Z0], [0, 0, Z0], [xHinten(yR), yR, Z1], [xHinten(yR), yR, -Z1]); // Rückwand bis zum Knick
    quad([xHinten(yR), yR, -Z1], [xHinten(yR), yR, Z1], [xHinten(H), H, Z1], [xHinten(H), H, -Z1]);
    quad([XF0, 0, Z0], [XF0, 0, -Z0], [XK, yK, -Z1], [XK, yK, Z1]); // Front bis zum Knick
    quad([XK, yK, Z1], [XK, yK, -Z1], [XN, YN, -Z1], [XN, YN, Z1]); // Front bis zur Nase
    quad([XN, YN, Z1], [XN, YN, -Z1], [XT, H, -Z1], [XT, H, Z1]); // Band mit dem Schloss
    for (const s of SIDES) {
      const wand = s > 0 ? tri : (a: P3, b: P3, c: P3) => tri(c, b, a); // gespiegelte Seite: Umlaufsinn drehen
      // unterer Teil: von der Bodenholm-Kante zum Knick an der Reling, mit der Reling leicht verwunden
      const unten = kante((t) => [xHinten(0) + t * XF0, 0, s * Z0]);
      const knick = kante((t) => {
        const y = yR + (yK - yR) * t,
          x0 = xHinten(y),
          x1 = XF0 + bF * y;
        return [x0 + t * (x1 - x0), y, s * Z1];
      });
      for (let i = 0; i < 12; i++) {
        wand(unten[i]!, unten[i + 1]!, knick[i + 1]!);
        wand(unten[i]!, knick[i + 1]!, knick[i]!);
      }
      // oberer Teil: senkrecht von der Reling bis unter den Deckel, als Fächer um die hintere obere Ecke
      const oben: P3[] = [...knick, [XN, YN, s * Z1], [XT, H, s * Z1]],
        ecke: P3 = [xHinten(H), H, s * Z1];
      for (let i = 0; i < oben.length - 1; i++) wand(ecke, oben[i]!, oben[i + 1]!);
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
    geo.computeVertexNormals();
    const box = new Mesh(geo, boxWhite);
    box.position.set(BX, BY, 0);
    part(box, 'transportbox_korpus');
  }

  const bxAt = (lx: number, ly: number): P2 => [BX + lx, BY + ly];

  // Leiste unter der Frontkante: reicht vor dem Ladeboden hinunter bis auf den vorderen Querträger
  const LH = BY - BUG[0][1] - Math.sqrt(0.025 ** 2 - (BUG[0][0] - BX - XF0) ** 2) + 0.001;
  slab(0.004, LH, 2 * Z0, [...bxAt(XF0 - 0.002, -LH / 2), 0], boxWhite, 'box_frontleiste');

  // Deckel: 35 mm stark, steht vorn und seitlich 8 mm über und schließt hinten bündig ab.
  // Zwischen Korpus und Deckel sitzt eine 5 mm hohe, zurückgesetzte Fuge als Schattenlinie.
  const LID = XT + UEB - RS * H,
    LIDX = (RS * H + XT + UEB) / 2;
  slab(LID, 0.035, 2 * (Z1 + UEB), [...bxAt(LIDX, H + 0.0225), 0], boxWhite, 'box_deckel');
  slab(
    XT - RS * H - 0.012,
    0.005,
    2 * Z1 - 0.012,
    [...bxAt((RS * H + XT) / 2, H + 0.0025), 0],
    MAT.black,
    'box_deckelfuge',
  );
  tube(
    [...bxAt(RS * H + 0.011, H + 0.0025), -Z1 + 0.02],
    [...bxAt(RS * H + 0.011, H + 0.0025), Z1 - 0.02],
    0.009,
    MAT.ink,
    'box_scharnier',
  );
  // Schloss auf dem oberen Frontband, in Fahrtrichtung links
  const XS = XN - (0.03 * (0.4 - YN)) / (H - YN); // Frontkante in Höhe des Schlosses
  slab(0.014, 0.052, 0.052, [...bxAt(XS + 0.006, 0.4), -0.15], MAT.ink, 'box_schloss', 0.206);
  tube(
    [...bxAt(XS + 0.011, 0.4), -0.15],
    [...bxAt(XS + 0.021, 0.398), -0.15],
    0.009,
    MAT.alu,
    'box_schliesszylinder',
    undefined,
    16,
  );

  // Wortmarke „Own Motion" mit Unterzeile, farbig auf Papier: eine Textur für beide Seiten und
  // den Deckel. Die Papierfläche der Textur hat dieselbe Oberfläche wie die Box und geht nahtlos über.
  const AR = logoImg && logoImg.naturalWidth ? logoImg.naturalWidth / logoImg.naturalHeight : 0;
  if (AR && logoImg) {
    const cv = document.createElement('canvas');
    cv.width = 1024;
    cv.height = Math.round(1024 / AR);
    const g = cv.getContext('2d')!;
    g.fillStyle = '#f6f7f4';
    g.fillRect(0, 0, cv.width, cv.height);
    g.drawImage(logoImg, cv.width * 0.02, cv.height * 0.02, cv.width * 0.96, cv.height * 0.96);
    const t = new CanvasTexture(cv);
    t.colorSpace = SRGBColorSpace;
    t.anisotropy = 8;
    const wortmarke = new MeshStandardMaterial({
      name: 'wortmarke',
      color: 0xffffff,
      roughness: 0.36,
      metalness: 0.03,
      map: t,
    });
    // Fläche mit einer Wortmarke der Breite w
    const logo = (w: number, name: string) =>
      part(new Mesh(new PlaneGeometry(w / 0.96, w / AR / 0.96), wortmarke), name);
    for (const s of SIDES) {
      // seitlich, oberhalb der Reling
      const p = logo(0.86 * 0.128 * AR, 'werbeflaeche_' + (s > 0 ? 'rechts' : 'links'));
      p.position.set(BX + LIDX, BY + 0.398, s * (Z1 + 0.0008));
      if (s < 0) p.rotation.y = Math.PI;
    }
    // auf dem Deckel: u läuft entlang x, v nach −z; Marke von der Antriebsseite (+z) lesbar
    const d = logo(0.7 * LID, 'werbeflaeche_deckel');
    d.position.set(BX + LIDX, BY + H + 0.0408, 0);
    d.rotation.x = -Math.PI / 2;
  }

  if (bauteile) {
    /* Unsichtbare Trefferflächen: Dünne Teile lassen sich so sicher antippen. Sie werden nie
       gezeichnet und werfen keinen Schatten, zählen aber beim Antippen und beim Umriss ihres Bauteils. */
    model.updateMatrixWorld(true);
    const unsichtbar: Record<string, Stoff> = {};
    const treffer = (zone: string, geo: BufferGeometry, mitte: P3) => {
      const m = new Mesh(
        geo,
        (unsichtbar[zone] ??= new MeshStandardMaterial({
          name: zone + '|trefferflaeche',
          visible: false,
        })),
      );
      m.position.set(...mitte);
      m.name = 'trefferflaeche_' + zone;
      m.userData = { zone, trefferflaeche: true };
      model.add(m);
      return m;
    };
    // Kasten um alle Teile, deren Name passt, mit etwas Rand
    const kasten = (zone: string, regel: RegExp, rand: number) => {
      const b = new Box3();
      model.traverse((o) => {
        if (istTeil(o) && regel.test(o.name)) b.expandByObject(o, true);
      });
      const g = b.expandByScalar(rand).getSize(new Vector3());
      const c = b.getCenter(new Vector3());
      treffer(zone, new BoxGeometry(g.x, g.y, g.z), [c.x, c.y, c.z]);
    };
    // Scheibe über den Speichen, zwischen Nabe und Felge
    for (const [zone, w] of [
      ['laufrad-hinten', REAR],
      ['laufrad-vorne', FRONT],
    ] as const) {
      treffer(zone, new CylinderGeometry(w.r - 2 * TB, w.r - 2 * TB, 0.04, 32), [
        w.x,
        w.y,
        0,
      ]).rotation.x = Math.PI / 2;
    }
    for (const s of ['r', 'l']) {
      kasten('bremsgriffe', new RegExp('^(bremsgeber|bremshebel)_' + s), 0.02);
    }
    kasten('klingel', /^klingel/, 0.025);
    kasten('lenkung', /^lenkgestaenge/, 0.025);
    kasten('licht-vorne', /^scheinwerfer/, 0.02);
    kasten('licht-hinten', /^ruecklicht/, 0.025);
    kasten('staender', /^staender_/, 0.01);
    // Gepäckträger: Das Rad hat keinen. Die Fläche über dem hinteren Schutzblech hält das Bauteil antippbar.
    treffer('gepaecktraeger', new BoxGeometry(0.4, 0.06, 0.14), [
      REAR.x - 0.05,
      REAR.y + REAR.r + 0.07,
      0,
    ]);

    // Eigene Materialien je Bauteil: Leuchtet eines, bleiben die anderen unverändert
    const eigen = new Map<string, Stoff>();
    model.traverse((o) => {
      if (!istTeil(o) || o.userData.trefferflaeche) return;
      const key = `${String(o.userData.zone)}|${o.material.name}`;
      if (!eigen.has(key)) eigen.set(key, Object.assign(o.material.clone(), { name: key }));
      o.material = eigen.get(key)!;
    });
    Object.values(MAT).forEach((m) => m.dispose());
  }

  return merge ? verschmelzen(model) : model;
}

// Für die reine Anzeige: alle Teile mit gleichem Material werden ein Mesh. Form, Farben und
// Schatten bleiben gleich, die Grafikkarte bekommt aber nur noch einen Auftrag je Material.
function verschmelzen(model: Group): Group {
  model.updateMatrixWorld(true);
  const jeMaterial = new Map<Stoff, Teil[]>();
  model.traverse((o) => {
    if (istTeil(o)) jeMaterial.set(o.material, [...(jeMaterial.get(o.material) || []), o]);
  });
  const ganz = new Group();
  ganz.name = model.name;
  const v = new Vector3(),
    drehung = new Matrix3();
  for (const [mat, teile] of jeMaterial) {
    const ecken = teile.reduce((n, t) => n + t.geometry.getAttribute('position').count, 0);
    const pos = new Float32Array(ecken * 3),
      nor = new Float32Array(ecken * 3);
    const uv = mat.map ? new Float32Array(ecken * 2) : null,
      index: number[] = [];
    let start = 0;
    for (const { geometry: g, matrixWorld } of teile) {
      const gp = g.getAttribute('position'),
        gn = g.getAttribute('normal');
      drehung.getNormalMatrix(matrixWorld);
      for (let i = 0; i < gp.count; i++) {
        v.fromBufferAttribute(gp, i)
          .applyMatrix4(matrixWorld)
          .toArray(pos, (start + i) * 3);
        v.fromBufferAttribute(gn, i)
          .applyMatrix3(drehung)
          .normalize()
          .toArray(nor, (start + i) * 3);
      }
      if (uv) uv.set(g.getAttribute('uv').array, start * 2);
      if (g.index) for (let i = 0; i < g.index.count; i++) index.push(start + g.index.getX(i));
      else for (let i = 0; i < gp.count; i++) index.push(start + i);
      start += gp.count;
      g.dispose();
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(pos, 3));
    geo.setAttribute('normal', new BufferAttribute(nor, 3));
    if (uv) geo.setAttribute('uv', new BufferAttribute(uv, 2));
    geo.setIndex(index);
    const mesh = new Mesh(geo, mat);
    mesh.name = mat.name;
    // Bauteil nur übernehmen, wenn alle zusammengefassten Teile dasselbe haben (Option bauteile)
    const { zone, trefferflaeche } = teile[0]!.userData;
    if (teile.every((t) => t.userData.zone === zone)) mesh.userData.zone = zone;
    if (trefferflaeche) mesh.userData.trefferflaeche = true;
    ganz.add(mesh);
  }
  return ganz;
}

/** Gibt frei, was buildLastenrad auf der Grafikkarte angelegt hat, sobald das Modell nicht mehr gezeigt wird. */
export function disposeLastenrad(model: Object3D): void {
  model.traverse((o) => {
    if (!istTeil(o)) return;
    o.geometry.dispose();
    o.material.map?.dispose();
    o.material.dispose();
  });
}
