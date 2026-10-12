// -----------------------------------------------------------------------------
// Kontaktbogen und Vorher/Nachher-Bogen der Bildstrecke als eigenstaendige
// HTML-Dateien (ohne Netz, ohne Abhaengigkeit). Reine Funktionen: Sie bekommen
// das Ergebnis eines Laufs (ergebnis.json) und geben Text zurueck.
// -----------------------------------------------------------------------------

import { BEREICHE } from './routen.mjs';

const ZEICHEN = new Map([
  ['&', '&amp;'],
  ['<', '&lt;'],
  ['>', '&gt;'],
  ['"', '&quot;'],
  ["'", '&#39;'],
]);

export function maskieren(text) {
  return String(text ?? '').replace(/[&<>"']/g, (z) => ZEICHEN.get(z) ?? z);
}

/** Bereich als Anker und Dateiname: „Termine und Kalender" → „termine-und-kalender". */
export function kurzname(text) {
  return String(text)
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Die Befundarten mit ihrer Beschriftung im Bogen. */
export const BEFUNDARTEN = new Map([
  ['querscroll', 'Querscrollen'],
  ['konsole', 'Konsolenfehler'],
  ['anfrage', 'Anfrage gescheitert'],
  ['anmeldung', 'Zur Anmeldung umgeleitet'],
  ['umleitung', 'Unerwartete Zielseite'],
  ['fehlerzustand', 'Fehlerzustand sichtbar'],
  ['leer', 'Leere Seite'],
  ['laedt', 'Lädt noch'],
  ['schreibversuch', 'Schreibt beim Öffnen'],
  ['aufnahme', 'Nicht aufgenommen'],
]);

const STIL = `
:root { --tinte:#14181b; --leise:#5a6169; --linie:#e6e8eb; --flaeche:#f4f5f7; --haupt:#004429;
  --akzent:#e1f0e4; --gefahr:#b3261e; --gefahr-flaeche:#fbeaea; --warn:#7a4a00; --warn-flaeche:#fff4dc; }
* { box-sizing: border-box; }
body { margin:0; font: 15px/1.45 system-ui, sans-serif; color:var(--tinte); background:#fff; }
header.kopf { position: sticky; top:0; z-index:2; background:#fff; border-bottom:1px solid var(--linie);
  padding:12px 16px; display:flex; flex-wrap:wrap; gap:8px 20px; align-items:center; }
header.kopf h1 { font-size:20px; margin:0; color:var(--haupt); }
header.kopf .meta { color:var(--leise); font-size:13px; }
nav.bereiche { display:flex; flex-wrap:wrap; gap:6px; }
nav.bereiche a { font-size:13px; padding:4px 10px; border:1px solid var(--linie); border-radius:999px;
  color:var(--tinte); text-decoration:none; }
nav.bereiche a b { color:var(--gefahr); }
label.filter { font-size:13px; display:flex; gap:6px; align-items:center; }
main { padding: 8px 16px 64px; max-width: 1600px; }
h2 { font-size:18px; margin:32px 0 8px; color:var(--haupt); }
.zeile { display:grid; grid-template-columns: minmax(200px, 260px) 1fr; gap:16px; padding:16px 0;
  border-top:1px solid var(--linie); }
.zeile.befund { box-shadow: inset 4px 0 0 var(--gefahr); padding-left:12px; }
.etikett b { display:block; font-size:15px; }
.etikett code { font-size:12px; color:var(--leise); word-break:break-all; }
.etikett .konto { display:inline-block; margin-top:6px; font-size:12px; padding:2px 8px; border-radius:999px;
  background:var(--flaeche); }
.bilder { display:flex; flex-wrap:wrap; gap:16px; align-items:flex-start; }
figure { margin:0; }
figure .rahmen { display:block; border:1px solid var(--linie); border-radius:8px; overflow:hidden;
  background:var(--flaeche); }
figure.b375 { width:220px; }
figure.b1280 { width:560px; }
figure.b375 .rahmen { max-height:476px; }
figure.b1280 .rahmen { max-height:350px; }
figure img { display:block; width:100%; height:auto; }
figure.leer .rahmen { height:120px; display:grid; place-items:center; color:var(--leise); font-size:13px; }
figcaption { font-size:12px; color:var(--leise); margin-top:4px; }
ul.befunde { list-style:none; padding:0; margin:4px 0 0; }
ul.befunde li { font-size:12px; padding:3px 8px; margin-top:3px; border-radius:6px; background:var(--gefahr-flaeche);
  color:var(--gefahr); overflow-wrap:anywhere; }
ul.befunde li.hinweis { background:var(--warn-flaeche); color:var(--warn); }
ul.befunde li.behoben { background:var(--akzent); color:var(--haupt); }
.paar { display:flex; gap:8px; align-items:flex-start; }
.paar > div > .marke { font-size:11px; text-transform:uppercase; letter-spacing:.1em; color:var(--leise); }
body.nur-befunde .zeile:not(.befund) { display:none; }
@media (max-width: 700px) { .zeile { grid-template-columns: 1fr; } figure.b1280 { width:100%; } }
`;

const FILTER_SKRIPT = `
document.getElementById('nur-befunde').addEventListener('change', function (e) {
  document.body.classList.toggle('nur-befunde', e.target.checked);
});
`;

function befundListe(eintraege, klasse = '') {
  if (!eintraege || eintraege.length === 0) return '';
  const zeilen = eintraege
    .map(
      (b) =>
        `<li class="${klasse}">${maskieren(BEFUNDARTEN.get(b.art) ?? b.art)}${
          b.text ? `: ${maskieren(b.text)}` : ''
        }</li>`,
    )
    .join('');
  return `<ul class="befunde">${zeilen}</ul>`;
}

function bildFigur(bild, quelle, breite) {
  if (!bild) {
    return `<figure class="b${breite} leer"><div class="rahmen">kein Bild</div></figure>`;
  }
  const inhalt = bild.datei
    ? `<a class="rahmen" href="${maskieren(quelle)}" target="_blank"><img loading="lazy" src="${maskieren(
        quelle,
      )}" alt="${maskieren(`${bild.etikett}, ${bild.konto}, ${breite} px`)}"></a>`
    : `<div class="rahmen">kein Bild</div>`;
  const angefragt = new URL(bild.pfad ?? '/', 'http://bildstrecke.invalid').pathname;
  const unterschrift = `${breite} px${bild.hoehe ? ` · ${bild.hoehe} px hoch` : ''}${
    bild.ziel && bild.ziel !== angefragt ? ` · landet auf ${maskieren(bild.ziel)}` : ''
  }`;
  return `<figure class="b${breite}${bild.datei ? '' : ' leer'}">${inhalt}<figcaption>${unterschrift}</figcaption>${befundListe(
    bild.befunde,
  )}${befundListe(bild.hinweise, 'hinweis')}</figure>`;
}

/** Die Bilder eines Laufs nach Bereich und dann nach Route und Konto. */
export function gruppieren(bilder) {
  const bereiche = new Map();
  for (const bild of bilder) {
    if (!bereiche.has(bild.bereich)) bereiche.set(bild.bereich, new Map());
    const zeilen = bereiche.get(bild.bereich);
    const schluessel = `${bild.muster}|${bild.konto}`;
    if (!zeilen.has(schluessel))
      zeilen.set(schluessel, { muster: bild.muster, konto: bild.konto, bilder: [] });
    zeilen.get(schluessel).bilder.push(bild);
  }
  const reihenfolge = [...BEREICHE, ...[...bereiche.keys()].filter((b) => !BEREICHE.includes(b))];
  return reihenfolge
    .filter((b) => bereiche.has(b))
    .map((b) => ({ bereich: b, zeilen: [...bereiche.get(b).values()] }));
}

function mitBefund(bild) {
  return Boolean(bild && bild.befunde && bild.befunde.length > 0);
}

/** Der Kontaktbogen eines Laufs: 375 und 1280 nebeneinander, nach Bereich. */
export function kontaktbogenHtml(ergebnis) {
  const breiten = ergebnis.breiten ?? [375, 1280];
  const gruppen = gruppieren(ergebnis.bilder);
  const befundZahl = (bilder) => bilder.filter(mitBefund).length;
  const navigation = gruppen
    .map((g) => {
      const n = befundZahl(g.zeilen.flatMap((z) => z.bilder));
      return `<a href="#${kurzname(g.bereich)}">${maskieren(g.bereich)}${n ? ` <b>${n}</b>` : ''}</a>`;
    })
    .join('');
  const abschnitte = gruppen
    .map((g) => {
      const zeilen = g.zeilen
        .map((z) => {
          const erstes = z.bilder[0];
          const befund = z.bilder.some(mitBefund);
          const figuren = breiten
            .map((breite) => {
              const bild = z.bilder.find((b) => b.breite === breite);
              return bildFigur(bild, bild?.datei, breite);
            })
            .join('');
          return `<section class="zeile${befund ? ' befund' : ''}"><div class="etikett"><b>${maskieren(
            erstes.etikett,
          )}</b><code>${maskieren(erstes.pfad)}</code><br><span class="konto">${maskieren(
            z.konto,
          )}</span></div><div class="bilder">${figuren}</div></section>`;
        })
        .join('');
      return `<h2 id="${kurzname(g.bereich)}">${maskieren(g.bereich)}</h2>${zeilen}`;
    })
    .join('');
  const z = ergebnis.zusammenfassung ?? {};
  const meta = [
    `${ergebnis.bilder.length} Bilder`,
    `${z.mitBefund ?? befundZahl(ergebnis.bilder)} mit Befund`,
    ergebnis.commit ? `Stand ${maskieren(ergebnis.commit)}` : '',
    ergebnis.erstellt ? maskieren(new Date(ergebnis.erstellt).toLocaleString('de-DE')) : '',
  ]
    .filter(Boolean)
    .join(' · ');
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Bildstrecke</title><style>${STIL}</style></head><body><header class="kopf"><h1>Bildstrecke</h1><span class="meta">${meta}</span><label class="filter"><input type="checkbox" id="nur-befunde"> nur Seiten mit Befund</label><nav class="bereiche">${navigation}</nav></header><main>${abschnitte}</main><script>${FILTER_SKRIPT}</script></body></html>`;
}

function befundVergleich(vorher, nachher) {
  const text = (b) => `${b.art}|${b.text ?? ''}`;
  const alt = new Set((vorher?.befunde ?? []).map(text));
  const neu = new Set((nachher?.befunde ?? []).map(text));
  return {
    neu: (nachher?.befunde ?? []).filter((b) => !alt.has(text(b))),
    behoben: (vorher?.befunde ?? []).filter((b) => !neu.has(text(b))),
    geblieben: (nachher?.befunde ?? []).filter((b) => alt.has(text(b))),
  };
}

/**
 * Vorher/Nachher: je Route, Konto und Breite die beiden Bilder nebeneinander.
 * `vorherOrdner` ist der Weg vom Nachher-Ordner zum Vorher-Ordner (relativ),
 * damit der Bogen auch nach dem Verschieben beider Ordner noch Bilder zeigt.
 */
export function vergleichHtml(vorher, nachher, vorherOrdner) {
  const schluessel = (b) => `${b.muster}|${b.konto}|${b.breite}`;
  const alt = new Map(vorher.bilder.map((b) => [schluessel(b), b]));
  const neu = new Map(nachher.bilder.map((b) => [schluessel(b), b]));
  // Ein Teillauf (--nur, --konten, --breiten) vergleicht nur, was er aufgenommen
  // hat; ein voller Lauf zeigt auch, was es nachher nicht mehr gibt.
  const auswahl = nachher.auswahl ?? {};
  const teillauf =
    (auswahl.nur?.length ?? 0) > 0 ||
    (auswahl.konten?.length ?? 0) > 0 ||
    (auswahl.breiten?.length ?? 0) > 0;
  const alle = [
    ...nachher.bilder,
    ...(teillauf ? [] : vorher.bilder.filter((b) => !neu.has(schluessel(b)))),
  ];
  const gruppen = gruppieren(alle);
  const breiten = nachher.breiten ?? [375, 1280];
  let neueBefunde = 0;
  let behobeneBefunde = 0;
  const abschnitte = gruppen
    .map((g) => {
      const zeilen = g.zeilen
        .map((z) => {
          const erstes = z.bilder[0];
          let befund = false;
          const paare = breiten
            .map((breite) => {
              const s = `${z.muster}|${z.konto}|${breite}`;
              const a = alt.get(s);
              const n = neu.get(s);
              if (!n && (teillauf || !a)) return '';
              // Ohne Nachher-Bild ist nichts behoben - es fehlt nur.
              const v = n ? befundVergleich(a, n) : { neu: [], behoben: [], geblieben: [] };
              neueBefunde += v.neu.length;
              behobeneBefunde += v.behoben.length;
              if (v.neu.length > 0 || v.geblieben.length > 0) befund = true;
              const links = a
                ? bildFigur(
                    { ...a, befunde: [], hinweise: [] },
                    a.datei ? `${vorherOrdner}/${a.datei}` : '',
                    breite,
                  )
                : `<figure class="b${breite} leer"><div class="rahmen">vorher nicht aufgenommen</div></figure>`;
              const rechts = n
                ? bildFigur({ ...n, befunde: [], hinweise: [] }, n.datei, breite)
                : `<figure class="b${breite} leer"><div class="rahmen">nachher nicht aufgenommen</div></figure>`;
              return `<div class="paar"><div><div class="marke">vorher</div>${links}</div><div><div class="marke">nachher</div>${rechts}${befundListe(
                v.neu,
              )}${befundListe(v.geblieben, 'hinweis')}${befundListe(v.behoben, 'behoben')}</div></div>`;
            })
            .join('');
          return `<section class="zeile${befund ? ' befund' : ''}"><div class="etikett"><b>${maskieren(
            erstes.etikett,
          )}</b><code>${maskieren(erstes.pfad)}</code><br><span class="konto">${maskieren(
            z.konto,
          )}</span></div><div class="bilder">${paare}</div></section>`;
        })
        .join('');
      return `<h2 id="${kurzname(g.bereich)}">${maskieren(g.bereich)}</h2>${zeilen}`;
    })
    .join('');
  const navigation = gruppen
    .map((g) => `<a href="#${kurzname(g.bereich)}">${maskieren(g.bereich)}</a>`)
    .join('');
  const meta = `vorher ${maskieren(vorher.commit ?? '?')} · nachher ${maskieren(
    nachher.commit ?? '?',
  )} · ${neueBefunde} neue Befunde · ${behobeneBefunde} behoben`;
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Bildstrecke – vorher und nachher</title><style>${STIL}</style></head><body><header class="kopf"><h1>Vorher und nachher</h1><span class="meta">${meta}</span><label class="filter"><input type="checkbox" id="nur-befunde"> nur Seiten mit Befund</label><nav class="bereiche">${navigation}</nav></header><main>${abschnitte}</main><script>${FILTER_SKRIPT}</script></body></html>`;
}
