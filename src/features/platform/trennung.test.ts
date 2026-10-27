import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Der Plattformcode ist ein eigenes Feature (ADR-023 Punkt 26).
 *
 * Er spricht nur Plattformprojektionen an und importiert keine Datenzugriffe
 * der Praxisfeatures. Gemeinsam sind Bausteine (`@/components`), Hilfen
 * (`@/lib`), die Anmeldung, die für alle Konten gleich ist (Punkt 17), und
 * `marke/`. Geprüft über den Quelltext wie `src/features/preview/trennung.test.ts`:
 * Ein Import in einer Ecke, die kein Test durchläuft, bliebe sonst unbemerkt.
 */

const VERZEICHNIS = join(import.meta.dirname, '.');

/** Was von außerhalb des Features kommen darf. Ein neuer Eintrag ist Teil des Reviews. */
const ERLAUBT: readonly RegExp[] = [
  /^react$/,
  /^react-router-dom$/,
  /^zod$/,
  /^@tanstack\/react-query$/,
  /^@\/components\//,
  /^@\/lib\//,
  /^@\/app\/Vollseite$/,
  // BEF-046: die Zeile nach einem gescheiterten Nachladen - Rahmen ohne
  // Datenzugriff; was nachgeladen wird, entscheidet `App.tsx`.
  /^@\/app\/Profilhinweis$/,
  // DR-115, DR-118: die feste Tabelle der Tab-Titel (nie mit Daten) und der
  // Verbindungszustand des Geräts (allein `navigator.onLine`, ANN-015) -
  // Rahmen ohne Datenzugriff und ohne Import aus einem Praxisfeature.
  /^@\/app\/(tabtitel|verbindung)$/,
  // Schritt 1c (Handoff 2026-10-22, 5.2): die Zeichen der Türseiten - nur
  // Zeichnungen, ohne Datenzugriff.
  /^@\/app\/tuerzeichen$/,
  // Anmeldung und Sitzung gelten für Praxis- und Plattformkonten gleich (Punkt 17).
  /^@\/features\/auth\/(eigeneAbmeldung|fokus|fremdeSitzung|sessionContext)$/,
  // SEC-EPIC-002: Passkey, App-PIN und ihre Einrichtung - die Anmeldung ohne
  // Kennwort gilt ebenso für alle Konten gleich (ADR-025 Punkt 8).
  /^@\/features\/auth\/(appPin|passkey|linkEinloesen)$/,
  /^@\/features\/auth\/einrichtung\/(AnmeldungEinrichten|AnmeldungVerwalten)$/,
  // POR-012: der Fragebogen als Baustein und seine Definitionen - Produktinhalt
  // des Releases (ANN-083), kein Datenzugriff; die Erhebungen selbst kommen
  // über die Plattformprojektion.
  /^@\/features\/assessments\/(FragebogenFelder|antworten|darstellung|instrumente|schema)$/,
  // TRK-009: die Freigabe ohne Netz per Passkey und was die Sperre ohne Netz
  // öffnet - die Sperre gilt für alle Konten gleich (ADR-025 Punkt 16).
  /^@\/features\/auth\/(freigabeOhneNetz|sitzungssperre\/Sitzungssperre)$/,
  // UEB-009: das Planblatt und die Dosierung in Worten - Darstellung ohne
  // Datenzugriff (ANN-303); die Pläne kommen über die Plattformprojektion.
  /^@\/features\/exercise-plans\/(Planblatt|dosierung)$/,
  // Überholung 6: der Schutz ungesendeter Angaben im geführten Ablauf
  // (Rückfrage vor dem Weggehen, Zurückgeste einen Schritt zurück) - ein
  // Baustein ohne Datenzugriff, wie im Check-Up am Rad.
  /^@\/app\/Textverlustschutz$/,
  // ERN-002: Form, Wörter und Anzeige der Zielwerte - ohne Datenzugriff; die
  // Zahlen kommen über die Plattformprojektion (`platform_nutrition`).
  /^@\/features\/nutrition\/(Rechenweg|texte|zielwerte|eingabe)$/,
  // ERN-EPIC-002: Suche, Formular und Form der Lebensmittel - ohne
  // Datenzugriff; gesucht und gespeichert wird über die Plattformwege in
  // `api.ts` (die der Praxis stehen in `nutrition/lebensmittelApi.ts`).
  /^@\/features\/nutrition\/(LebensmittelSuche|LebensmittelFormular|lebensmittel)$/,
  // ERN-EPIC-003: Form und Texte des Tagebuchs - ohne Datenzugriff.
  /^@\/features\/nutrition\/tagebuch$/,
  /^\.\//,
];

