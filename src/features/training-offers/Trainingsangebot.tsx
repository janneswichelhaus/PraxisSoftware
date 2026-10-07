import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Field } from '@/components/ui/Field';
import { ErrorState } from '@/components/ui/Feedback';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Select } from '@/components/ui/Select';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { TextArea } from '@/components/ui/TextArea';
import { formatDate } from '@/lib/datum';
import { formatEuro } from '@/lib/geld';
import {
  angebotSchluessel,
  createAngebot,
  fetchAngebote,
  fetchAngebotspakete,
  TEXT_HOECHSTENS,
  UEBERGABE_HOECHSTENS,
  UEBERSCHRIFT_HOECHSTENS,
  withdrawAngebot,
  type Angebotssicht,
  type Trainingsangebot as Angebot,
  type Uebergabeangabe,
} from './api';

/**
 * Training nach der Behandlung (KND-EPIC-001, PROJECT_PRINCIPLES.md 4.10).
 *
 * Angeboten wird mündlich im Abschlussgespräch; hier hält die Praxis fest,
 * was sie angeboten hat. Die Person sieht das Angebot in ihrem eigenen Konto
 * und schließt dort den Vertrag – mit Widerrufsbelehrung und eigener
 * Einwilligung. Aus der Akte wandert nur, was sie dort einzeln freigibt
 * (ADR-021 Punkt 7). Sichtbar für die Rollen der Akte (ANN-282); verbindlich
 * prüft der Server (ADR-004).
 */
export function Trainingsangebot({ patientId }: { patientId: string }) {
  const sicht = useQuery({
    queryKey: angebotSchluessel(patientId),
    queryFn: () => fetchAngebote(patientId),
    retry: false,
  });

  if (sicht.isPending) return null;
  if (sicht.isError) {
    return (
      <ErrorState
        title="Die Trainingsangebote konnten nicht geladen werden."
        description="Bitte die Verbindung prüfen und erneut versuchen."
        onErneut={() => sicht.refetch()}
      />
    );
  }
  if (!sicht.data) return null;

  const offen = sicht.data.offers.find((angebot) => angebot.state === 'open');
  return (
    <div
      className="border-line mt-3 border-t pt-3"
      aria-label="Training nach der Behandlung"
      role="group"
    >
      <p className="text-ink text-liste font-medium">Training nach der Behandlung</p>
      {sicht.data.offers.length === 0 ? (
        <p className="text-ink-muted text-sm">Kein Angebot.</p>
      ) : (
        <ul className="divide-line mt-1 divide-y">
          {sicht.data.offers.map((angebot) => (
            <AngebotZeile key={angebot.id} angebot={angebot} patientId={patientId} />
          ))}
        </ul>
      )}
      {offen ? null : <Anbieten patientId={patientId} sicht={sicht.data} />}
    </div>
  );
}

function standSatz(angebot: Angebot): string {
  switch (angebot.state) {
    case 'open':
      return `Offen bis ${formatDate(angebot.valid_until)}`;
    case 'withdrawn':
      return 'Zurückgezogen';
    case 'expired':
      return `Abgelaufen am ${formatDate(angebot.valid_until)}`;
  }
}

function AngebotZeile({ angebot, patientId }: { angebot: Angebot; patientId: string }) {
  return (
    <li className="flex flex-col gap-1 py-2">
      <p className="text-ink text-sm">
        {angebot.label}, ab {formatDate(angebot.starts_on)}, {formatEuro(angebot.price_cents)}
      </p>
      <p className="text-ink-muted text-sm">
        {standSatz(angebot)}
        {angebot.created_by_name ? ` · angeboten von ${angebot.created_by_name}` : ''}
      </p>
      {angebot.handover_items.length > 0 || angebot.offers_contact ? (
        <p className="text-ink-muted text-sm">
          Zur Übernahme angeboten:{' '}
          {[
            ...angebot.handover_items.map((angabe) => angabe.title),
            ...(angebot.offers_contact ? ['Kontaktdaten'] : []),
          ].join(', ')}
        </p>
      ) : null}
      {angebot.state === 'open' ? (
        <div className="mt-1">
          <Zurueckziehen id={angebot.id} patientId={patientId} />
        </div>
      ) : null}
    </li>
  );
}

