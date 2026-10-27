import { formatDate } from '@/lib/datum';
import {
  bauartLabels,
  type Fassungsinhalt,
  type Grundlagenfassung,
  type TreatmentBasisDetail,
} from './api';

/**
 * Was eine Änderung an einer Grundlage ersetzt hat (BEF-124, ANN-562).
 *
 * Der Server hält je Änderung den Inhalt **davor** fest. Was sich geändert
 * hat, ergibt der Vergleich mit dem nächsten Stand: der nächstjüngeren Fassung
 * oder, bei der jüngsten, dem aktuellen Inhalt. Gezeigt wird je Feld der
 * frühere Wert - das ist der „ursprüngliche Inhalt“ aus § 630f Abs. 1 BGB.
 */

export interface Aenderung {
  feld: string;
  vorher: string;
}

export interface Verlaufseintrag {
  version_no: number;
  replaced_at: string;
  replaced_by_name: string | null;
  aenderungen: Aenderung[];
}

const FELDER: { feld: string; wert: (inhalt: Fassungsinhalt) => string }[] = [
  { feld: 'Art', wert: (i) => bauartLabels[i.treatment_basis_kind] },
  { feld: 'Verordner:in', wert: (i) => text(i.prescriber_name) },
  { feld: 'Datum', wert: (i) => formatDate(i.issued_on) },
  {
    feld: 'Heilmittel',
    wert: (i) =>
      i.items.length === 0
        ? '—'
        : i.items.map((p) => `${p.remedy} × ${p.prescribed_quantity}`).join(', '),
  },
  { feld: 'Anzahl möglicher Termine', wert: (i) => String(i.appointment_count) },
  { feld: 'Frequenz', wert: (i) => text(i.frequency_note) },
  { feld: 'Diagnose oder Leitsymptomatik', wert: (i) => text(i.diagnosis) },
  { feld: 'ICD-10', wert: (i) => text(i.diagnosis_icd10) },
  { feld: 'Anmerkungen', wert: (i) => text(i.note) },
  { feld: 'Therapieziel', wert: (i) => text(i.therapy_goal) },
  { feld: 'Hinweis der Verordner:in', wert: (i) => text(i.prescriber_note) },
  { feld: 'Empfehlung zum Verordnungsende', wert: (i) => text(i.follow_up_recommendation) },
];

function text(wert: string | null): string {
  return wert?.trim() ? wert : '—';
}

/** Der aktuelle Stand in derselben Form wie eine Fassung. */
export function aktuellerInhalt(grundlage: TreatmentBasisDetail): Fassungsinhalt {
  return {
    treatment_basis_kind: grundlage.treatment_basis_kind,
    prescriber_name: grundlage.prescriber_name,
    issued_on: grundlage.issued_on,
    appointment_count: grundlage.appointment_count,
    frequency_note: grundlage.frequency_note,
    note: grundlage.note,
    diagnosis: grundlage.diagnosis,
    diagnosis_icd10: grundlage.diagnosis_icd10 ?? null,
    therapy_goal: grundlage.therapy_goal,
    prescriber_note: grundlage.prescriber_note,
    follow_up_recommendation: grundlage.follow_up_recommendation,
    items: [...grundlage.items]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((p) => ({ remedy: p.remedy, prescribed_quantity: p.prescribed_quantity })),
  };
}

/** Die Felder, in denen sich `vorher` von `nachher` unterscheidet, mit dem früheren Wert. */
export function aenderungen(vorher: Fassungsinhalt, nachher: Fassungsinhalt): Aenderung[] {
  return FELDER.flatMap(({ feld, wert }) => {
    const alt = wert(vorher);
    return alt === wert(nachher) ? [] : [{ feld, vorher: alt }];
  });
}

/**
 * Der Verlauf zum Anzeigen, jüngste Änderung zuerst. `fassungen` kommt vom
 * Server bereits so sortiert; hier wird trotzdem nach Nummer geordnet, damit
 * der Vergleich nie den falschen Nachbarn trifft.
 */
export function verlauf(
  fassungen: readonly Grundlagenfassung[],
  aktuell: Fassungsinhalt,
): Verlaufseintrag[] {
  const absteigend = [...fassungen].sort((a, b) => b.version_no - a.version_no);
  return absteigend.map((fassung, index) => ({
    version_no: fassung.version_no,
    replaced_at: fassung.replaced_at,
    replaced_by_name: fassung.replaced_by_name,
    aenderungen: aenderungen(
      fassung.content,
      index === 0 ? aktuell : absteigend[index - 1]!.content,
    ),
  }));
}
