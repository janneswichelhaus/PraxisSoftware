/**
 * Mitgelieferte Rezepte (ADR-027 Punkt 14): Inhalt im Lieferumfang, kein Datenmodell. Eine
 * Zutat nennt Suchbegriff und Menge; die Werte kommen beim Übernehmen aus dem Katalog der Praxis.
 */
export interface Startzutat {
  /** Suchbegriff im Katalog; im Seed genau der Name eines Lebensmittels. */
  suche: string;
  /** In g bzw. ml - gilt, wenn das gefundene Lebensmittel die Portion nicht kennt. */
  menge: number;
  portion?: { label: string; anzahl: number };
}

export interface Startrezept {
  schluessel: string;
  name: string;
  portionen: number;
  zutaten: readonly Startzutat[];
  zubereitung: string;
}

const p = (label: string, anzahl = 1) => ({ label, anzahl });

export const STARTREZEPTE: readonly Startrezept[] = [
  {
    schluessel: 'haferbrei-beeren',
    name: 'Haferbrei mit Beeren',
    portionen: 2,
    zutaten: [
      { suche: 'Haferflocken', menge: 80 },
      { suche: 'Milch 1,5 % Fett', menge: 400, portion: p('1 Glas', 2) },
      { suche: 'Heidelbeeren roh', menge: 120, portion: p('1 Handvoll', 2) },
      { suche: 'Honig', menge: 8, portion: p('1 Teelöffel') },
    ],
    zubereitung:
      'Haferflocken mit der Milch aufkochen und bei kleiner Hitze drei Minuten quellen lassen. In zwei Schalen füllen, Beeren und Honig darüber geben.',
  },
  {
    schluessel: 'hafer-ueber-nacht-apfel',
    name: 'Über-Nacht-Hafer mit Apfel',
    portionen: 1,
    zutaten: [
      { suche: 'Haferflocken', menge: 50, portion: p('1 Portion') },
      { suche: 'Joghurt natur 1,5 % Fett', menge: 150, portion: p('1 Becher') },
      { suche: 'Milch 1,5 % Fett', menge: 100 },
      { suche: 'Apfel roh', menge: 150, portion: p('1 Stück (mittel)') },
      { suche: 'Walnüsse', menge: 15 },
    ],
    zubereitung:
      'Haferflocken, Joghurt und Milch verrühren und abgedeckt über Nacht kühl stellen. Morgens den Apfel reiben und mit den gehackten Walnüssen unterheben.',
  },
  {
    schluessel: 'quark-erdbeeren-leinsamen',
    name: 'Quark mit Erdbeeren und Leinsamen',
    portionen: 1,
    zutaten: [
      { suche: 'Magerquark', menge: 250, portion: p('1 Becher') },
      { suche: 'Milch 1,5 % Fett', menge: 40, portion: p('1 Schuss', 2) },
      { suche: 'Erdbeeren roh', menge: 150 },
      { suche: 'Leinsamen', menge: 10, portion: p('1 Esslöffel') },
    ],
    zubereitung:
      'Quark mit der Milch glatt rühren. Erdbeeren klein schneiden und mit den Leinsamen darauf geben.',
  },
  {
    schluessel: 'vollkornbrot-ei-tomate',
    name: 'Vollkornbrot mit Ei und Tomate',
    portionen: 1,
    zutaten: [
      { suche: 'Vollkornbrot', menge: 100, portion: p('1 Scheibe', 2) },
      { suche: 'Butter', menge: 5, portion: p('1 Teelöffel') },
      { suche: 'Hühnerei gekocht', menge: 55, portion: p('1 Stück (M)') },
      { suche: 'Tomate roh', menge: 80, portion: p('1 Stück (mittel)') },
    ],
    zubereitung:
      'Brot dünn mit Butter bestreichen. Ei und Tomate in Scheiben schneiden, darauf legen, nach Geschmack salzen und pfeffern.',
  },
  {
    schluessel: 'ruehrei-spinat',
    name: 'Rührei mit Spinat und Vollkornbrot',
    portionen: 2,
    zutaten: [
      { suche: 'Hühnerei gekocht', menge: 220, portion: p('1 Stück (M)', 4) },
      { suche: 'Spinat gekocht', menge: 150, portion: p('1 Portion') },
      { suche: 'Rapsöl', menge: 10, portion: p('1 Esslöffel') },
      { suche: 'Vollkornbrot', menge: 100, portion: p('1 Scheibe', 2) },
    ],
    zubereitung:
      'Spinat in einer Pfanne mit dem Öl kurz andünsten. Eier verquirlen, dazugeben und unter Rühren stocken lassen. Mit dem Brot servieren.',
  },
  {
    schluessel: 'muesli-joghurt-kiwi',
    name: 'Müsli mit Joghurt und Kiwi',
    portionen: 1,
    zutaten: [
      { suche: 'Müsli ohne Zucker', menge: 50, portion: p('1 Portion') },
      { suche: 'Joghurt natur 1,5 % Fett', menge: 150, portion: p('1 Becher') },
      { suche: 'Kiwi roh', menge: 75, portion: p('1 Stück') },
    ],
    zubereitung:
      'Müsli in eine Schale geben und den Joghurt darüber. Kiwi schälen, würfeln und darauf verteilen.',
  },
  {
    schluessel: 'skyr-banane-mandeln',
    name: 'Skyr mit Banane und Mandeln',
    portionen: 1,
    zutaten: [
      { suche: 'Skyr natur', menge: 150, portion: p('1 Becher') },
      { suche: 'Banane roh', menge: 120, portion: p('1 Stück (mittel)') },
      { suche: 'Mandeln', menge: 15 },
      { suche: 'Chiasamen', menge: 12, portion: p('1 Esslöffel') },
    ],
    zubereitung:
      'Banane in Scheiben schneiden, Mandeln grob hacken. Beides mit den Chiasamen auf den Skyr geben.',
  },
  {
    schluessel: 'broetchen-frischkaese-gurke',
    name: 'Vollkornbrötchen mit Frischkäse und Gurke',
    portionen: 1,
    zutaten: [
      { suche: 'Vollkornbrötchen', menge: 60, portion: p('1 Stück') },
      { suche: 'Frischkäse Doppelrahmstufe', menge: 20, portion: p('1 Esslöffel') },
      { suche: 'Gurke roh', menge: 60 },
    ],
    zubereitung:
      'Brötchen aufschneiden und mit Frischkäse bestreichen. Gurke in Scheiben darauf legen.',
  },
  {
    schluessel: 'linsensalat-paprika',
    name: 'Linsensalat mit Paprika',
    portionen: 2,
    zutaten: [
      { suche: 'Linsen gekocht', menge: 300, portion: p('1 Portion', 2) },
      { suche: 'Paprika rot roh', menge: 150, portion: p('1 Stück') },
      { suche: 'Zwiebel roh', menge: 35 },
      { suche: 'Olivenöl', menge: 20, portion: p('1 Esslöffel', 2) },
      { suche: 'Senf mittelscharf', menge: 5, portion: p('1 Teelöffel') },
    ],
    zubereitung:
      'Paprika und Zwiebel fein würfeln. Öl mit Senf, etwas Essig, Salz und Pfeffer verrühren und mit Linsen und Gemüse mischen.',
  },
  {
    schluessel: 'haehnchen-brokkoli-reis',
    name: 'Hähnchen mit Brokkoli und Reis',
    portionen: 2,
    zutaten: [
      { suche: 'Hähnchenbrust gebraten', menge: 300, portion: p('1 Stück', 2) },
      { suche: 'Brokkoli gekocht', menge: 300, portion: p('1 Portion', 2) },
      { suche: 'Reis gekocht', menge: 360, portion: p('1 Portion', 2) },
      { suche: 'Rapsöl', menge: 10, portion: p('1 Esslöffel') },
    ],
    zubereitung:
      'Reis nach Packungsangabe garen. Hähnchen in Streifen im Öl anbraten, Brokkoliröschen dazugeben und abgedeckt fünf Minuten garen.',
  },
  {
    schluessel: 'lachs-kartoffeln-spinat',
    name: 'Lachs mit Kartoffeln und Spinat',
    portionen: 2,
    zutaten: [
      { suche: 'Lachs gebraten', menge: 250, portion: p('1 Stück', 2) },
      { suche: 'Kartoffeln gekocht', menge: 400, portion: p('1 Stück (mittel)', 5) },
      { suche: 'Spinat gekocht', menge: 300, portion: p('1 Portion', 2) },
      { suche: 'Olivenöl', menge: 10, portion: p('1 Esslöffel') },
    ],
    zubereitung:
      'Kartoffeln kochen. Lachs im Öl von beiden Seiten braten, Spinat in derselben Pfanne zusammenfallen lassen und mit den Kartoffeln anrichten.',
  },
  {
    schluessel: 'vollkornnudeln-tomate-zucchini',
    name: 'Vollkornnudeln mit Tomaten und Zucchini',
    portionen: 2,
    zutaten: [
      { suche: 'Vollkornnudeln gekocht', menge: 400, portion: p('1 Portion', 2) },
      { suche: 'Tomatensoße', menge: 200, portion: p('1 Portion', 2) },
      { suche: 'Zucchini gekocht', menge: 150 },
      { suche: 'Olivenöl', menge: 10, portion: p('1 Esslöffel') },
    ],
    zubereitung:
      'Nudeln kochen. Zucchini würfeln, im Öl anbraten, die Soße dazugeben und kurz köcheln lassen. Mit den Nudeln mischen.',
  },
  {
    schluessel: 'gemuesepfanne-tofu',
    name: 'Gemüsepfanne mit Tofu und Reis',
    portionen: 2,
    zutaten: [
      { suche: 'Tofu natur', menge: 200, portion: p('1 Portion', 2) },
      { suche: 'Paprika rot roh', menge: 150, portion: p('1 Stück') },
      { suche: 'Zucchini gekocht', menge: 200 },
      { suche: 'Karotte roh (Möhre)', menge: 160, portion: p('1 Stück (mittel)', 2) },
      { suche: 'Rapsöl', menge: 20, portion: p('1 Esslöffel', 2) },
      { suche: 'Reis gekocht', menge: 360, portion: p('1 Portion', 2) },
    ],
    zubereitung:
      'Tofu würfeln und im Öl goldbraun braten. Gemüse in Streifen dazugeben und bissfest garen, mit Sojasoße abschmecken und mit dem Reis servieren.',
  },
  {
    schluessel: 'kichererbsen-curry',
    name: 'Kichererbsencurry mit Spinat',
    portionen: 3,
    zutaten: [
      { suche: 'Kichererbsen gekocht', menge: 400 },
      { suche: 'Spinat gekocht', menge: 300, portion: p('1 Portion', 2) },
      { suche: 'Tomatensoße', menge: 300, portion: p('1 Portion', 3) },
      { suche: 'Zwiebel roh', menge: 70, portion: p('1 Stück (mittel)') },
      { suche: 'Knoblauch roh', menge: 8, portion: p('1 Zehe', 2) },
      { suche: 'Rapsöl', menge: 20, portion: p('1 Esslöffel', 2) },
      { suche: 'Reis gekocht', menge: 540, portion: p('1 Portion', 3) },
    ],
    zubereitung:
      'Zwiebel und Knoblauch im Öl andünsten, mit Currypulver bestäuben. Kichererbsen und Soße dazugeben, zehn Minuten köcheln, zuletzt den Spinat unterheben. Mit Reis servieren.',
  },
  {
    schluessel: 'bohnenchili',
    name: 'Bohnenchili',
    portionen: 4,
    zutaten: [
      { suche: 'Kidneybohnen gekocht', menge: 500 },
      { suche: 'Tomatensoße', menge: 400, portion: p('1 Portion', 4) },
      { suche: 'Paprika rot roh', menge: 300, portion: p('1 Stück', 2) },
      { suche: 'Zwiebel roh', menge: 140, portion: p('1 Stück (mittel)', 2) },
      { suche: 'Knoblauch roh', menge: 8, portion: p('1 Zehe', 2) },
      { suche: 'Rapsöl', menge: 20, portion: p('1 Esslöffel', 2) },
    ],
    zubereitung:
      'Zwiebel, Knoblauch und Paprika im Öl anbraten. Bohnen und Soße dazugeben, mit Kreuzkümmel, Paprikapulver und Salz würzen und zwanzig Minuten köcheln lassen.',
  },
  {
    schluessel: 'chili-rinderhack',
    name: 'Chili mit Rinderhack',
    portionen: 4,
    zutaten: [
      { suche: 'Rinderhackfleisch gebraten', menge: 400 },
      { suche: 'Kidneybohnen gekocht', menge: 400 },
      { suche: 'Tomatensoße', menge: 400, portion: p('1 Portion', 4) },
      { suche: 'Paprika rot roh', menge: 150, portion: p('1 Stück') },
      { suche: 'Zwiebel roh', menge: 70, portion: p('1 Stück (mittel)') },
      { suche: 'Rapsöl', menge: 10, portion: p('1 Esslöffel') },
    ],
    zubereitung:
      'Zwiebel im Öl anbraten, das Hackfleisch krümelig braten. Paprika, Bohnen und Soße dazugeben, würzen und zwanzig Minuten köcheln lassen.',
  },
  {
    schluessel: 'quinoasalat-avocado',
    name: 'Quinoasalat mit Gurke und Avocado',
    portionen: 2,
    zutaten: [
      { suche: 'Quinoa gekocht', menge: 300 },
      { suche: 'Gurke roh', menge: 200 },
      { suche: 'Tomate roh', menge: 160, portion: p('1 Stück (mittel)', 2) },
      { suche: 'Avocado roh', menge: 150, portion: p('1 Stück') },
      { suche: 'Olivenöl', menge: 20, portion: p('1 Esslöffel', 2) },
    ],
    zubereitung:
      'Quinoa abkühlen lassen. Gurke, Tomaten und Avocado würfeln, mit Öl, Zitronensaft, Salz und Pfeffer unter die Quinoa mischen.',
  },
  {
    schluessel: 'blumenkohl-kartoffel-auflauf',
    name: 'Blumenkohl-Kartoffel-Auflauf',
    portionen: 3,
    zutaten: [
      { suche: 'Kartoffeln gekocht', menge: 480, portion: p('1 Stück (mittel)', 6) },
      { suche: 'Blumenkohl gekocht', menge: 450, portion: p('1 Portion', 3) },
      { suche: 'Milch 1,5 % Fett', menge: 200, portion: p('1 Glas') },
      { suche: 'Gouda 45 % Fett i. Tr.', menge: 75, portion: p('1 Scheibe', 3) },
      { suche: 'Butter', menge: 10, portion: p('1 Portion') },
    ],
    zubereitung:
      'Kartoffeln in Scheiben und Blumenkohl in Röschen in eine gefettete Form schichten. Milch mit Salz, Pfeffer und Muskat darüber gießen, mit Käse belegen und bei 200 °C zwanzig Minuten backen.',
  },
  {
    schluessel: 'putenpfanne-couscous',
    name: 'Putenpfanne mit Paprika und Couscous',
    portionen: 2,
    zutaten: [
      { suche: 'Putenbrust gebraten', menge: 300, portion: p('1 Stück', 2) },
      { suche: 'Paprika rot roh', menge: 300, portion: p('1 Stück', 2) },
      { suche: 'Zwiebel roh', menge: 70, portion: p('1 Stück (mittel)') },
      { suche: 'Couscous gekocht', menge: 300 },
      { suche: 'Olivenöl', menge: 10, portion: p('1 Esslöffel') },
    ],
    zubereitung:
      'Couscous mit heißer Brühe übergießen und quellen lassen. Pute in Streifen im Öl anbraten, Zwiebel und Paprika dazugeben und mitgaren.',
  },
  {
    schluessel: 'thunfischsalat-ei',
    name: 'Thunfischsalat mit Ei',
    portionen: 2,
    zutaten: [
      { suche: 'Thunfisch in eigenem Saft', menge: 140, portion: p('1 Dose (abgetropft)') },
      { suche: 'Kopfsalat roh', menge: 100, portion: p('1 Schale', 2) },
      { suche: 'Tomate roh', menge: 160, portion: p('1 Stück (mittel)', 2) },
      { suche: 'Hühnerei gekocht', menge: 110, portion: p('1 Stück (M)', 2) },
      { suche: 'Olivenöl', menge: 20, portion: p('1 Esslöffel', 2) },
    ],
    zubereitung:
      'Salat zupfen, Tomaten und Eier vierteln. Mit dem abgetropften Thunfisch anrichten und mit Öl, Essig, Salz und Pfeffer beträufeln.',
  },
  {
    schluessel: 'linsensuppe-moehren',
    name: 'Linsensuppe mit Möhren',
    portionen: 4,
    zutaten: [
      { suche: 'Linsen gekocht', menge: 500 },
      { suche: 'Karotte roh (Möhre)', menge: 240, portion: p('1 Stück (mittel)', 3) },
      { suche: 'Kartoffeln gekocht', menge: 240, portion: p('1 Stück (mittel)', 3) },
      { suche: 'Zwiebel roh', menge: 70, portion: p('1 Stück (mittel)') },
      { suche: 'Rapsöl', menge: 10, portion: p('1 Esslöffel') },
    ],
    zubereitung:
      'Zwiebel im Öl andünsten. Möhren und Kartoffeln würfeln, mit einem Liter Gemüsebrühe aufkochen und zehn Minuten garen. Linsen dazugeben und erhitzen.',
  },
  {
    schluessel: 'ofengemuese-suesskartoffel',
    name: 'Ofengemüse mit Süßkartoffel und Hummus',
    portionen: 2,
    zutaten: [
      { suche: 'Süßkartoffel gekocht', menge: 400 },
      { suche: 'Paprika rot roh', menge: 150, portion: p('1 Stück') },
      { suche: 'Zucchini gekocht', menge: 200 },
      { suche: 'Olivenöl', menge: 20, portion: p('1 Esslöffel', 2) },
      { suche: 'Hummus', menge: 60, portion: p('1 Esslöffel', 3) },
    ],
    zubereitung:
      'Gemüse in Stücke schneiden, mit Öl, Salz und Rosmarin mischen und bei 200 °C fünfundzwanzig Minuten rösten. Mit Hummus servieren.',
  },
  {
    schluessel: 'kartoffelsalat-joghurt',
    name: 'Kartoffelsalat mit Joghurtdressing',
    portionen: 3,
    zutaten: [
      { suche: 'Kartoffeln gekocht', menge: 600 },
      { suche: 'Joghurt natur 1,5 % Fett', menge: 150, portion: p('1 Becher') },
      { suche: 'Gurke roh', menge: 200 },
      { suche: 'Zwiebel roh', menge: 35 },
      { suche: 'Senf mittelscharf', menge: 5, portion: p('1 Teelöffel') },
    ],
    zubereitung:
      'Kartoffeln in Scheiben schneiden. Joghurt mit Senf, Salz, Pfeffer und Dill verrühren, mit Gurke, Zwiebel und Kartoffeln mischen und ziehen lassen.',
  },
  {
    schluessel: 'gemueseomelett',
    name: 'Gemüseomelett',
    portionen: 1,
    zutaten: [
      { suche: 'Hühnerei gekocht', menge: 165, portion: p('1 Stück (M)', 3) },
      { suche: 'Paprika rot roh', menge: 75 },
      { suche: 'Zucchini gekocht', menge: 75 },
      { suche: 'Rapsöl', menge: 5, portion: p('1 Teelöffel') },
      { suche: 'Gouda 45 % Fett i. Tr.', menge: 25, portion: p('1 Scheibe') },
    ],
    zubereitung:
      'Gemüse würfeln und im Öl anbraten. Verquirlte Eier darüber gießen, bei kleiner Hitze stocken lassen und mit dem Käse belegen.',
  },
  {
    schluessel: 'gebratener-reis-gemuese-ei',
    name: 'Gebratener Reis mit Gemüse und Ei',
    portionen: 2,
    zutaten: [
      { suche: 'Reis gekocht', menge: 360, portion: p('1 Portion', 2) },
      { suche: 'Hühnerei gekocht', menge: 110, portion: p('1 Stück (M)', 2) },
      { suche: 'Karotte roh (Möhre)', menge: 80, portion: p('1 Stück (mittel)') },
      { suche: 'Paprika rot roh', menge: 150, portion: p('1 Stück') },
      { suche: 'Rapsöl', menge: 20, portion: p('1 Esslöffel', 2) },
    ],
    zubereitung:
      'Gemüse klein schneiden und im Öl anbraten. Den gegarten Reis dazugeben und mitbraten, die verquirlten Eier unterrühren und mit Sojasoße würzen.',
  },
  {
    schluessel: 'hummus-gemuesesticks',
    name: 'Gemüsesticks mit Hummus',
    portionen: 1,
    zutaten: [
      { suche: 'Karotte roh (Möhre)', menge: 80, portion: p('1 Stück (mittel)') },
      { suche: 'Paprika rot roh', menge: 75 },
      { suche: 'Gurke roh', menge: 100 },
      { suche: 'Hummus', menge: 40, portion: p('1 Esslöffel', 2) },
    ],
    zubereitung: 'Gemüse in Stifte schneiden und mit dem Hummus zum Dippen anrichten.',
  },
  {
    schluessel: 'apfel-walnuesse',
    name: 'Apfel mit Walnüssen',
    portionen: 1,
    zutaten: [
      { suche: 'Apfel roh', menge: 150, portion: p('1 Stück (mittel)') },
      { suche: 'Walnüsse', menge: 25, portion: p('1 Handvoll') },
    ],
    zubereitung: 'Apfel in Spalten schneiden und mit den Walnüssen essen.',
  },
  {
    schluessel: 'huettenkaese-knaeckebrot',
    name: 'Hüttenkäse mit Gurke auf Knäckebrot',
    portionen: 1,
    zutaten: [
      { suche: 'Hüttenkäse (körniger Frischkäse)', menge: 100 },
      { suche: 'Gurke roh', menge: 60 },
      { suche: 'Knäckebrot Roggen', menge: 20, portion: p('1 Scheibe', 2) },
    ],
    zubereitung: 'Knäckebrot mit Hüttenkäse bestreichen und mit Gurkenscheiben belegen.',
  },
  {
    schluessel: 'joghurt-heidelbeeren',
    name: 'Joghurt mit Heidelbeeren',
    portionen: 1,
    zutaten: [
      { suche: 'Joghurt natur 1,5 % Fett', menge: 150, portion: p('1 Becher') },
      { suche: 'Heidelbeeren roh', menge: 60, portion: p('1 Handvoll') },
      { suche: 'Honig', menge: 8, portion: p('1 Teelöffel') },
    ],
    zubereitung: 'Heidelbeeren auf den Joghurt geben und mit Honig beträufeln.',
  },
  {
    schluessel: 'quark-orange-mandeln',
    name: 'Quark mit Orange und Mandeln',
    portionen: 1,
    zutaten: [
      { suche: 'Magerquark', menge: 125 },
      { suche: 'Orange roh', menge: 180, portion: p('1 Stück (mittel)') },
      { suche: 'Mandeln', menge: 10 },
    ],
    zubereitung:
      'Orange filetieren, mit dem Quark verrühren und die gehackten Mandeln darüber streuen.',
  },
  {
    schluessel: 'birne-quark-zimt',
    name: 'Birne mit Zimtquark',
    portionen: 1,
    zutaten: [
      { suche: 'Birne roh', menge: 170, portion: p('1 Stück (mittel)') },
      { suche: 'Magerquark', menge: 125 },
      { suche: 'Milch 1,5 % Fett', menge: 20, portion: p('1 Schuss') },
    ],
    zubereitung:
      'Quark mit Milch und einer Prise Zimt verrühren, die Birne in Spalten dazu reichen.',
  },
];
