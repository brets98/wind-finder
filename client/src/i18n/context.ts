import { createContext, useContext } from 'react';
import { en, type Messages } from './en';

/**
 * English only for now. To add a language: a dictionary with the same keys as `en.ts`
 * (TypeScript enforces it), its code here and in `locales`, and its name in `language`.
 * The language switch appears by itself once there is more than one.
 */
export const LANGUAGES = ['en'] as const;
export type Language = (typeof LANGUAGES)[number];

export const dictionaries: Record<Language, Messages> = { en };

/** For dates and numbers. */
export const locales: Record<Language, string> = { en: 'en-GB' };

export interface I18n {
  language: Language;
  setLanguage: (language: Language) => void;
  /** The strings of the current language */
  t: Messages;
  locale: string;
}

// Without a provider (e.g. in some tests): English, fixed
export const I18nContext = createContext<I18n>({
  language: 'en',
  setLanguage: () => {},
  t: en,
  locale: locales.en,
});

export function useI18n() {
  return useContext(I18nContext);
}

/** Replaces `{key}` placeholders: fill('Remove {email}', { email: 'a@b.it' }) → 'Remove a@b.it'. */
export function fill(template: string, params: Record<string, string | number> = {}): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in params ? String(params[key]) : match,
  );
}
