import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { Button } from '@/components/ui/Button';
import { knopfKlassen } from '@/components/ui/buttonStile';
import { Disclosure } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { dayKey, formatDate } from '@/lib/datum';
import {
  aboAdressen,
  beendeAbo,
  erzeugeAbo,
  fetchEigenesAbo,
  useAboDienst,
  type EigenesAbo,
} from './kalenderabo-api';

const ABO = ['kalender-abo', 'eigenes'] as const;

/**
 * Die eigenen Termine im Kalender des Telefons (ANN-838). Die Adresse steht nur direkt nach dem
 * Erzeugen da; danach kennt auch die Anwendung sie nicht mehr, nur ihre Prüfsumme.
 */
export function KalenderAboAbschnitt() {
  const dienst = useAboDienst();
  return (
    <Section titel="Kalender-Abo">
      <Abfragezustand
        abfrage={dienst}
        laden="Das Kalender-Abo wird gefragt …"
        fehler="Das Kalender-Abo konnte nicht gefragt werden."
        leer={{
          wenn: (eingerichtet) => !eingerichtet,
          titel: 'Das Kalender-Abo ist hier noch nicht eingerichtet.',
        }}
      >
        {() => <Abo />}
      </Abfragezustand>
    </Section>
  );
}

function Abo() {
  const queryClient = useQueryClient();
  const abo = useQuery({ queryKey: ABO, queryFn: fetchEigenesAbo, retry: false });
  // Nur im Speicher dieser Seite: Nach dem Verlassen ist die Adresse fort, auch hier.
  const [neu, setNeu] = useState<string | null>(null);

  async function neuLaden() {
    await queryClient.invalidateQueries({ queryKey: ABO });
  }

  const erzeugen = useMutation({
    mutationFn: erzeugeAbo,
    onSuccess: async (adresse) => {
      setNeu(adresse);
      await neuLaden();
    },
  });
  const beenden = useMutation({
    mutationFn: beendeAbo,
    onSuccess: async () => {
      setNeu(null);
      await neuLaden();
    },
  });

  return (
    <Abfragezustand
      abfrage={abo}
      laden="Das Kalender-Abo wird geladen …"
      fehler="Das Kalender-Abo konnte nicht geladen werden."
    >
      {(stand) => (
        <div className="flex flex-col gap-4">
          <p className="text-ink-muted text-sm">
            Ihre eigenen Termine im Kalender des Telefons, nur Uhrzeit und Art.
          </p>
          {neu ? <NeueAdresse adresse={neu} /> : null}
          {stand && !neu ? <Aktiv abo={stand} /> : null}
          {stand === null && !neu ? (
            <div>
              <Button
                type="button"
                variant="secondary"
                disabled={erzeugen.isPending}
                onClick={() => erzeugen.mutate()}
              >
                {erzeugen.isPending ? 'Wird erzeugt …' : 'Abo-Adresse erzeugen'}
              </Button>
              {erzeugen.isError ? (
                <Statusmeldung ton="fehler" className="mt-2">
                  Die Abo-Adresse konnte nicht erzeugt werden. Bitte erneut versuchen.
                </Statusmeldung>
              ) : null}
            </div>
          ) : null}
          {stand || neu ? (
            <div className="flex flex-wrap gap-3">
              {neu ? null : (
                <Rueckfrage
                  ausloeser="Neue Adresse erzeugen"
                  bestaetigen="Neue Adresse erzeugen"
                  bestaetigenLaeuft="Wird erzeugt …"
                  unterDerReihe
                  onBestaetigen={() => erzeugen.mutateAsync()}
                >
                  Die bisherige Adresse gilt danach nicht mehr. Kalender, die sie nutzen, bekommen
                  keine Termine mehr, bis dort die neue steht.
                </Rueckfrage>
              )}
              <Rueckfrage
                ausloeser="Abo beenden"
                ausloeserVariante="quiet"
                bestaetigen="Abo beenden"
                bestaetigenLaeuft="Wird beendet …"
                unterDerReihe
                onBestaetigen={() => beenden.mutateAsync()}
              >
                Die Adresse gilt danach nicht mehr; Ihr Kalender bekommt keine Termine mehr aus der
                Praxis.
              </Rueckfrage>
            </div>
          ) : null}
          <Disclosure summary="So geht’s">
            <p className="text-ink-muted max-w-prose text-sm">
              iPhone und Mac: „Im Kalender öffnen“ und das Abo bestätigen. Android: In Google
              Kalender im Browser bei „Weitere Kalender“ „Per URL“ wählen und die Adresse einfügen;
              das Telefon übernimmt den Kalender. Outlook: „Kalender hinzufügen“, „Aus dem Internet
              abonnieren“. Neue Termine kommen nicht sofort an, bei Google oft erst nach Stunden.
            </p>
          </Disclosure>
        </div>
      )}
    </Abfragezustand>
  );
}

function Aktiv({ abo }: { abo: EigenesAbo }) {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return (
    <Statusmeldung ton="erfolg">Abo aktiv seit {formatDate(dayKey(abo.seit, zone))}.</Statusmeldung>
  );
}

function NeueAdresse({ adresse }: { adresse: string }) {
  const { https, webcal } = aboAdressen(adresse);
  const [kopiert, setKopiert] = useState<'ja' | 'nein' | null>(null);

  async function kopieren() {
    setKopiert(null);
    try {
      await navigator.clipboard.writeText(https);
      setKopiert('ja');
    } catch {
      setKopiert('nein');
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Statusmeldung ton="warnung">
        Die Adresse steht nur jetzt hier. Wer sie kennt, sieht Ihre Termine, ohne Namen und Adresse.
      </Statusmeldung>
      <Field
        label="Abo-Adresse"
        value={https}
        readOnly
        autoComplete="off"
        spellCheck={false}
        onFocus={(e) => e.currentTarget.select()}
      />
      <div className="flex flex-wrap gap-3">
        <Button type="button" variant="secondary" onClick={() => void kopieren()}>
          Adresse kopieren
        </Button>
        <a href={webcal} className={knopfKlassen('secondary')}>
          Im Kalender öffnen
        </a>
      </div>
      {kopiert === 'ja' ? <Statusmeldung ton="erfolg">Kopiert.</Statusmeldung> : null}
      {kopiert === 'nein' ? (
        <Statusmeldung ton="fehler">
          Die Adresse ließ sich nicht kopieren. Bitte im Feld markieren und kopieren.
        </Statusmeldung>
      ) : null}
    </div>
  );
}
