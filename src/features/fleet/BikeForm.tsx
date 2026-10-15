import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Checkbox } from '@/components/ui/Checkbox';
import { Fehlerzusammenfassung } from '@/components/ui/Fehlerzusammenfassung';
import { Field } from '@/components/ui/Field';
import { Formularfuss } from '@/components/ui/Formularfuss';
import { Feldgruppe, Section } from '@/components/ui/Section';
import { Select } from '@/components/ui/Select';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { TextArea } from '@/components/ui/TextArea';
import { Mehrfachwahl } from '@/components/ui/Wahlreihe';
import { EINGABETEXTE, useTextverlustschutz } from '@/features/documentation/Textverlustschutz';
import { alsFormularfehler } from '@/lib/formularfehler';
import { FLOTTE_SCHLUESSEL, saveBike, type Bike, type Fleet } from './api';
import { WOCHENTAGE } from './format';

/**
 * Die Angaben eines Rads: anlegen und ändern (FLT-EPIC-001, nur die
 * Praxisinhaber:in, BEF-066).
 *
 * Stammnutzer:in aus dem Mitarbeiterstamm statt Freitext - Tippfehler
 * ordneten sonst ein Rad einer Person zu, die es nicht gibt. Kein
 * Schlüsselcode und kein Zugangscode (ANN-549): Codes gehören in die
 * Zugangsverwaltung der Praxis, nicht in die Anwendung.
 *
 * Der Wochenplan sind die Tage der Stammnutzer:in; „frei“ ist, was nicht
 * gewählt ist. Ein Ersatzrad hat weder Stammnutzer:in noch Tage.
 */

const ANDERER_ORT = 'anders';

type Feld = 'name' | 'ort' | 'akku' | 'notiz';

const BESCHRIFTUNG: Record<Feld, string> = {
  name: 'Name',
  ort: 'Welcher Ort?',
  akku: 'Akku',
  notiz: 'Notiz',
};

const REIHENFOLGE: readonly Feld[] = ['name', 'ort', 'akku', 'notiz'];

const feldId = (feld: Feld) => `rad-${feld}`;

interface Werte {
  name: string;
  stammdepot: string;
  standort: string;
  ort: string;
  ersatzrad: boolean;
  stammnutzer: string;
  tage: string[];
  akku: string;
  notiz: string;
}

function startwerte(rad: Bike | null, flotte: Fleet): Werte {
  const erstesDepot = flotte.depots[0]?.id ?? '';
  return {
    name: rad?.name ?? '',
    stammdepot: rad?.home_depot_id ?? erstesDepot,
    standort: rad ? (rad.current_depot_id ?? ANDERER_ORT) : erstesDepot,
    ort: rad?.special_location ?? '',
    ersatzrad: rad?.is_spare ?? false,
    stammnutzer: rad?.regular_rider?.id ?? '',
    tage: (rad?.planned_weekdays ?? []).map(String),
    akku: rad?.battery ?? '',
    notiz: rad?.note ?? '',
  };
}

function pruefe(werte: Werte): Partial<Record<Feld, string>> {
  const fehler: Partial<Record<Feld, string>> = {};
  const name = werte.name.trim();
  if (!name) fehler.name = 'Bitte einen Namen angeben.';
  else if (name.length > 60) fehler.name = 'Höchstens 60 Zeichen.';
  if (werte.standort === ANDERER_ORT) {
    const ort = werte.ort.trim();
    if (!ort) fehler.ort = 'Bitte den Ort nennen.';
    else if (ort.length > 120) fehler.ort = 'Höchstens 120 Zeichen.';
  }
  if (werte.akku.trim().length > 80) fehler.akku = 'Höchstens 80 Zeichen.';
  if (werte.notiz.trim().length > 500) fehler.notiz = 'Höchstens 500 Zeichen.';
  return fehler;
}

