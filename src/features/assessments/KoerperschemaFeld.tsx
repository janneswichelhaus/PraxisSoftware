import type { ReactNode } from 'react';

/** Platzhalter bis FRB-002d: Das Körperschema folgt als eigene Story. */
export function KoerperschemaFeld({
  legende,
}: {
  legende: ReactNode;
  bereiche: string[];
  onChange: (bereiche: string[]) => void;
}) {
  return (
    <fieldset>
      <legend className="text-ink text-[0.9375rem] font-medium">{legende}</legend>
      <p className="text-ink-muted text-sm">Das Körperschema folgt.</p>
    </fieldset>
  );
}
