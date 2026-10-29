import { useI18n } from '../i18n/context';

/** Placeholder until the spot list arrives (Phase 1). */
export function HomePage() {
  const { t } = useI18n();
  return (
    <article className="page">
      <h1>{t.home.title}</h1>
      <p className="muted">{t.home.empty}</p>
    </article>
  );
}
