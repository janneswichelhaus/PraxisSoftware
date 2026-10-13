import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Inhaltsflaeche } from '@/components/ui/Card';
import { Checkbox } from '@/components/ui/Checkbox';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { Field } from '@/components/ui/Field';
import { Formularfuss } from '@/components/ui/Formularfuss';
import { Kleingedrucktes } from '@/components/ui/Kleingedrucktes';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { TextArea } from '@/components/ui/TextArea';
import { Zwischentitel } from '@/components/ui/Zwischentitel';
import {
  EINGABETEXTE,
  useTextverlustschutz,
  type Verlustschutztexte,
} from '@/features/documentation/Textverlustschutz';
import { formatDate } from '@/lib/datum';
import {
  ASSESSMENT_TITEL_MAX,
  BEDINGUNGEN_MAX,
  EINHEIT_MAX,
  MESSUNGEN_MAX,
  MESSUNG_MAX,
  assessmentEntfernen,
  assessmentFesthalten,
  assessmentsKey,
  ergebnisText,
  fetchAssessments,
  nachTitel,
  seitenText,
  wiedervorlagen,
  zahlAusEingabe,
  type Assessment,
  type Assessmentsicht,
  type Messeingabe,
} from './assessments-api';

/**
 * Assessments auf der Trainingsseite (OUT-002, IDEA-OUT-007, ANN-365): je
 * Testbatterie die Messungen über die Zeit mit ihren Bedingungen, oben die
 * geplanten Wiederholungen.
 *
 * Was nicht entsteht (ADR-006 Punkte 11 und 13): keine Einordnung eines
 * Werts, kein Schwellenwert, keine Freigabe, keine Farbe. Der Seitenvergleich
 * ist eine offene Division. Ob die Bedingungen gleich waren, steht als Text
 * daneben – vergleichen tut die Betreuung.
 */
export function TrainingAssessments({ verhaeltnisId }: { verhaeltnisId: string }) {
  const sicht = useQuery({
    queryKey: assessmentsKey(verhaeltnisId),
    queryFn: () => fetchAssessments(verhaeltnisId),
    retry: false,
    // Jedes Laden ist ein protokolliertes Lesen.
    refetchOnWindowFocus: false,
  });
  if (sicht.data === null) return null;
  return (
    // Kein Erklärsatz unter dem Titel (DESIGN.md Regel 6); der Satz zur
    // fehlenden Einordnung bleibt als Kleingedrucktes (ADR-006 Punkte 11
    // und 13).
    <Section titel="Assessments">
      <Inhaltsflaeche>
        <Abfragezustand
          abfrage={sicht}
          laden="Assessments werden geladen …"
          fehler="Die Assessments konnten nicht geladen werden."
        >
          {(daten) => (daten ? <Inhalt verhaeltnisId={verhaeltnisId} sicht={daten} /> : null)}
        </Abfragezustand>
      </Inhaltsflaeche>
      <Kleingedrucktes className="mt-2">
        Gezeigt wird, was gemessen wurde – ohne Einordnung.
      </Kleingedrucktes>
    </Section>
  );
}

