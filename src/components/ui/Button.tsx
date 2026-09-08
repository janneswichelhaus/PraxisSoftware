import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react';
import { buttonKlassen, type Variant } from './buttonStile';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  children: ReactNode;
  /** Fuer Fokusfuehrung, etwa bei einer Rueckfrage vor einem Vorgang. */
  ref?: Ref<HTMLButtonElement>;
}

export function Button({ variant = 'primary', className = '', ...props }: ButtonProps) {
  return <button className={buttonKlassen(variant, className)} {...props} />;
}
