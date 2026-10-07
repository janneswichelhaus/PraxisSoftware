import { useEffect, useState, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Feldgruppe } from '@/components/ui/Section';
import { Select } from '@/components/ui/Select';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { TextArea } from '@/components/ui/TextArea';
import { BEGRIFFE } from '@/lib/begriffe';
import {
  BIBLIOTHEK_SCHLUESSEL,
  saveUebung,
  saveVariante,
  schlagworte,
  type Uebung,
  type Variante,
} from './api';
import {
  AUSRUESTUNG_HOECHSTENS,
  KOERPERREGIONEN,
  KOERPERREGION_LABEL,
  NAME_HOECHSTENS,
  SCHLAGWORT_HOECHSTENS,
  TEXT_HOECHSTENS,
} from './types';

/**
 * Formulare der Übungsbibliothek (UEB-001).
 *
 * Beide melden der Seite, ob sie Ungespeichertes tragen; den Schutz davor
 * hält die Seite, weil ein Router nur eine Sperre kennt und mehrere Formulare
 * offen sein können (Muster der Textbausteine, UXR-008).
 */

interface FormularRahmen {
  /** Kennung für den Schutz der Seite. */
  formularId: string;
  onFertig: (bezeichnung: string, id: string) => void;
  onAbbrechen: () => void;
  onUngespeichert: (formularId: string, ungespeichert: boolean) => void;
  /** Hinweise und Rückfrage des Schutzes, wenn dieses Formular gemeint ist. */
  schutz: ReactNode;
}

function useMeldung(
  formularId: string,
  ungespeichert: boolean,
  onUngespeichert: FormularRahmen['onUngespeichert'],
) {
  useEffect(() => {
    onUngespeichert(formularId, ungespeichert);
  }, [formularId, ungespeichert, onUngespeichert]);
  // Ein geschlossenes Formular hält nichts mehr fest.
  useEffect(() => () => onUngespeichert(formularId, false), [formularId, onUngespeichert]);
}