function quelldateien(): string[] {
  return readdirSync(VERZEICHNIS)
    .filter((name) => /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name))
    .map((name) => join(VERZEICHNIS, name));
}

function importe(pfad: string): string[] {
  const quelltext = readFileSync(pfad, 'utf8');
  return [...quelltext.matchAll(/from\s+'([^']+)'/g)].map((treffer) => treffer[1]!);
}

describe('Trennung des Plattformcodes (ADR-023 Punkt 26)', () => {
  const dateien = quelldateien();

  it('findet die Dateien ueberhaupt', () => {
    expect(dateien.length).toBeGreaterThanOrEqual(4);
  });

  it('importiert nichts aus den Praxisfeatures', () => {
    const fremd = dateien.flatMap((pfad) =>
      importe(pfad)
        .filter((ziel) => !ERLAUBT.some((muster) => muster.test(ziel)))
        .map((ziel) => `${pfad.slice(VERZEICHNIS.length + 1)}: ${ziel}`),
    );
    expect(fremd).toEqual([]);
  });

  it('ruft nur Plattformprojektionen und den Zugangsdienst auf', () => {
    const aufrufe = dateien.flatMap((pfad) => {
      const quelltext = readFileSync(pfad, 'utf8');
      return [
        ...[...quelltext.matchAll(/\.rpc\(\s*'([^']+)'/g)].map((t) => `rpc:${t[1]!}`),
        ...[...quelltext.matchAll(/\.from\(\s*'([^']+)'/g)].map((t) => `tabelle:${t[1]!}`),
        ...[...quelltext.matchAll(/functions\.invoke[^(]*\(\s*'([^']+)'/g)].map(
          (t) => `function:${t[1]!}`,
        ),
      ];
    });
    // POR-007: „Wer für mich Zugang hat" und das Beenden einer Begleitung -
    // beide prüfen den Zugang über app.platform_access_allows.
    expect([...new Set(aufrufe)].sort()).toEqual([
      'function:patient-file-verify',
      'function:platform-access',
      // KND-003: den Trainingsvertrag im eigenen Konto schließen.
      'rpc:accept_platform_training_offer',
      'rpc:add_platform_diary_entry',
      // KOM-001: Nachrichten an die Praxis.
      'rpc:add_platform_message_entry',
      'rpc:add_platform_water',
      // ANG-003: das eigene Nachsorge-Abo kündigen.
      'rpc:cancel_platform_aftercare',
      'rpc:close_platform_message',
      // POR-012: der Befundbogen vorab.
      'rpc:complete_platform_questionnaire_response',
      // KOM-007: Foto und Video an der eigenen Rückfrage (ADR-017 Abschnitt L);
      // die Prüfung am Server mit attachment_id (ANN-337).
      'rpc:confirm_message_attachment_upload',
      'rpc:copy_platform_diary',
      'rpc:delete_platform_diary_entry',
      // ERN-EPIC-002: eigene Lebensmittel löschen und speichern, suchen im
      // eigenen Katalog, die Quellenangabe (Inhalt ohne Personenbezug).
      'rpc:delete_platform_food',
      'rpc:delete_platform_message_attachment',
      'rpc:discard_message_attachment_upload',
      'rpc:discard_platform_questionnaire_response',
      'rpc:end_platform_companion',
      // UEB-010: eine Einheit am eigenen Plan.
      // POR-019: der eigene Einstieg.
      'rpc:finish_platform_onboarding',
      // POR-014: freigegebene Dokumente und ihr Verweis.
      'rpc:issue_platform_file_link',
      'rpc:issue_platform_message_attachment_link',
      'rpc:list_food_sources',
      // ALT-003: die eigenen Gewohnheiten, Tage vermerken, pausieren.
      'rpc:mark_platform_habit',
      'rpc:pause_platform_habit',
      // POR-009: die eigenen Wünsche, einen Termin wünschen, zurückziehen.
      // ANG-003: das eigene Nachsorge-Abo.
      'rpc:platform_aftercare',
      'rpc:platform_appointment_requests',
      // POR-008: die eigenen Termine.
      'rpc:platform_appointments',
      // TRK-003: der eigene Check-in und „Meine Angaben".
      'rpc:platform_checkins',
      // POR-016: Einwilligungen lesen und schreiben.
      'rpc:platform_consents',
      'rpc:platform_context',
      'rpc:platform_diary_reminders',
      // UEB-009: die eigenen Pläne.
      'rpc:platform_exercise_plans',
      // POR-018: die eigenen Daten herunterladen.
      'rpc:platform_export',
      // BEF-189: der Export einer Begleitung, nur ihre eigene Wahl.
      'rpc:platform_export_notifications',
      'rpc:platform_files',
      'rpc:platform_habits',
      // POR-013: eigene Rechnungen.
      'rpc:platform_invoice',
      'rpc:platform_invoices',
      'rpc:platform_messages',
      // KOM-011: Benachrichtigungen des eigenen Zugangs und Push auf dem Gerät.
      'rpc:platform_notification_settings',
      // ERN-002: die eigene Ernährungsberatung (Recht nutrition).
      'rpc:platform_nutrition',
      'rpc:platform_nutrition_diary',
      'rpc:platform_onboarding',
      'rpc:platform_questionnaire',
      'rpc:platform_representatives',
      // ANG-008: Pakete der Preisliste und die eigenen Pakete.
      // KND-003: das Angebot aus der Akte und der eigene Vertrag.
      'rpc:platform_training_contract',
      'rpc:platform_training_offer',
      'rpc:platform_training_offers',
      'rpc:platform_training_packages',
      'rpc:prepare_message_attachment_upload',
      'rpc:record_platform_consent',
      'rpc:record_platform_nutrition_consent',
      'rpc:record_platform_nutrition_weight',
      'rpc:register_platform_push_subscription',
      'rpc:remove_platform_push_subscription',
      'rpc:request_platform_appointment',
      // POR-010: Termin ändern oder absagen als Wunsch.
      'rpc:request_platform_appointment_change',
      'rpc:save_platform_food',
      'rpc:save_platform_questionnaire_response',
      'rpc:search_platform_foods',
      'rpc:set_platform_diary_favorite',
      'rpc:set_platform_diary_hide_numbers',
      'rpc:set_platform_diary_reminders',
      // UEB-011: die eigenen Übungstage.
      'rpc:set_platform_exercise_days',
      'rpc:set_platform_notification_settings',
      'rpc:set_platform_nutrition_diary',
      'rpc:set_platform_nutrition_target_weight',
      'rpc:start_platform_message',
      'rpc:submit_platform_checkin',
      // TRK-007: die Einheit, auch ohne Netz erfasst (ADR-024 Punkt 7).
      'rpc:sync_platform_exercise_session',
      'rpc:update_platform_diary_entry',
      'rpc:withdraw_platform_appointment_request',
      // KND-004: den Trainingsvertrag widerrufen (§ 356a BGB).
      'rpc:withdraw_platform_training_contract',
    ]);
  });

  it('wuerde einen Import aus einem Praxisfeature tatsaechlich finden', () => {
    expect(ERLAUBT.some((muster) => muster.test('@/features/patients/api'))).toBe(false);
    expect(ERLAUBT.some((muster) => muster.test('@/features/session/useCurrentUser'))).toBe(false);
  });
});
