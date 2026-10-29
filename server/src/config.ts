function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name: string): string | undefined {
  return process.env[name] || undefined;
}

/** Shown in emails; the client has its own copy in `client/src/i18n/en.ts`. */
export const APP_NAME = 'Wind Finder';

export interface Config {
  port: number;
  mongodbUri: string;
  auth: {
    secret: string;
    /** Public URL of the app, e.g. https://wind.example.com */
    baseUrl: string;
    google?: { clientId: string; clientSecret: string };
  };
  sources: {
    /** MeteoNetwork STANDARD token (from POST /v3/login); without it MeteoNetwork is off */
    meteonetworkToken?: string;
    /** Windy Stations API key; without it Windy stations are off */
    windyApiKey?: string;
  };
  smtp: {
    host: string;
    port: number;
    secure: boolean;
    user?: string;
    password?: string;
    from: string;
  };
}

export function loadConfig(): Config {
  const googleClientId = optional('GOOGLE_CLIENT_ID');
  const googleClientSecret = optional('GOOGLE_CLIENT_SECRET');

  return {
    port: Number(process.env.PORT ?? 3000),
    mongodbUri: required('MONGODB_URI'),
    auth: {
      secret: required('BETTER_AUTH_SECRET'),
      baseUrl: required('BETTER_AUTH_URL'),
      google:
        googleClientId && googleClientSecret
          ? { clientId: googleClientId, clientSecret: googleClientSecret }
          : undefined,
    },
    sources: {
      meteonetworkToken: optional('METEONETWORK_TOKEN'),
      windyApiKey: optional('WINDY_API_KEY'),
    },
    smtp: {
      host: required('SMTP_HOST'),
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === 'true',
      user: optional('SMTP_USER'),
      password: optional('SMTP_PASSWORD'),
      from: required('MAIL_FROM'),
    },
  };
}
