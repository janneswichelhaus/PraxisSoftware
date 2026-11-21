import type { ZoneKey } from './zones';

/**
 * Welche Teile des 3D-Modells zu welchem Bauteil gehören (ANN-870). Das Modell zeigt eine Kette;
 * sie zählt als „Riemen und Riemenscheiben“. Einen Gepäckträger hat es nicht.
 */

const beide = (...namen: string[]) => namen.flatMap((name) => [`${name}_r`, `${name}_l`]);

export const TEILE_JE_BAUTEIL: Record<ZoneKey, readonly string[]> = {
  'reifen-vorne': ['vorderrad_reifen'],
  'reifen-hinten': ['hinterrad_reifen'],
  'laufrad-vorne': ['vorderrad_felge', 'vorderrad_speichen', 'vorderrad_nabe', 'vorderrad_achse'],
  'laufrad-hinten': ['hinterrad_felge', 'hinterrad_speichen', 'hinterrad_achse'],
  'bremse-vorne': ['vorderrad_bremsscheibe', 'bremssattel_vorn'],
  'bremse-hinten': ['hinterrad_bremsscheibe'],
  bremsgriffe: beide('bremsgeber', 'bremshebel', 'bremsleitung'),
  riemen: [
    'kette_oben',
    'kette_unten',
    'kette_kaefig',
    'kette_ruecklauf',
    'kettenblatt',
    'kettenschutz',
    'kassette',
    'kassette_distanzringe',
  ],
  nabenschaltung: [
    'hinterrad_nabe',
    'schaltwerk',
    'schaltwerk_kaefig',
    'schaltroellchen_oben',
    'schaltroellchen_unten',
    'schalthebel',
  ],
  kurbeln: ['kurbel_rechts', 'kurbel_links', 'pedal_rechts', 'pedal_links', 'tretlager'],
  motor: ['mittelmotor'],
  akku: ['akku', 'akkuhalter'],
  'licht-vorne': ['scheinwerfer', 'scheinwerfer_linse', 'scheinwerferhalter'],
  'licht-hinten': ['ruecklicht', 'ruecklicht_glas'],
  sattel: [
    'sattel',
    'sattelstuetze',
    'sattelstuetze_huelse',
    'sattelklemme',
    'sattelklemmkopf',
    ...beide('sattelgestell', 'sattelgestell_nase', 'sattelgestell_heck'),
  ],
  klingel: ['klingel'],
  'schutzblech-vorne': ['schutzblech_vorn', 'spritzlappen', ...beide('schutzblech_vorn_strebe_1')],
  'schutzblech-hinten': [
    'schutzblech_hinten',
    'schutzblechhalter',
    ...beide('schutzblech_hinten_strebe_1', 'schutzblech_hinten_strebe_2'),
  ],
  staender: [
    'staender_achse',
    'staender_gelenk',
    ...beide('staender_bein', 'staender_fuss', 'staender_lasche'),
  ],
  transportbox: [
    'transportbox_korpus',
    'box_frontleiste',
    'box_deckel',
    'box_deckelfuge',
    'box_scharnier',
    'box_schloss',
    'box_schliesszylinder',
    'werbeflaeche_rechts',
    'werbeflaeche_links',
    'werbeflaeche_deckel',
  ],
  rahmen: [
    'sitzrohr',
    'sitzrohr_unten',
    'oberrohr',
    'oberrohr_strebe',
    'lenksaeule',
    'haupttraeger',
    'motorhalter',
    'schwingenlager',
    'steuerrohr',
    'steuerrohr_knoten',
    'steuersatz_kappe',
    'steuersatz_unten',
    'reling_hinten',
    'quertraeger_hinten',
    'quertraeger_vorn',
    'ladeboden',
    ...beide(
      'schwinge_oben',
      'schwinge_unten',
      'schwinge_strebe',
      'ausfallende',
      'reling',
      'bodenholm',
      'strebe_hinten',
      'strebe_hinten_blech',
      'strebe_vorn',
      'bug_unten',
      'bug_mitte',
      'bug_oben',
      'rueckstrahler',
    ),
  ],
  lenker: ['lenker', 'vorbau', 'vorbaugelenk', 'vorbauklemme', ...beide('griff', 'griff_fluegel')],
  display: ['display', 'bedieneinheit_links'],
  lenkung: ['lenkhebel_hinten', 'lenkgestaenge', 'lenkplatte', 'lenkhebel'],
  gabel: ['gabelkrone', ...beide('standrohr', 'tauchrohr', 'gabelausfallende')],
  daempfer: [
    'daempferbolzen',
    'daempferhalter',
    'daempferhalter_strebe',
    'daempfer_kolbenstange',
    'daempfer_koerper',
    'daempferfeder',
  ],
  gepaecktraeger: [],
};

const BAUTEIL_JE_TEIL = new Map<string, ZoneKey>(
  (Object.entries(TEILE_JE_BAUTEIL) as [ZoneKey, readonly string[]][]).flatMap(([zone, teile]) =>
    teile.map((teil): [string, ZoneKey] => [teil, zone]),
  ),
);

/** Das Bauteil, zu dem ein Teil des Modells gehört. */
export function bauteilVonTeil(teil: string): ZoneKey | null {
  return BAUTEIL_JE_TEIL.get(teil) ?? null;
}
