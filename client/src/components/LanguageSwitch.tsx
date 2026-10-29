import { LANGUAGES, useI18n, type Language } from '../i18n/context';

/** Hidden while the app has a single language. */
export function LanguageSwitch() {
  const { language, setLanguage, t } = useI18n();
  if (LANGUAGES.length < 2) return null;
  return (
    <select
      className="language-switch"
      aria-label={t.language.label}
      value={language}
      onChange={(e) => setLanguage(e.target.value as Language)}
    >
      {LANGUAGES.map((l) => (
        <option key={l} value={l}>
          {t.language[l]}
        </option>
      ))}
    </select>
  );
}