function Zurueckziehen({ id, patientId }: { id: string; patientId: string }) {
  const queryClient = useQueryClient();
  const zurueck = useMutation({
    mutationFn: () => withdrawAngebot(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: angebotSchluessel(patientId) }),
  });
  return (
    <Rueckfrage
      ausloeser="Zurückziehen"
      ausloeserVariante="quiet"
      ausloeserGroesse="kompakt"
      bezeichnung="Trainingsangebot zurückziehen"
      bestaetigen="Ja, zurückziehen"
      bestaetigenLaeuft="Wird zurückgezogen …"
      fehler={zurueck.isError ? zurueck.error.message : undefined}
      onBestaetigen={() => zurueck.mutateAsync()}
      onAbbrechen={() => zurueck.reset()}
    >
      Die Person sieht das Angebot danach nicht mehr und kann es nicht mehr annehmen. Hat sie schon
      gebucht, bleibt ihr Vertrag davon unberührt.
    </Rueckfrage>
  );
}

const LEERE_ANGABE: Uebergabeangabe = { title: '', body: '' };

function Anbieten({ patientId, sicht }: { patientId: string; sicht: Angebotssicht }) {
  const queryClient = useQueryClient();
  const vorgabe =
    sicht.care_concluded_on && sicht.care_concluded_on > sicht.today
      ? sicht.care_concluded_on
      : sicht.today;
  const [offen, setOffen] = useState(false);
  const [beginn, setBeginn] = useState(vorgabe);
  const [paketId, setPaketId] = useState('');
  const [angaben, setAngaben] = useState<Uebergabeangabe[]>([]);
  const [kontakt, setKontakt] = useState(true);
  const [geprueft, setGeprueft] = useState(false);
  const [gespeichert, setGespeichert] = useState(false);

  const pakete = useQuery({
    queryKey: ['trainingsangebot', 'pakete', beginn],
    queryFn: () => fetchAngebotspakete(beginn),
    enabled: offen && beginn !== '',
    retry: false,
  });

  const speichern = useMutation({
    mutationFn: () =>
      createAngebot({
        patientId,
        paketId,
        beginn,
        uebergabe: angaben.map((angabe) => ({
          title: angabe.title.trim(),
          body: angabe.body.trim(),
        })),
        kontakt,
      }),
    onSuccess: async () => {
      setOffen(false);
      setGeprueft(false);
      setGespeichert(true);
      await queryClient.invalidateQueries({ queryKey: angebotSchluessel(patientId) });
    },
  });

  if (!offen) {
    return (
      <div className="mt-2 flex flex-col gap-3">
        {gespeichert ? (
          <Statusmeldung ton="erfolg">
            Angebot festgehalten. Die Person sieht es in ihrem Konto.
          </Statusmeldung>
        ) : null}
        {sicht.has_own_access ? null : (
          <p className="text-ink-muted max-w-prose text-sm">
            Angenommen wird im eigenen Konto. Die Person hat noch keinen Zugang zur Plattform –
            bitte zuerst unter „Plattform“ einladen.
          </p>
        )}
        <div>
          <Button
            type="button"
            variant="secondary"
            groesse="kompakt"
            onClick={() => {
              setGespeichert(false);
              setBeginn(vorgabe);
              setPaketId('');
              setAngaben([]);
              setKontakt(true);
              setOffen(true);
            }}
          >
            Training anbieten
          </Button>
        </div>
      </div>
    );
  }

  const leer = (angabe: Uebergabeangabe) => angabe.title.trim() === '' || angabe.body.trim() === '';
  const beginnFehler =
    geprueft && beginn === ''
      ? 'Bitte angeben, ab wann das Training beginnt.'
      : geprueft && beginn < vorgabe
        ? `Frühestens ab ${formatDate(vorgabe)}.`
        : undefined;
  const paketFehler = geprueft && paketId === '' ? 'Bitte ein Paket wählen.' : undefined;
  const fehlerfrei = !beginnFehler && paketId !== '' && !angaben.some(leer);

  return (
    <form
      className="mt-2 flex flex-col gap-4"
      aria-label="Training anbieten"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        setGeprueft(true);
        if (beginn === '' || beginn < vorgabe || !fehlerfrei) return;
        speichern.mutate();
      }}
    >
      <div className="sm:w-44">
        <Field
          label="Beginn"
          type="date"
          value={beginn}
          min={vorgabe}
          error={beginnFehler}
          onChange={(event) => {
            setBeginn(event.target.value);
            setPaketId('');
          }}
        />
      </div>
      <div className="sm:w-80">
        <Select
          label="Paket"
          value={paketId}
          error={paketFehler}
          hint={
            pakete.isError
              ? pakete.error.message
              : pakete.data && pakete.data.length === 0
                ? 'Die Preisliste nennt für diesen Tag kein Paket.'
                : undefined
          }
          onChange={(event) => setPaketId(event.target.value)}
        >
          <option value="">Bitte wählen</option>
          {(pakete.data ?? []).map((paket) => (
            <option key={paket.catalog_item_id} value={paket.catalog_item_id}>
              {paket.label} – {formatEuro(paket.unit_price_cents)}
            </option>
          ))}
        </Select>
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-ink mb-1 text-sm font-medium">Aus der Behandlung mitgeben</legend>
        <p className="text-ink-muted max-w-prose text-sm">
          Die Person sieht jede Angabe wörtlich und gibt sie einzeln frei. Nur was sie freigibt,
          wird ins Training kopiert.
        </p>
        {angaben.map((angabe, index) => (
          <div key={index} className="border-line flex flex-col gap-2 border-l-2 pl-3">
            <Field
              label={`Überschrift ${index + 1}`}
              value={angabe.title}
              maxLength={UEBERSCHRIFT_HOECHSTENS}
              error={geprueft && angabe.title.trim() === '' ? 'Bitte eine Überschrift.' : undefined}
              onChange={(event) =>
                setAngaben(
                  angaben.map((a, i) => (i === index ? { ...a, title: event.target.value } : a)),
                )
              }
            />
            <TextArea
              label={`Text ${index + 1}`}
              rows={3}
              value={angabe.body}
              maxLength={TEXT_HOECHSTENS}
              error={geprueft && angabe.body.trim() === '' ? 'Bitte einen Text.' : undefined}
              onChange={(event) =>
                setAngaben(
                  angaben.map((a, i) => (i === index ? { ...a, body: event.target.value } : a)),
                )
              }
            />
            <div>
              <Button
                type="button"
                variant="quiet"
                groesse="kompakt"
                onClick={() => setAngaben(angaben.filter((_, i) => i !== index))}
              >
                Angabe {index + 1} entfernen
              </Button>
            </div>
          </div>
        ))}
        {angaben.length < UEBERGABE_HOECHSTENS ? (
          <div>
            <Button
              type="button"
              variant="secondary"
              groesse="kompakt"
              onClick={() => setAngaben([...angaben, LEERE_ANGABE])}
            >
              Angabe hinzufügen
            </Button>
          </div>
        ) : null}
        <Checkbox
          label="Kontaktdaten der Akte zur Übernahme anbieten"
          hint="Geburtsdatum, Anschrift, Telefon und E-Mail – für Vertrag und Rechnung im Training."
          checked={kontakt}
          onChange={(event) => setKontakt(event.target.checked)}
        />
      </fieldset>

      {speichern.isError ? (
        <Statusmeldung ton="fehler">{speichern.error.message}</Statusmeldung>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={speichern.isPending}>
          {speichern.isPending ? 'Wird festgehalten …' : 'Angebot festhalten'}
        </Button>
        <Button
          type="button"
          variant="quiet"
          onClick={() => {
            setOffen(false);
            setGeprueft(false);
            speichern.reset();
          }}
        >
          Abbrechen
        </Button>
      </div>
    </form>
  );
}
