#!/usr/bin/env node
// -----------------------------------------------------------------------------
// Bildschirmfotos der laufenden Anwendung, standardmaessig bei 375 px (UI-000).
//
// PROJECT_PRINCIPLES.md 2.2 ist Mobile First, und CLAUDE.md verlangt bei
// UI-Aenderungen eine Sichtpruefung bei ~375 px. Das von Hand zu tun heisst:
// Browser aufmachen, Geraeteansicht einschalten, Breite eintippen, scrollen.
// Dieses Skript nimmt die Seiten in einem Durchlauf auf und meldet dabei
// mehrere Dinge, die man beim Hinsehen leicht uebersieht: waagerechtes
// Scrollen, Fehler in der Browserkonsole und - fuer Seiten hinter der
// Anmeldung - eine unerwartete Zielseite.
//
// Aufruf:
//   pnpm dev                                          # in einem zweiten Terminal
//   pnpm screenshots /login-losezugaengliche-seite     # ohne Anmeldung
//   pnpm screenshots --konto=therapist /patienten/... /kalender
//   pnpm screenshots --breite=1024 --konto=owner /praxis/team
//
// Die Bilder landen in .tmp/screenshots/ und sind nicht versioniert.
//
// Seiten hinter der Anmeldung brauchen zusaetzlich einen laufenden
// Supabase-Stack (`pnpm dlx supabase@2.116.0 start`, docs/DEVELOPMENT.md) UND das Konto
// muss uebergeben werden - das Skript startet mit jedem Lauf einen frischen,
// nicht angemeldeten Browserkontext und meldet sich ohne `--konto` bei
// keiner Seite an. In der Cloud-Entwicklungsumgebung ist `supabase start`
// nicht moeglich; dort traegt `./scripts/cloud-stack.sh start` denselben
// Stack ohne Docker (docs/DEVELOPMENT.md, "Supabase-Stack ohne Docker").
// -----------------------------------------------------------------------------
import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';
// Konten, Kennwort und Anmeldung teilt dieses Skript mit der Bildstrecke
// (scripts/bildstrecke.mjs): synthetische Seed-Konten, kein Secret im Sinne
// von PROJECT_PRINCIPLES.md 3.3.
import { ANMELDUNG_VORAUSSETZUNG, KONTEN, anmelden, startbildAbwarten } from './testkonten.mjs';

const ZIEL = '.tmp/screenshots';
const BASIS = process.env.E2E_BASE_URL ?? 'http://localhost:5173';

const argumente = process.argv.slice(2);
const breite = Number(
  argumente.find((a) => a.startsWith('--breite='))?.slice('--breite='.length) ?? 375,
);
const kontoName = argumente.find((a) => a.startsWith('--konto='))?.slice('--konto='.length);
const pfade = argumente.filter((a) => !a.startsWith('--'));

if (pfade.length === 0) {
  console.error(
    `Aufruf: pnpm screenshots [--breite=375] [--konto=${[...KONTEN.keys()].join('|')}] /pfad [/weiterer-pfad …]`,
  );
  console.error('Voraussetzung: die Anwendung laeuft unter ' + BASIS + ' (pnpm dev).');
  console.error(
    'Fuer Seiten hinter der Anmeldung zusaetzlich ein laufender Supabase-Stack (pnpm dlx supabase@2.116.0 start oder ./scripts/cloud-stack.sh start) und --konto.',
  );
  process.exit(1);
}

if (!Number.isFinite(breite) || breite < 320 || breite > 3840) {
  console.error(`Unplausible Breite: ${breite}`);
  process.exit(1);
}

let anmeldeAdresse;
if (kontoName) {
  anmeldeAdresse = KONTEN.get(kontoName);
  if (!anmeldeAdresse) {
    console.error(`Unbekanntes Konto "${kontoName}". Bekannt: ${[...KONTEN.keys()].join(', ')}`);
    process.exit(1);
  }
}

await mkdir(ZIEL, { recursive: true });

const browser = await chromium.launch(
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
    : {},
);
// Ein gemeinsamer Kontext fuer alle Seiten dieses Laufs: die Anmeldung setzt
// eine Sitzung, die dann fuer jeden weiteren Pfad gilt - genau wie im echten
// Browser ein Tab nach dem anderen in derselben Sitzung.
const context = await browser.newContext({ viewport: { width: breite, height: 900 } });

let befunde = 0;

if (anmeldeAdresse) {
  const anmeldeSeite = await context.newPage();
  try {
    await anmelden(anmeldeSeite, BASIS, kontoName);
    console.log(`Angemeldet als ${kontoName} (${anmeldeAdresse}).\n`);
  } catch (fehler) {
    console.error(`Anmeldung als ${kontoName} fehlgeschlagen: ${String(fehler).split('\n')[0]}`);
    console.error(ANMELDUNG_VORAUSSETZUNG);
    await browser.close();
    process.exit(1);
  } finally {
    await anmeldeSeite.close();
  }
}

