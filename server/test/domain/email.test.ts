import { describe, expect, it } from 'vitest';
import { isValidEmail, normalizeEmail } from '../../src/domain/email.js';

describe('emails', () => {
  it('normalizes by trimming and lowercasing', () => {
    expect(normalizeEmail('  Mario.Rossi@Example.COM ')).toBe('mario.rossi@example.com');
  });

  it.each(['mario@example.com', 'a.b+c@sub.example.it'])('accepts %s', (email) => {
    expect(isValidEmail(email)).toBe(true);
  });

  it.each(['', 'mario', 'mario@', '@example.com', 'mario@example', 'ma rio@example.com'])(
    'refuses "%s"',
    (email) => {
      expect(isValidEmail(email)).toBe(false);
    },
  );
});