export function BikeForm({
  rad,
  flotte,
  onGespeichert,
  abbrechenZiel,
}: {
  /** `null` legt ein neues Rad an. */
  rad: Bike | null;
  flotte: Fleet;
  onGespeichert: (id: string, freigeben: () => void) => void;
  abbrechenZiel: string;
}) {
  const queryClient = useQueryClient();
  const [anfang] = useState(() => startwerte(rad, flotte));
  const [werte, setWerte] = useState<Werte>(anfang);
  const [fehler, setFehler] = useState<Partial<Record<Feld, string>>>({});
  const ungespeichert = JSON.stringify(werte) !== JSON.stringify(anfang);
  const { freigeben, schutz } = useTextverlustschutz({
    ungespeichert,
    texte: { ...EINGABETEXTE, bezeichnung: 'Ungespeicherte Angaben zum Rad' },
  });

  const speichern = useMutation({
    mutationFn: () =>
      saveBike({
        id: rad?.id ?? null,
        name: werte.name.trim(),
        homeDepotId: werte.stammdepot,
        currentDepotId: werte.standort === ANDERER_ORT ? null : werte.standort,
        specialLocation: werte.ort.trim(),
        isSpare: werte.ersatzrad,
        regularRiderId: werte.stammnutzer || null,
        plannedWeekdays: werte.tage.map(Number),
        battery: werte.akku.trim(),
        note: werte.notiz.trim(),
        expectedUpdatedAt: rad?.updated_at ?? null,
      }),
    onSuccess: async (id) => {
      await queryClient.invalidateQueries({ queryKey: FLOTTE_SCHLUESSEL });
      onGespeichert(id, freigeben);
    },
    onError: (error) => {
      if (error.message.startsWith('Diesen Namen')) setFehler({ name: error.message });
    },
  });

  function setze<K extends keyof Werte>(feld: K, wert: Werte[K]) {
    setWerte((vorher) => ({ ...vorher, [feld]: wert }));
    if (feld in BESCHRIFTUNG && fehler[feld as Feld]) {
      setFehler((vorher) => ({ ...vorher, [feld]: undefined }));
    }
  }

  function absenden(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (speichern.isPending) return;
    const gefunden = pruefe(werte);
    setFehler(gefunden);
    if (Object.keys(gefunden).length > 0) return;
    speichern.mutate();
  }

  const andererOrt = werte.standort === ANDERER_ORT;
  const namensfehler = speichern.isError && speichern.error.message.startsWith('Diesen Namen');

  return (
    <form onSubmit={absenden} noValidate className="max-w-formular">
      <Fehlerzusammenfassung
        fehler={alsFormularfehler(REIHENFOLGE, BESCHRIFTUNG, fehler, feldId)}
      />
      <Section titel="Angaben">
        <Feldgruppe>
          <Field
            feldId={feldId('name')}
            label="Name"
            placeholder="z. B. Lastenrad 7"
            value={werte.name}
            error={fehler.name}
            onChange={(event) => setze('name', event.target.value)}
          />
          <Select
            label="Stammdepot"
            value={werte.stammdepot}
            onChange={(event) => setze('stammdepot', event.target.value)}
          >
            {flotte.depots.map((depot) => (
              <option key={depot.id} value={depot.id}>
                {depot.name}
              </option>
            ))}
          </Select>
          <Select
            label="Steht gerade"
            value={werte.standort}
            onChange={(event) => setze('standort', event.target.value)}
          >
            {flotte.depots.map((depot) => (
              <option key={depot.id} value={depot.id}>
                {depot.name}
              </option>
            ))}
            <option value={ANDERER_ORT}>An einem anderen Ort</option>
          </Select>
          {andererOrt ? (
            <Field
              feldId={feldId('ort')}
              label={BESCHRIFTUNG.ort}
              placeholder="z. B. Vertragswerkstatt"
              hint="Keine Anschrift von Patient:innen."
              value={werte.ort}
              error={fehler.ort}
              onChange={(event) => setze('ort', event.target.value)}
            />
          ) : null}
          <Checkbox
            label="Ersatzrad, ohne feste Stammnutzer:in"
            checked={werte.ersatzrad}
            onChange={(event) => setze('ersatzrad', event.target.checked)}
          />
          {!werte.ersatzrad ? (
            <>
              <Select
                label="Stammnutzer:in"
                value={werte.stammnutzer}
                onChange={(event) => setze('stammnutzer', event.target.value)}
              >
                <option value="">Keine</option>
                {flotte.staff.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
                {/* Eine nicht mehr aktive Stammnutzer:in bleibt wählbar,
                    bis jemand sie ersetzt. */}
                {rad?.regular_rider &&
                !flotte.staff.some((person) => person.id === rad.regular_rider?.id) ? (
                  <option value={rad.regular_rider.id}>{rad.regular_rider.name}</option>
                ) : null}
              </Select>
              <Mehrfachwahl
                legende="Fährt das Rad am"
                wahlen={WOCHENTAGE.map((tag) => ({ wert: String(tag.nr), text: tag.kurz }))}
                gewaehlt={werte.tage}
                onAendern={(tage) => setze('tage', tage)}
              />
            </>
          ) : null}
          <Field
            feldId={feldId('akku')}
            label="Akku"
            placeholder="z. B. 750 Wh"
            value={werte.akku}
            error={fehler.akku}
            onChange={(event) => setze('akku', event.target.value)}
          />
          <TextArea
            feldId={feldId('notiz')}
            rows={3}
            label="Notiz"
            hint="Keine Angaben zu Patient:innen."
            value={werte.notiz}
            error={fehler.notiz}
            onChange={(event) => setze('notiz', event.target.value)}
          />
        </Feldgruppe>
      </Section>

      {speichern.isError && !namensfehler ? (
        <Statusmeldung ton="fehler" className="mt-4">
          {speichern.error.message}
        </Statusmeldung>
      ) : null}

      {schutz}

      <Formularfuss>
        <Button type="submit" disabled={speichern.isPending}>
          {speichern.isPending ? 'Wird gespeichert …' : rad ? 'Angaben speichern' : 'Rad anlegen'}
        </Button>
        <ButtonLink to={abbrechenZiel} variant="quiet">
          Abbrechen
        </ButtonLink>
      </Formularfuss>
    </form>
  );
}
