import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { GefuehrterAblauf } from '@/components/ui/GefuehrterAblauf';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { EINGABETEXTE, useTextverlustschutz } from '@/app/Textverlustschutz';
import { leseRueckweg } from '@/lib/rueckweg';
import { REIMBURSEMENTS_KEY, savePayoutAccount } from './api';
import { REIMBURSEMENTS_HOME } from './paths';
import { ibanValid, normalizeIban } from './rules';

/**
 * Die eigene IBAN für Erstattungen hinterlegen oder ändern (ANN-601). Eine
 * Seite, eine Frage; die Prüfziffer prüft schon die Seite, verbindlich der
 * Server. Danach steht sie maskiert da - auch für die Person selbst.
 */
export function PayoutAccountPage() {
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const returnTo = leseRueckweg(search, REIMBURSEMENTS_HOME);
  const queryClient = useQueryClient();
  const [iban, setIban] = useState('');
  const [touched, setTouched] = useState(false);
  const valid = ibanValid(iban);
  const { freigeben, schutz } = useTextverlustschutz({
    ungespeichert: iban.trim() !== '',
    kompakt: true,
    texte: { ...EINGABETEXTE, bezeichnung: 'IBAN noch nicht gespeichert' },
  });
  const save = useMutation({
    mutationFn: () => savePayoutAccount(normalizeIban(iban)),
    onSuccess: async (account) => {
      freigeben();
      await queryClient.invalidateQueries({ queryKey: REIMBURSEMENTS_KEY });
      void navigate(returnTo, { state: { meldung: `IBAN gespeichert: ${account.iban_masked}.` } });
    },
  });

  return (
    <GefuehrterAblauf
      objekt="Auszahlung"
      titel="Auf welches Konto?"
      schliessen="Schließen"
      onSchliessen={() => void navigate(returnTo)}
      seite="account"
      schutz={schutz}
      abschluss
      fuss={
        <div className="flex flex-col gap-2">
          {save.isError ? <Statusmeldung ton="fehler">{save.error.message}</Statusmeldung> : null}
          <Button
            className="w-full"
            disabled={!valid || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? 'Wird gespeichert …' : 'IBAN speichern'}
          </Button>
        </div>
      }
    >
      {/* Großbuchstaben, keine Autokorrektur und keine Vorschläge: Am
          Telefon kann die Autokorrektur die IBAN beim Tippen verändern. */}
      <Field
        label="IBAN"
        placeholder="DE89 3704 0044 0532 0130 00"
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        autoComplete="off"
        data-autofocus
        value={iban}
        error={
          touched && iban.trim() !== '' && !valid
            ? 'Die IBAN stimmt nicht – bitte die Ziffern prüfen.'
            : undefined
        }
        onBlur={() => setTouched(true)}
        onChange={(e) => setIban(e.target.value)}
      />
    </GefuehrterAblauf>
  );
}
