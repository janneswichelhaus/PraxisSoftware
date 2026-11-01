import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { Field } from '@/components/ui/Field';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { Feldgruppe, Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Formularfuss } from '@/components/ui/Formularfuss';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { Fehlerzusammenfassung } from '@/components/ui/Fehlerzusammenfassung';
import { alsFormularfehler, type Formularfehler } from '@/lib/formularfehler';
import { canManageBillingProfile, type CurrentUser } from '@/features/core';
import { EINGABETEXTE, useTextverlustschutz } from '@/app/Textverlustschutz';
import {
  fetchDatevEinstellungen,
  speichereDatevEinstellungen,
  type DatevEinstellungen,
} from './datev-api';
import {
  DATEV_FELDER as FELDER,
  datevZahl as zahl,
  pruefeDatevAngaben,
  type DatevEingabe as Eingabe,
  type DatevFeld as Feld,
} from './datev';

/** Beraternummer, Mandanten und Kontenrahmen nennt die Steuerberatung; pflegen darf nur owner. */

const ZURUECK = '/abrechnung/steuerberatung';

const BESCHRIFTUNG: Record<Feld, string> = {
  berater: 'Beraternummer',
  therapie: 'Mandantennummer Behandlung',
  training: 'Mandantennummer Training',
  rahmen: 'Kontenrahmen',
};

function feldId(feld: Feld): string {
  return `datev-${feld}`;
}

export function DatevAngabenPage({ user }: { user: CurrentUser }) {
  const einstellungen = useQuery({
    queryKey: ['datev-einstellungen'],
    queryFn: fetchDatevEinstellungen,
    retry: false,
  });

  return (
    <>
      <Rueckweg standard={ZURUECK} beschriftung="Zurück zur Steuerberatung" />
      <PageHeader title="DATEV-Angaben" description="Wie Ihre Steuerberatung sie nennt." />
      {canManageBillingProfile(user.roles) ? (
        <Abfragezustand
          abfrage={einstellungen}
          laden="Die DATEV-Angaben werden geladen …"
          fehler="Die DATEV-Angaben konnten nicht geladen werden."
        >
          {(werte) => <Formular vorhanden={werte} />}
        </Abfragezustand>
      ) : (
        <Statusmeldung>Ändern kann sie die Praxisinhaber:in.</Statusmeldung>
      )}
    </>
  );
}

function Formular({ vorhanden }: { vorhanden: DatevEinstellungen | null }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [anfang] = useState<Eingabe>(() => ({
    berater: vorhanden ? String(vorhanden.consultant_number) : '',
    therapie: vorhanden?.client_number_therapy ? String(vorhanden.client_number_therapy) : '',
    training: vorhanden?.client_number_training ? String(vorhanden.client_number_training) : '',
    // Keine Vorbelegung: Den Kontenrahmen kennt nur die Steuerberatung (ANN-828).
    rahmen: vorhanden?.chart_of_accounts ?? '',
  }));
  const [eingabe, setEingabe] = useState<Eingabe>(anfang);
  const [fehler, setFehler] = useState<Partial<Record<Feld, string>>>({});
  const [zusammenfassung, setZusammenfassung] = useState<Formularfehler[]>([]);

  const { freigeben, schutz } = useTextverlustschutz({
    ungespeichert: JSON.stringify(eingabe) !== JSON.stringify(anfang),
    texte: { ...EINGABETEXTE, bezeichnung: 'Ungespeicherte DATEV-Angaben' },
  });

  const speichern = useMutation({
    mutationFn: (werte: DatevEinstellungen) => speichereDatevEinstellungen(werte),
    onSuccess: async () => {
      freigeben();
      await queryClient.invalidateQueries({ queryKey: ['datev-einstellungen'] });
      void navigate(ZURUECK);
    },
  });

  function setzen(feld: Feld, wert: string) {
    setEingabe((alt) => ({ ...alt, [feld]: wert }));
    if (fehler[feld]) setFehler((alt) => ({ ...alt, [feld]: undefined }));
  }

  function absenden(ereignis: FormEvent) {
    ereignis.preventDefault();
    if (speichern.isPending) return;
    const gefunden = pruefeDatevAngaben(eingabe);
    setFehler(gefunden);
    setZusammenfassung(alsFormularfehler(FELDER, BESCHRIFTUNG, gefunden, feldId));
    if (Object.keys(gefunden).length > 0 || eingabe.rahmen === '') return;
    speichern.mutate({
      consultant_number: Number(eingabe.berater),
      client_number_therapy: zahl(eingabe.therapie),
      client_number_training: zahl(eingabe.training),
      chart_of_accounts: eingabe.rahmen,
    });
  }

  return (
    <form onSubmit={absenden} className="max-w-formular" noValidate>
      <Fehlerzusammenfassung fehler={zusammenfassung} />
      <Section titel="Angaben">
        <Feldgruppe>
          <Field
            label="Beraternummer *"
            feldId={feldId('berater')}
            error={fehler.berater}
            inputMode="numeric"
            value={eingabe.berater}
            onChange={(e) => setzen('berater', e.target.value)}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Mandantennummer Behandlung"
              feldId={feldId('therapie')}
              error={fehler.therapie}
              inputMode="numeric"
              value={eingabe.therapie}
              onChange={(e) => setzen('therapie', e.target.value)}
            />
            <Field
              label="Mandantennummer Training"
              feldId={feldId('training')}
              error={fehler.training}
              inputMode="numeric"
              value={eingabe.training}
              onChange={(e) => setzen('training', e.target.value)}
            />
          </div>
          <Select
            label="Kontenrahmen *"
            feldId={feldId('rahmen')}
            error={fehler.rahmen}
            value={eingabe.rahmen}
            onChange={(e) => setzen('rahmen', e.target.value)}
          >
            <option value="">Bitte wählen …</option>
            <option value="SKR03">SKR 03</option>
            <option value="SKR04">SKR 04</option>
          </Select>
        </Feldgruppe>
      </Section>

      {speichern.isError ? (
        <Statusmeldung ton="fehler" className="mt-3">
          {speichern.error.message} Die Eingaben stehen noch im Formular.
        </Statusmeldung>
      ) : null}

      {schutz}

      <Formularfuss>
        <Button type="submit" disabled={speichern.isPending}>
          {speichern.isPending ? 'Wird gespeichert …' : 'Speichern'}
        </Button>
      </Formularfuss>
    </form>
  );
}
