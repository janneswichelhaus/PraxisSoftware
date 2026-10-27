import { useEffect, useState, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Disclosure } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { Formularfuss } from '@/components/ui/Formularfuss';
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
 * Formulare der Übungsbibliothek (UEB-001; Welle B: Formularfuß, Übung und
 * erste Variante in einem Formular).
 *
 * Alle melden der Seite, ob sie Ungespeichertes tragen; den Schutz davor hält
 * die Seite, weil ein Router nur eine Sperre kennt und mehrere Formulare
 * offen sein können (Muster der Textbausteine, UXR-008).
 */

interface FormularRahmen {
  /** Kennung für den Schutz der Seite. */
  formularId: string;
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
    <Formularfuss>
      <Button type="submit" disabled={laeuft}>
        {laeuft ? 'Wird gespeichert …' : beschriftung}
      </Button>
      <Button type="button" variant="quiet" onClick={onAbbrechen}>
        Abbrechen
      </Button>
    </Formularfuss>
  );
}

// -----------------------------------------------------------------------------
// Die Felder: Übung (Bezeichnungen, Region) und Variante (Anleitung, Ausrüstung …)
// -----------------------------------------------------------------------------

type UebungFeld = 'name' | 'laie' | 'region';
type VarianteFeld = 'name' | 'laie' | 'ausruestung';

function Bezeichnungen({
  name,
  laie,
  fehler,
  onName,
  onLaie,
}: {
  name: string;
  laie: string;
  fehler: Partial<Record<'name' | 'laie', string | undefined>>;
  onName: (wert: string) => void;
  onLaie: (wert: string) => void;
}) {
  return (
    <>
      <Field
        label="Bezeichnung *"
        hint="Fachlich, für die Praxis – etwa „Kniebeuge am Geländer“."
        maxLength={NAME_HOECHSTENS}
        value={name}
        error={fehler.name}
        onChange={(event) => onName(event.target.value)}
      />
      <Field
        label={`Bezeichnung in ${BEGRIFFE.alltagssprache} *`}
        hint="So lesen es Patient:innen und Kund:innen – etwa „In die Hocke gehen“."
        maxLength={NAME_HOECHSTENS}
        value={laie}
        error={fehler.laie}
        onChange={(event) => onLaie(event.target.value)}
      />
    </>
  );
}

function RegionFeld({
  region,
  fehler,
  onRegion,
}: {
  region: string;
  fehler: string | undefined;
  onRegion: (wert: string) => void;
}) {
  return (
    <Select
      label="Körperregion *"
      value={region}
      error={fehler}
      onChange={(event) => onRegion(event.target.value)}
    >
      <option value="">Bitte wählen</option>
      {KOERPERREGIONEN.map((kennung) => (
        <option key={kennung} value={kennung}>
          {KOERPERREGION_LABEL[kennung]}
        </option>
      ))}
    </Select>
  );
}

interface Variantenwerte {
  anleitung: string;
  ausruestung: string;
  ausweichbewegungen: string;
  hinweise: string;
}

/** Anleitung und Ausrüstung offen, Ausweichbewegungen und Hinweise auf Abruf. */
function Variantenfelder({
  werte,
  fehler,
  setze,
}: {
  werte: Variantenwerte;
  fehler: string | undefined;
  setze: (feld: keyof Variantenwerte, wert: string) => void;
}) {
  const fachlich = (
    <>
      <TextArea
        label="Typische Ausweichbewegungen"
        hint="Fachlich, für die Praxis; je Fehler eine Zeile."
        rows={3}
        maxLength={TEXT_HOECHSTENS}
        value={werte.ausweichbewegungen}
        onChange={(event) => setze('ausweichbewegungen', event.target.value)}
      />
      <TextArea
        label="Hinweise für die Praxis"
        hint="Zum Nachlesen, ohne Angaben zu einzelnen Personen. Die Bibliothek gleicht sie mit keiner Angabe einer Person ab."
        rows={3}
        maxLength={TEXT_HOECHSTENS}
        value={werte.hinweise}
        onChange={(event) => setze('hinweise', event.target.value)}
      />
    </>
  );
  return (
    <>
      <TextArea
        label={`Anleitung in ${BEGRIFFE.alltagssprache}`}
        hint="Je Schritt eine Zeile. Für alle gleich – keine Angaben zu einzelnen Patient:innen oder Kund:innen (ANN-292)."
        rows={4}
        maxLength={TEXT_HOECHSTENS}
        value={werte.anleitung}
        onChange={(event) => setze('anleitung', event.target.value)}
      />
      <Field
        label="Ausrüstung"
        hint="Mit Komma getrennt – etwa „Stuhl, Theraband gelb“. Ohne Angabe: keine."
        value={werte.ausruestung}
        error={fehler}
        onChange={(event) => setze('ausruestung', event.target.value)}
      />
      {/* Offen, wenn beim Öffnen des Formulars schon etwas darin steht; der
          Aufklapper liest das nur einmal, Tippen klappt ihn nicht um. */}
      <Disclosure
        summary="Ausweichbewegungen und Hinweise für die Praxis"
        offen={Boolean(werte.ausweichbewegungen || werte.hinweise)}
      >
        <Feldgruppe>{fachlich}</Feldgruppe>
      </Disclosure>
    </>
  );
}

