#!/usr/bin/env node
// -----------------------------------------------------------------------------
// Bildschirmfotos der laufenden Anwendung, standardmaessig bei 375 px (UI-000).
//
// PROJECT_PRINCIPLES.md 2.2 ist Mobile First, und CLAUDE.md verlangt bei
// UI-Aenderungen eine Sichtpruefung bei ~375 px. Das von Hand zu tun heisst:
// Browser aufmachen, Geraeteansicht einschalten, Breite eintippen, scrollen.
// Dieses Skript nimmt die Seiten in einem Durchlauf auf und meldet dabei zwei
// Dinge, die man beim Hinsehen leicht uebersieht: waagerechtes Scrollen und
// Fehler in der Browserkonsole.
//
// Aufruf:
//   pnpm dev                                   # in einem zweiten Terminal
//   pnpm screenshots /patienten /kalender
//   pnpm screenshots --breite=1024 /patienten
//
// Die Bilder landen in .tmp/screenshots/ und sind nicht versioniert.
//
// Seiten hinter der Anmeldung brauchen einen laufenden Supabase-Stack und eine
// Sitzung im Browserprofil; ohne beides landet man auf der Anmeldemaske. In der
// Cloud-Entwicklungsumgebung ist das nicht moeglich (docs/DEVELOPMENT.md) -
// dort taugt das Skript fuer die Anmeldemaske und fuer Vorschauseiten.
// -----------------------------------------------------------------------------
import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const ZIEL = '.tmp/screenshots';
const BASIS = process.env.E2E_BASE_URL ?? 'http://localhost:5173';

const argumente = process.argv.slice(2);
const breite = Number(
  argumente.find((a) => a.startsWith('--breite='))?.slice('--breite='.length) ?? 375,
);
const pfade = argumente.filter((a) => !a.startsWith('--'));

if (pfade.length === 0) {
  console.error('Aufruf: pnpm screenshots [--breite=375] /pfad [/weiterer-pfad …]');
  console.error('Voraussetzung: die Anwendung laeuft unter ' + BASIS + ' (pnpm dev).');
  process.exit(1);
}

if (!Number.isFinite(breite) || breite < 320 || breite > 3840) {
  console.error(`Unplausible Breite: ${breite}`);
  process.exit(1);
}

await mkdir(ZIEL, { recursive: true });

const browser = await chromium.launch(
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
    : {},
);

let befunde = 0;

for (const pfad of pfade) {
  const seite = await browser.newPage({ viewport: { width: breite, height: 900 } });
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

  const name = (pfad.replace(/^\//, '').replace(/[^\w-]+/g, '-') || 'start') + `-${breite}px.png`;
  const datei = `${ZIEL}/${name}`;

  try {
    await seite.goto(BASIS + pfad, { waitUntil: 'networkidle', timeout: 20_000 });
    await seite.waitForTimeout(400);
    await seite.screenshot({ path: datei, fullPage: true });

    // Waagerechtes Scrollen ist auf einem Handy der haeufigste Layoutfehler und
    // Punkt 1 der Oberflaechen-Checkliste. Ein paar Pixel Toleranz gegen
    // Rundung beim Zoom.
    const ueberbreit = await seite.evaluate(
      // eslint-disable-next-line no-undef -- laeuft im Browser, nicht in Node
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );

    console.log(`${datei}`);
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