function Knoepfe({
  laeuft,
  beschriftung,
  onAbbrechen,
}: {
  laeuft: boolean;
  beschriftung: string;
  onAbbrechen: () => void;
}) {
  return (
    <div className="mt-5 flex flex-wrap gap-3">
      <Button type="submit" disabled={laeuft}>
        {laeuft ? 'Wird gespeichert …' : beschriftung}
      </Button>
      <Button type="button" variant="quiet" onClick={onAbbrechen}>
        Abbrechen
      </Button>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Übung
// -----------------------------------------------------------------------------

export function UebungFormular({
  uebung,
  formularId,
  onFertig,
  onAbbrechen,
  onUngespeichert,
  schutz,
}: FormularRahmen & { uebung?: Uebung }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(uebung?.name ?? '');
  const [laie, setLaie] = useState(uebung?.lay_name ?? '');
  const [region, setRegion] = useState<string>(uebung?.body_region ?? '');
  const [fehler, setFehler] = useState<Partial<Record<'name' | 'laie' | 'region', string>>>({});

  useMeldung(
    formularId,
    name !== (uebung?.name ?? '') ||
      laie !== (uebung?.lay_name ?? '') ||
      region !== (uebung?.body_region ?? ''),
    onUngespeichert,
  );

  const speichern = useMutation({
    mutationFn: () => saveUebung({ ...(uebung ? { id: uebung.id } : {}), name, laie, region }),
    onSuccess: async (id) => {
      await queryClient.invalidateQueries({ queryKey: BIBLIOTHEK_SCHLUESSEL });
      onFertig(name.trim(), id);
    },
  });

  return (
    <form
      noValidate
      className="max-w-xl"
      onSubmit={(event) => {
        event.preventDefault();
        if (speichern.isPending) return;
        const gefunden: typeof fehler = {};
        if (!name.trim()) gefunden.name = 'Bitte die fachliche Bezeichnung angeben.';
        if (!laie.trim()) gefunden.laie = 'Bitte die Bezeichnung in Alltagssprache angeben.';
        if (!region) gefunden.region = 'Bitte eine Körperregion wählen.';
        setFehler(gefunden);
        if (Object.keys(gefunden).length > 0) return;
        speichern.mutate();
      }}
    >
      <Feldgruppe>
        <Field
          label="Bezeichnung *"
          hint="Fachlich, für die Praxis – etwa „Kniebeuge“."
          maxLength={NAME_HOECHSTENS}
          value={name}
          error={fehler.name}
          onChange={(event) => setName(event.target.value)}
        />
        <Field
          label={`Bezeichnung in ${BEGRIFFE.alltagssprache} *`}
          hint="So lesen es Patient:innen und Kund:innen – etwa „In die Hocke gehen“."
          maxLength={NAME_HOECHSTENS}
          value={laie}
          error={fehler.laie}
          onChange={(event) => setLaie(event.target.value)}
        />
        <Select
          label="Körperregion *"
          value={region}
          error={fehler.region}
          onChange={(event) => setRegion(event.target.value)}
        >
          <option value="">Bitte wählen</option>
          {KOERPERREGIONEN.map((kennung) => (
            <option key={kennung} value={kennung}>
              {KOERPERREGION_LABEL[kennung]}
            </option>
          ))}
        </Select>
      </Feldgruppe>

      {schutz}

      {speichern.isError ? (
        <Statusmeldung ton="fehler" className="mt-4">
          {speichern.error.message}
        </Statusmeldung>
      ) : null}

      <Knoepfe
        laeuft={speichern.isPending}
        beschriftung={uebung ? 'Speichern' : `${BEGRIFFE.uebung} anlegen`}
        onAbbrechen={onAbbrechen}
      />
    </form>
  );
}

// -----------------------------------------------------------------------------
// Variante
// -----------------------------------------------------------------------------

export function VarianteFormular({
  uebungId,
  variante,
  formularId,
  onFertig,
  onAbbrechen,
  onUngespeichert,
  schutz,
}: FormularRahmen & { uebungId: string; variante?: Variante }) {
  const queryClient = useQueryClient();
  const anfang = {
    name: variante?.name ?? '',
    laie: variante?.lay_name ?? '',
    anleitung: variante?.instruction ?? '',
    ausruestung: (variante?.equipment ?? []).join(', '),
    ausweichbewegungen: variante?.common_faults ?? '',
    hinweise: variante?.practice_notes ?? '',
  };
  const [werte, setWerte] = useState(anfang);
  const [fehler, setFehler] = useState<Partial<Record<'name' | 'laie' | 'ausruestung', string>>>(
    {},
  );

  useMeldung(
    formularId,
    (Object.keys(anfang) as (keyof typeof anfang)[]).some((feld) => werte[feld] !== anfang[feld]),
    onUngespeichert,
  );

  function setze(feld: keyof typeof anfang, wert: string) {
    setWerte((bisher) => ({ ...bisher, [feld]: wert }));
  }

  const speichern = useMutation({
    mutationFn: () =>
      saveVariante({
        ...(variante ? { id: variante.id } : {}),
        uebungId,
        name: werte.name,
        laie: werte.laie,
        anleitung: werte.anleitung,
        ausruestung: schlagworte(werte.ausruestung),
        ausweichbewegungen: werte.ausweichbewegungen,
        hinweise: werte.hinweise,
      }),
    onSuccess: async (id) => {
      await queryClient.invalidateQueries({ queryKey: BIBLIOTHEK_SCHLUESSEL });
      onFertig(werte.name.trim(), id);
    },
  });

  return (
    <form
      noValidate
      className="max-w-xl"
      onSubmit={(event) => {
        event.preventDefault();
        if (speichern.isPending) return;
        const gefunden: typeof fehler = {};
        if (!werte.name.trim()) gefunden.name = 'Bitte die fachliche Bezeichnung angeben.';
        if (!werte.laie.trim()) {
          gefunden.laie = 'Bitte die Bezeichnung in Alltagssprache angeben.';
        }
        const worte = schlagworte(werte.ausruestung);
        if (worte.length > AUSRUESTUNG_HOECHSTENS) {
          gefunden.ausruestung = `Höchstens ${AUSRUESTUNG_HOECHSTENS} Angaben.`;
        } else if (worte.some((wort) => wort.length > SCHLAGWORT_HOECHSTENS)) {
          gefunden.ausruestung = `Jede Angabe höchstens ${SCHLAGWORT_HOECHSTENS} Zeichen.`;
        }
        setFehler(gefunden);
        if (Object.keys(gefunden).length > 0) return;
        speichern.mutate();
      }}
    >
      <Feldgruppe>
        <Field
          label="Bezeichnung *"
          hint="Fachlich, mit dem, was diese Form ausmacht – etwa „Kniebeuge am Geländer, halbe Tiefe“."
          maxLength={NAME_HOECHSTENS}
          value={werte.name}
          error={fehler.name}
          onChange={(event) => setze('name', event.target.value)}
        />
        <Field
          label={`Bezeichnung in ${BEGRIFFE.alltagssprache} *`}
          hint="So lesen es Patient:innen und Kund:innen."
          maxLength={NAME_HOECHSTENS}
          value={werte.laie}
          error={fehler.laie}
          onChange={(event) => setze('laie', event.target.value)}
        />
        <TextArea
          label={`Kurzanleitung in ${BEGRIFFE.alltagssprache}`}
          hint="Was die Person liest, wenn sie übt."
          rows={4}
          maxLength={TEXT_HOECHSTENS}
          value={werte.anleitung}
          onChange={(event) => setze('anleitung', event.target.value)}
        />
        <Field
          label="Ausrüstung"
          hint="Mit Komma getrennt – etwa „Stuhl, Theraband gelb“. Ohne Angabe: keine."
          value={werte.ausruestung}
          error={fehler.ausruestung}
          onChange={(event) => setze('ausruestung', event.target.value)}
        />
        <TextArea
          label="Typische Ausweichbewegungen"
          hint="Fachlich, für die Praxis."
          rows={3}
          maxLength={TEXT_HOECHSTENS}
          value={werte.ausweichbewegungen}
          onChange={(event) => setze('ausweichbewegungen', event.target.value)}
        />
        <TextArea
          label="Hinweise für die Praxis"
          hint="Zum Nachlesen. Die Bibliothek gleicht sie mit keiner Angabe einer Person ab."
          rows={3}
          maxLength={TEXT_HOECHSTENS}
          value={werte.hinweise}
          onChange={(event) => setze('hinweise', event.target.value)}
        />
      </Feldgruppe>

      {schutz}

      {speichern.isError ? (
        <Statusmeldung ton="fehler" className="mt-4">
          {speichern.error.message}
        </Statusmeldung>
      ) : null}

      <Knoepfe
        laeuft={speichern.isPending}
        beschriftung={variante ? 'Speichern' : `${BEGRIFFE.variante} anlegen`}
        onAbbrechen={onAbbrechen}
      />
    </form>
  );
}