/** Prüft die Ausrüstung wie der Server: höchstens acht Angaben, je höchstens 40 Zeichen. */
function ausruestungFehler(eingabe: string): string | undefined {
  const worte = schlagworte(eingabe);
  if (worte.length > AUSRUESTUNG_HOECHSTENS) return `Höchstens ${AUSRUESTUNG_HOECHSTENS} Angaben.`;
  if (worte.some((wort) => wort.length > SCHLAGWORT_HOECHSTENS)) {
    return `Jede Angabe höchstens ${SCHLAGWORT_HOECHSTENS} Zeichen.`;
  }
  return undefined;
}

// -----------------------------------------------------------------------------
// Neue Übung: Übung und erste Variante in einem Formular (Welle B)
// -----------------------------------------------------------------------------

export interface Angelegt {
  uebungId: string;
  /** `null`, wenn nur die Übung entstand (die Variante scheiterte). */
  varianteId: string | null;
  name: string;
}

/**
 * Eine neue Übung mit ihrer ersten Variante (ANN-470) - **ein** Formular, ein
 * „Anlegen" (Analyse Training 12.10., Abschnitt 1.2: bis dahin zwei Formulare
 * und ein Seitenwechsel für eine einfache Übung). Die erste Variante trägt
 * dieselben Bezeichnungen wie die Übung; weitere Varianten entstehen in der
 * Übung.
 *
 * Zwei Aufrufe am Server (`save_exercise`, dann `save_exercise_variant`).
 * Scheitert der zweite, ist die Übung angelegt und das Formular sagt das; ein
 * zweiter Versuch legt nur noch die Variante an.
 */
export function NeueUebungFormular({
  formularId,
  onFertig,
  onAbbrechen,
  onUngespeichert,
  schutz,
  anlegenText = `${BEGRIFFE.uebung} anlegen`,
}: FormularRahmen & {
  onFertig: (angelegt: Angelegt) => void;
  anlegenText?: string;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [laie, setLaie] = useState('');
  const [region, setRegion] = useState('');
  const [werte, setWerte] = useState<Variantenwerte>({
    anleitung: '',
    ausruestung: '',
    ausweichbewegungen: '',
    hinweise: '',
  });
  const [fehler, setFehler] = useState<
    Partial<Record<UebungFeld | 'ausruestung', string | undefined>>
  >({});
  /** Die schon angelegte Übung, wenn die Variante beim ersten Versuch scheiterte. */
  const [uebungId, setUebungId] = useState<string | null>(null);

  useMeldung(
    formularId,
    Boolean(name || laie || region || Object.values(werte).some(Boolean)),
    onUngespeichert,
  );

  function setze(feld: keyof Variantenwerte, wert: string) {
    setWerte((bisher) => ({ ...bisher, [feld]: wert }));
  }

  const speichern = useMutation({
    mutationFn: async (): Promise<Angelegt> => {
      const id = uebungId ?? (await saveUebung({ name, laie, region }));
      setUebungId(id);
      const varianteId = await saveVariante({
        uebungId: id,
        name,
        laie,
        anleitung: werte.anleitung,
        ausruestung: schlagworte(werte.ausruestung),
        ausweichbewegungen: werte.ausweichbewegungen,
        hinweise: werte.hinweise,
      });
      return { uebungId: id, varianteId, name: name.trim() };
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: BIBLIOTHEK_SCHLUESSEL }),
    onSuccess: (angelegt) => {
      onUngespeichert(formularId, false);
      onFertig(angelegt);
    },
  });

  return (
    <form
      noValidate
      className="max-w-formular"
      aria-label={`Neue ${BEGRIFFE.uebung}`}
      onSubmit={(event) => {
        event.preventDefault();
        if (speichern.isPending) return;
        const gefunden: typeof fehler = {};
        if (!name.trim()) gefunden.name = 'Bitte die fachliche Bezeichnung angeben.';
        if (!laie.trim()) gefunden.laie = 'Bitte die Bezeichnung in Alltagssprache angeben.';
        if (!region) gefunden.region = 'Bitte eine Körperregion wählen.';
        const ausruestung = ausruestungFehler(werte.ausruestung);
        if (ausruestung) gefunden.ausruestung = ausruestung;
        setFehler(gefunden);
        if (Object.keys(gefunden).length > 0) return;
        speichern.mutate();
      }}
    >
      <Feldgruppe>
        <Bezeichnungen name={name} laie={laie} fehler={fehler} onName={setName} onLaie={setLaie} />
        <RegionFeld region={region} fehler={fehler.region} onRegion={setRegion} />
        <Variantenfelder werte={werte} fehler={fehler.ausruestung} setze={setze} />
      </Feldgruppe>

      {schutz}

      {speichern.isError ? (
        <Statusmeldung ton="fehler" className="mt-4">
          {uebungId
            ? `Die Übung ist angelegt, ihre erste Variante nicht: ${speichern.error.message} Ein zweiter Versuch legt nur die Variante an.`
            : speichern.error.message}
        </Statusmeldung>
      ) : null}

      <Knoepfe laeuft={speichern.isPending} beschriftung={anlegenText} onAbbrechen={onAbbrechen} />
    </form>
  );
}