function Inhalt({ verhaeltnisId, sicht }: { verhaeltnisId: string; sicht: Assessmentsicht }) {
  const [formular, setFormular] = useState<'zu' | 'neu' | Assessment>('zu');
  const darfFesthalten = sicht.can_write && sicht.relationship_open && sicht.health_consent;
  const termine = wiedervorlagen(sicht.assessments, sicht.today);
  return (
    <div className="flex flex-col gap-4">
      {termine.length > 0 ? (
        <div>
          <Zwischentitel>Wiederholung</Zwischentitel>
          <ul className="flex flex-col gap-1 text-sm">
            {termine.map((t) => (
              <li key={t.titel} className="text-ink">
                <span className="font-medium">{t.titel}</span>
                {' · '}
                {t.faellig
                  ? t.am === sicht.today
                    ? 'heute geplant'
                    : `geplant war der ${formatDate(t.am)}`
                  : `geplant am ${formatDate(t.am)}`}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {sicht.assessments.length === 0 ? (
        <p className="text-ink-muted text-sm">Noch kein Assessment festgehalten.</p>
      ) : (
        nachTitel(sicht.assessments).map(([titel, liste]) => (
          <Batterie
            key={titel}
            titel={titel}
            liste={liste}
            verhaeltnisId={verhaeltnisId}
            darfEntfernen={sicht.can_write}
            darfWiederholen={darfFesthalten}
            onWiederholen={() => setFormular(liste[0]!)}
          />
        ))
      )}

      {formular !== 'zu' ? (
        <Festhalten
          verhaeltnisId={verhaeltnisId}
          heute={sicht.today}
          vorlage={formular === 'neu' ? null : formular}
          onFertig={() => setFormular('zu')}
        />
      ) : darfFesthalten ? (
        <div>
          <Button
            type="button"
            variant="secondary"
            groesse="kompakt"
            onClick={() => setFormular('neu')}
          >
            Assessment festhalten
          </Button>
        </div>
      ) : sicht.can_write && sicht.relationship_open ? (
        <Kleingedrucktes>
          Testergebnisse sind Gesundheitsangaben. Festgehalten werden sie erst mit der Einwilligung
          zu Gesundheitsangaben im Training.
        </Kleingedrucktes>
      ) : null}
    </div>
  );
}

/** Eine Testbatterie über die Zeit: je Messung eine Zeile, je Tag eine Spalte, jüngste links. */
function Batterie({
  titel,
  liste,
  verhaeltnisId,
  darfEntfernen,
  darfWiederholen,
  onWiederholen,
}: {
  titel: string;
  liste: readonly Assessment[];
  verhaeltnisId: string;
  darfEntfernen: boolean;
  darfWiederholen: boolean;
  onWiederholen: () => void;
}) {
  const zeilen = [...new Set(liste.flatMap((a) => a.results.map((r) => r.label)))];
  return (
    // Eine Gruppe in der Karte, durch eine Linie getrennt - kein Kasten im
    // Kasten (Leitfaden L2).
    <div className="border-line border-t pt-4 first:border-t-0 first:pt-0">
      <Zwischentitel>{titel}</Zwischentitel>
      {/* Eine Zeitreihe wie die `Verlaufstabelle`: je Messung eine Zeile, je
          Tag eine Spalte, jüngste links; am Telefon rollt die Tabelle in sich,
          die Messung bleibt stehen (DESIGN.md 9.11). */}
      <div
        role="region"
        aria-label={`Messungen ${titel}`}
        tabIndex={0}
        className="focus-visible:outline-accent relative max-w-full overflow-x-auto focus-visible:outline-2"
      >
        <table className="text-ink min-w-full border-collapse text-sm">
          <caption className="sr-only">Messungen {titel}, jüngste links</caption>
          <thead>
            <tr>
              <th
                scope="col"
                className="bg-surface text-ink-muted sticky left-0 py-2 pr-4 text-left font-medium"
              >
                Messung
              </th>
              {liste.map((a) => (
                <th
                  key={a.id}
                  scope="col"
                  className="py-2 pr-4 text-left font-semibold whitespace-nowrap tabular-nums"
                >
                  {formatDate(a.performed_on)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {zeilen.map((label) => (
              <tr key={label} className="border-line border-t">
                <th
                  scope="row"
                  className="bg-surface sticky left-0 py-2 pr-4 text-left font-normal"
                >
                  {label}
                </th>
                {liste.map((a) => {
                  const e = a.results.find((r) => r.label === label);
                  const seiten = e ? seitenText(e) : null;
                  return (
                    <td key={a.id} className="py-2 pr-4 align-top whitespace-nowrap tabular-nums">
                      {e ? ergebnisText(e) : <span aria-label="nicht gemessen">–</span>}
                      {seiten ? (
                        <span className="text-ink-muted block text-xs">{seiten}</span>
                      ) : null}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="mt-2 flex flex-col gap-1 text-sm">
        {liste.map((a, i) => {
          const vorige = liste[i + 1];
          const anders = vorige !== undefined && (vorige.conditions ?? '') !== (a.conditions ?? '');
          return (
            <li key={a.id} className="flex flex-wrap items-center gap-x-3">
              <span className="text-ink min-w-0 flex-1">
                <span className="font-semibold tabular-nums">{formatDate(a.performed_on)}</span>
                {' · '}Bedingungen: {a.conditions ?? 'nicht festgehalten'}
                {anders ? ` (andere als am ${formatDate(vorige.performed_on)})` : ''}
                {a.created_by_name ? ` · ${a.created_by_name}` : ''}
                {a.next_due_on ? ` · Wiederholung ${formatDate(a.next_due_on)}` : ''}
              </span>
              {darfEntfernen ? <Entfernen assessment={a} verhaeltnisId={verhaeltnisId} /> : null}
            </li>
          );
        })}
      </ul>
      {darfWiederholen ? (
        <div className="mt-2">
          <Button type="button" variant="quiet" groesse="kompakt" onClick={onWiederholen}>
            Wiederholen wie am {formatDate(liste[0]!.performed_on)}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function Entfernen({
  assessment,
  verhaeltnisId,
}: {
  assessment: Assessment;
  verhaeltnisId: string;
}) {
  const queryClient = useQueryClient();
  const [fehler, setFehler] = useState<string | undefined>(undefined);
  const tag = formatDate(assessment.performed_on);
  async function entfernen() {
    setFehler(undefined);
    try {
      await assessmentEntfernen(assessment.id);
      await queryClient.invalidateQueries({ queryKey: assessmentsKey(verhaeltnisId) });
    } catch (ursache) {
      setFehler(ursache instanceof Error ? ursache.message : undefined);
      throw ursache;
    }
  }
  return (
    <div className="basis-full sm:basis-auto">
      <Rueckfrage
        ausloeser="Entfernen"
        ausloeserVariante="quiet"
        ausloeserGroesse="kompakt"
        bezeichnung={`${assessment.title} vom ${tag} entfernen`}
        bestaetigen="Ja, entfernen"
        bestaetigenLaeuft="Wird entfernt …"
        fehler={fehler}
        onAbbrechen={() => setFehler(undefined)}
        onBestaetigen={entfernen}
      >
        „{assessment.title}“ vom {tag} wird aus dem Verlauf genommen. Wer es festgehalten und wer es
        entfernt hat, bleibt gespeichert.
      </Rueckfrage>
    </div>
  );
}

interface Zeile {
  label: string;
  einheit: string;
  seiten: boolean;
  wert: string;
  links: string;
  rechts: string;
}

const LEERE_ZEILE: Zeile = {
  label: '',
  einheit: '',
  seiten: false,
  wert: '',
  links: '',
  rechts: '',
};

const TEXTE: Verlustschutztexte = { ...EINGABETEXTE, bezeichnung: 'Ungespeichertes Assessment' };

/**
 * Festhalten – neu oder als Wiederholung: Titel, Bedingungen und Messungen
 * kommen dann vom vorigen Mal, die Werte nicht (IDEA-OUT-007: gleicher Test,
 * gleiche Bedingungen). Die Wiederholung wird gewählt, nicht vorgeschlagen.
 */
function Festhalten({
  verhaeltnisId,
  heute,
  vorlage,
  onFertig,
}: {
  verhaeltnisId: string;
  heute: string;
  vorlage: Assessment | null;
  onFertig: () => void;
}) {
  const queryClient = useQueryClient();
  const [titel, setTitel] = useState(vorlage?.title ?? '');
  const [tag, setTag] = useState(heute);
  const [bedingungen, setBedingungen] = useState(vorlage?.conditions ?? '');
  const [wiederholung, setWiederholung] = useState('');
  const [zeilen, setZeilen] = useState<Zeile[]>(
    vorlage
      ? vorlage.results.map((r) => ({
          ...LEERE_ZEILE,
          label: r.label,
          einheit: r.unit ?? '',
          seiten: r.left !== null,
        }))
      : [{ ...LEERE_ZEILE }],
  );
  const [pruefung, setPruefung] = useState<string | null>(null);
  const { schutz } = useTextverlustschutz({ ungespeichert: true, texte: TEXTE });

  const festhalten = useMutation({
    mutationFn: (messungen: Messeingabe[]) =>
      assessmentFesthalten({
        verhaeltnisId,
        titel,
        tag,
        bedingungen,
        wiederholung: wiederholung === '' ? null : wiederholung,
        messungen,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: assessmentsKey(verhaeltnisId) });
      onFertig();
    },
  });

  function aendern(index: number, teil: Partial<Zeile>) {
    setZeilen((bisher) => bisher.map((z, i) => (i === index ? { ...z, ...teil } : z)));
  }

  function absenden(event: FormEvent) {
    event.preventDefault();
    if (festhalten.isPending) return;
    const messungen: Messeingabe[] = [];
    for (const [i, z] of zeilen.entries()) {
      const nummer = i + 1;
      if (z.label.trim() === '') return setPruefung(`Messung ${nummer}: Bitte benennen.`);
      const unit = z.einheit.trim() === '' ? null : z.einheit.trim();
      if (z.seiten) {
        const left = zahlAusEingabe(z.links);
        const right = zahlAusEingabe(z.rechts);
        if (left === null || right === null)
          return setPruefung(
            `Messung ${nummer}: Bitte links und rechts eine Zahl eintragen, ohne Tausenderpunkt, höchstens zwei Nachkommastellen.`,
          );
        messungen.push({ label: z.label.trim(), unit, left, right });
      } else {
        const value = zahlAusEingabe(z.wert);
        if (value === null)
          return setPruefung(
            `Messung ${nummer}: Bitte eine Zahl eintragen, ohne Tausenderpunkt, höchstens zwei Nachkommastellen.`,
          );
        messungen.push({ label: z.label.trim(), unit, value });
      }
    }
    if (titel.trim() === '') return setPruefung('Bitte den Test benennen.');
    if (tag === '') return setPruefung('Bitte den Tag der Messung angeben.');
    if (wiederholung !== '' && wiederholung <= tag)
      return setPruefung('Die Wiederholung liegt nach dem Tag der Messung.');
    setPruefung(null);
    festhalten.mutate(messungen);
  }

  return (
    <form
      onSubmit={absenden}
      noValidate
      aria-label="Assessment festhalten"
      className="border-line max-w-formular flex flex-col gap-4 border-t pt-4"
    >
      <Zwischentitel>
        {vorlage ? `${vorlage.title} wiederholen` : 'Assessment festhalten'}
      </Zwischentitel>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="Test"
          hint="Etwa „Sprungtests Knie“ – mit demselben Namen steht die Wiederholung daneben."
          value={titel}
          maxLength={ASSESSMENT_TITEL_MAX}
          required
          onChange={(e) => setTitel(e.target.value)}
        />
        <Field
          label="Tag der Messung"
          type="date"
          value={tag}
          max={heute}
          required
          onChange={(e) => setTag(e.target.value)}
        />
      </div>
      <TextArea
        label="Messbedingungen (optional)"
        hint="Gerät, Aufwärmen, Position, Uhrzeit – damit die Wiederholung vergleichbar ist."
        value={bedingungen}
        maxLength={BEDINGUNGEN_MAX}
        rows={2}
        onChange={(e) => setBedingungen(e.target.value)}
      />
      <fieldset className="flex flex-col gap-3">
        <legend className="text-ink mb-1 text-sm font-semibold">Messungen</legend>
        {zeilen.map((z, i) => (
          <div
            key={i}
            role="group"
            aria-label={`Messung ${i + 1}`}
            // Eine Linie links statt eines Kastens im Formular (Leitfaden L2).
            className="border-line flex flex-col gap-2 border-l-2 pl-3"
          >
            <div className="grid gap-2 sm:grid-cols-[2fr_1fr]">
              <Field
                label={`Messung ${i + 1}`}
                value={z.label}
                maxLength={MESSUNG_MAX}
                onChange={(e) => aendern(i, { label: e.target.value })}
              />
              <Field
                label="Einheit (optional)"
                value={z.einheit}
                maxLength={EINHEIT_MAX}
                onChange={(e) => aendern(i, { einheit: e.target.value })}
              />
            </div>
            <Checkbox
              label="Links und rechts"
              checked={z.seiten}
              onChange={(e) => aendern(i, { seiten: e.target.checked })}
            />
            {z.seiten ? (
              <div className="grid grid-cols-2 gap-2">
                <Field
                  label="Links"
                  inputMode="decimal"
                  value={z.links}
                  onChange={(e) => aendern(i, { links: e.target.value })}
                />
                <Field
                  label="Rechts"
                  inputMode="decimal"
                  value={z.rechts}
                  onChange={(e) => aendern(i, { rechts: e.target.value })}
                />
              </div>
            ) : (
              <Field
                label="Wert"
                inputMode="decimal"
                value={z.wert}
                onChange={(e) => aendern(i, { wert: e.target.value })}
              />
            )}
            {zeilen.length > 1 ? (
              <div>
                <Button
                  type="button"
                  variant="quiet"
                  groesse="kompakt"
                  onClick={() => setZeilen((bisher) => bisher.filter((_, j) => j !== i))}
                >
                  Messung {i + 1} streichen
                </Button>
              </div>
            ) : null}
          </div>
        ))}
        {zeilen.length < MESSUNGEN_MAX ? (
          <div>
            <Button
              type="button"
              variant="secondary"
              groesse="kompakt"
              onClick={() => setZeilen((bisher) => [...bisher, { ...LEERE_ZEILE }])}
            >
              Weitere Messung
            </Button>
          </div>
        ) : null}
      </fieldset>
      <Field
        label="Wiederholung am (optional)"
        type="date"
        value={wiederholung}
        min={tag}
        onChange={(e) => setWiederholung(e.target.value)}
      />
      {pruefung ? <Statusmeldung ton="fehler">{pruefung}</Statusmeldung> : null}
      {festhalten.isError ? (
        <Statusmeldung ton="fehler">{festhalten.error.message}</Statusmeldung>
      ) : null}
      {schutz}
      <Formularfuss>
        <Button type="submit" disabled={festhalten.isPending}>
          {festhalten.isPending ? 'Wird festgehalten …' : 'Festhalten'}
        </Button>
        <Button type="button" variant="quiet" onClick={onFertig}>
          Abbrechen
        </Button>
      </Formularfuss>
    </form>
  );
}
