import { Link } from 'react-router';
import { useI18n } from '../i18n/context';

export function NotFoundPage() {
  const { t } = useI18n();
  return (
    <article className="page">
      <h1>{t.notFound.title}</h1>
      <p>
        <Link to="/">{t.notFound.back}</Link>
      </p>
    </article>
  );
}
