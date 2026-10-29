import { useI18n } from '../i18n/context';

/** Required attributions for every data source and the map tiles. */
export function AboutPage() {
  const { t } = useI18n();
  return (
    <article className="page narrow-wide about">
      <h1>{t.about.title}</h1>
      <p>{t.about.intro}</p>
      <h2>{t.about.forecasts}</h2>
      <p>
        <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">
          Open-Meteo
        </a>
        : {t.about.forecastsText}
      </p>
      <h2>{t.about.stations}</h2>
      <p>
        <a href="https://www.meteonetwork.it/" target="_blank" rel="noreferrer">
          MeteoNetwork
        </a>
        : {t.about.meteonetworkText}{' '}
        <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">
          CC BY 4.0
        </a>
      </p>
      <p>
        <a href="https://stations.windy.com/" target="_blank" rel="noreferrer">
          Windy Stations
        </a>
        : {t.about.windyText}
      </p>
      <h2>{t.about.maps}</h2>
      <p>
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
          OpenStreetMap
        </a>
        : {t.about.osmText}
      </p>
    </article>
  );
}
