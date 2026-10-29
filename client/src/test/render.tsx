import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import type { Language } from '../i18n/context';
import { LanguageProvider } from '../i18n/LanguageProvider';

/** Renders `ui` with the strings of `language`. */
export function renderIn(language: Language, ui: ReactElement) {
  return render(<LanguageProvider language={language}>{ui}</LanguageProvider>);
}
