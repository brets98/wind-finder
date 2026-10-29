import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { dictionaries, I18nContext, LANGUAGES, locales, type Language } from './context';

const STORAGE_KEY = 'wind-finder.language';

/** The language chosen before on this browser, otherwise the browser's own, otherwise the first. */
function preferredLanguage(): Language {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (LANGUAGES.includes(saved as Language)) return saved as Language;
  } catch {
    // Storage blocked (private mode, settings): fall back to the browser language
  }
  const browser = navigator.language?.toLowerCase().slice(0, 2);
  return LANGUAGES.find((l) => l === browser) ?? LANGUAGES[0];
}

export function LanguageProvider({
  children,
  language: initial,
}: {
  children: ReactNode;
  /** Fixed starting language (tests); otherwise the saved or browser one */
  language?: Language;
}) {
  const [language, setLanguageState] = useState<Language>(() => initial ?? preferredLanguage());

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const value = useMemo(
    () => ({
      language,
      setLanguage: (next: Language) => {
        setLanguageState(next);
        try {
          localStorage.setItem(STORAGE_KEY, next);
        } catch {
          // Not saved: the choice lasts until the page is reloaded
        }
      },
      t: dictionaries[language],
      locale: locales[language],
    }),
    [language],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
