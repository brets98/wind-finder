import { inferAdditionalFields } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

// Same origin as the app: the session cookie is sent automatically with every /api request.
export const authClient = createAuthClient({
  basePath: '/api/auth',
  plugins: [
    inferAdditionalFields({
      user: {
        surname: { type: 'string', required: true },
        role: { type: 'string', input: false },
      },
    }),
  ],
});
