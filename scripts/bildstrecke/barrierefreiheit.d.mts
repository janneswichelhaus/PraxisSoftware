import type { Page } from '@playwright/test';

export const WCAG_TAGS: string[];
export function axeVerstoesse(seite: Page): Promise<string[]>;
export function kleineZiele(): string[];