for (const pfad of pfade) {
  const seite = await context.newPage();
  const konsolenfehler = [];
  const fehlendeDateien = [];
  seite.on('console', (nachricht) => {
    // "Failed to load resource" sagt nicht, welche Datei fehlt. Die kommt
    // praeziser aus dem response-Ereignis unten; hier waere sie nur Rauschen.
    if (nachricht.type() === 'error' && !nachricht.text().startsWith('Failed to load resource')) {
      konsolenfehler.push(nachricht.text());
    }
  });
  seite.on('pageerror', (fehler) => konsolenfehler.push(String(fehler)));
  seite.on('response', (antwort) => {
    // /favicon.ico fragt der Browser von sich aus an. Ohne diese Ausnahme
    // meldete jeder Lauf denselben Befund - und wer jeden Lauf mit einem
    // Befund sieht, liest den naechsten nicht mehr.
    if (antwort.status() >= 400 && !antwort.url().endsWith('/favicon.ico')) {
      fehlendeDateien.push(`${antwort.status()} ${antwort.url()}`);
    }
  });

  try {
    await seite.goto(BASIS + pfad, { waitUntil: 'networkidle', timeout: 20_000 });
    // Das Startbild (RAH-009) liegt in jedem neuen Tab knapp zwei Sekunden
    // ueber der Seite - ohne dieses Warten zeigte das Bild die Marke statt der
    // Seite. Ohne Startbild kehrt das Warten sofort zurueck.
    await startbildAbwarten(seite);
    await seite.waitForTimeout(400);

    // Mit --konto ist eine angemeldete Seite erwartet - zeigt sie stattdessen
    // die Anmeldemaske, ist die Sitzung unterwegs verlorengegangen. Ohne
    // --konto ist die Anmeldemaske das erwartete Ergebnis (siehe Aufruf oben)
    // und kein Befund. Eine sonst unerwartete Zielseite (z. B. eine
    // Fehlerseite oder ein Redirect der Anwendung) ist unabhaengig davon
    // immer ein fehlgeschlagener Aufruf. Ohne diese Pruefung landet ein
    // fehlgeschlagener Aufruf unbemerkt als "Ohne Befund" im Bericht.
    const zurAnmeldungWeitergeleitet =
      Boolean(anmeldeAdresse) &&
      (await seite
        .getByRole('heading', { name: 'Anmelden' })
        .isVisible()
        .catch(() => false));
    const tatsaechlicherPfad = new URL(seite.url()).pathname.replace(/\/+$/, '') || '/';
    const erwarteterPfad = (pfad.split('?')[0] || '/').replace(/\/+$/, '') || '/';
    const unerwartetesZiel = !zurAnmeldungWeitergeleitet && tatsaechlicherPfad !== erwarteterPfad;

    const zielBefund = zurAnmeldungWeitergeleitet ? 'anmeldung' : unerwartetesZiel ? 'ziel' : null;
    const name =
      (pfad.replace(/^\//, '').replace(/[^\w-]+/g, '-') || 'start') +
      `-${breite}px` +
      (zielBefund ? `-BEFUND-${zielBefund}` : '') +
      '.png';
    const datei = `${ZIEL}/${name}`;
    await seite.screenshot({ path: datei, fullPage: true });

    console.log(`${datei}`);
    if (zurAnmeldungWeitergeleitet) {
      befunde += 1;
      console.log(
        `  BEFUND: zur Anmeldung weitergeleitet statt ${pfad} - Sitzung von ${kontoName} ist unterwegs verlorengegangen`,
      );
    } else if (unerwartetesZiel) {
      befunde += 1;
      console.log(`  BEFUND: unerwartete Zielseite ${tatsaechlicherPfad} statt ${erwarteterPfad}`);
    }

    // Waagerechtes Scrollen ist auf einem Handy der haeufigste Layoutfehler und
    // Punkt 1 der Oberflaechen-Checkliste. Ein paar Pixel Toleranz gegen
    // Rundung beim Zoom.
    const ueberbreit = await seite.evaluate(
      // eslint-disable-next-line no-undef -- laeuft im Browser, nicht in Node
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );

    if (ueberbreit > 2) {
      befunde += 1;
      console.log(`  BEFUND: waagerechtes Scrollen, ${ueberbreit} px zu breit`);
    }
    if (fehlendeDateien.length > 0) {
      befunde += 1;
      console.log(`  BEFUND: ${fehlendeDateien.length} Anfrage(n) ohne Erfolg`);
      for (const eintrag of fehlendeDateien.slice(0, 3)) console.log(`    ${eintrag}`);
    }
    if (konsolenfehler.length > 0) {
      befunde += 1;
      console.log(`  BEFUND: ${konsolenfehler.length} Konsolenfehler`);
      for (const fehler of konsolenfehler.slice(0, 3)) console.log(`    ${fehler}`);
    }
  } catch (fehler) {
    befunde += 1;
    console.log(`${pfad}\n  BEFUND: nicht erreichbar - ${String(fehler).split('\n')[0]}`);
  } finally {
    await seite.close();
  }
}

await browser.close();

if (befunde > 0) {
  console.error(`\n${befunde} Befund(e). Die Bilder liegen trotzdem in ${ZIEL}/.`);
  process.exit(1);
}
console.log(`\nOhne Befund. Die Bilder liegen in ${ZIEL}/.`);