// -----------------------------------------------------------------------------
// Übung bearbeiten
// -----------------------------------------------------------------------------

export function UebungFormular({
  uebung,
  formularId,
  onFertig,
  onAbbrechen,
  onUngespeichert,
  schutz,
}: FormularRahmen & { uebung: Uebung; onFertig: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(uebung.name);
  const [laie, setLaie] = useState(uebung.lay_name);
  const [region, setRegion] = useState<string>(uebung.body_region);
  const [fehler, setFehler] = useState<Partial<Record<UebungFeld, string>>>({});

  useMeldung(
    formularId,
    name !== uebung.name || laie !== uebung.lay_name || region !== uebung.body_region,
    onUngespeichert,
  );

  const speichern = useMutation({
    mutationFn: () => saveUebung({ id: uebung.id, name, laie, region }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: BIBLIOTHEK_SCHLUESSEL });
      onFertig();
    },
  });

  return (
    <form
      noValidate
      className="max-w-formular"
      aria-label={`${BEGRIFFE.uebung} bearbeiten`}
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
        <Bezeichnungen name={name} laie={laie} fehler={fehler} onName={setName} onLaie={setLaie} />
        <RegionFeld region={region} fehler={fehler.region} onRegion={setRegion} />
      </Feldgruppe>

      {schutz}

      {speichern.isError ? (
        <Statusmeldung ton="fehler" className="mt-4">
          {speichern.error.message}
        </Statusmeldung>
      ) : null}

      <Knoepfe laeuft={speichern.isPending} beschriftung="Speichern" onAbbrechen={onAbbrechen} />
    </form>
  );
}

// -----------------------------------------------------------------------------
// Variante anlegen oder bearbeiten
// -----------------------------------------------------------------------------

export function VarianteFormular({
  uebungId,
  variante,
  formularId,
  onFertig,
  onAbbrechen,
  onUngespeichert,
  schutz,
}: FormularRahmen & {
  uebungId: string;
  variante?: Variante;
  onFertig: (bezeichnung: string, id: string) => void;
}) {
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
  const [fehler, setFehler] = useState<Partial<Record<VarianteFeld, string | undefined>>>({});

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
      className="max-w-formular"
      aria-label={variante ? `${BEGRIFFE.variante} bearbeiten` : `Neue ${BEGRIFFE.variante}`}
      onSubmit={(event) => {
        event.preventDefault();
        if (speichern.isPending) return;
        const gefunden: typeof fehler = {};
        if (!werte.name.trim()) gefunden.name = 'Bitte die fachliche Bezeichnung angeben.';
        if (!werte.laie.trim()) {
          gefunden.laie = 'Bitte die Bezeichnung in Alltagssprache angeben.';
        }
        const ausruestung = ausruestungFehler(werte.ausruestung);
        if (ausruestung) gefunden.ausruestung = ausruestung;
        setFehler(gefunden);
        if (Object.keys(gefunden).length > 0) return;
        speichern.mutate();
      }}
    >
      <Feldgruppe>
        <Bezeichnungen
          name={werte.name}
          laie={werte.laie}
          fehler={fehler}
          onName={(wert) => setze('name', wert)}
          onLaie={(wert) => setze('laie', wert)}
        />
        <Variantenfelder werte={werte} fehler={fehler.ausruestung} setze={setze} />
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
