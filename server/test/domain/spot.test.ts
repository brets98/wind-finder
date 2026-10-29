import { describe, expect, it } from 'vitest';
import { parseSpot } from '../../src/domain/spot.js';

const sottomarina = { name: ' Sottomarina ', lat: 45.2, lon: 12.31, type: 'sea' };

describe('parseSpot', () => {
  it('fills defaults for a new spot', () => {
    const { fields, issues } = parseSpot(sottomarina);

    expect(issues).toEqual([]);
    expect(fields).toEqual({
      name: 'Sottomarina',
      lat: 45.2,
      lon: 12.31,
      type: 'sea',
      status: 'to_verify',
      goodDirections: [],
      avoidDirections: [],
      water: null,
      level: null,
      region: '',
      season: '',
      notes: '',
      isStudySpot: false,
    });
  });

  it('keeps every field when valid', () => {
    const { fields, issues } = parseSpot({
      ...sottomarina,
      status: 'verified',
      goodDirections: [{ from: 30, to: 120 }],
      avoidDirections: [{ from: 240, to: 300 }],
      water: 'chop',
      level: 'intermediate',
      region: 'Veneto',
      season: 'All year, Bora in winter',
      notes: 'Summer corridor at the north end',
      isStudySpot: true,
    });

    expect(issues).toEqual([]);
    expect(fields).toMatchObject({ status: 'verified', water: 'chop', isStudySpot: true });
  });

  it('reports each invalid field with a code', () => {
    const { issues } = parseSpot({
      name: '',
      lat: 95,
      lon: 12,
      type: 'river',
      goodDirections: [{ from: 360, to: 10 }],
      water: 'glassy',
      isStudySpot: 'yes',
    });

    expect(issues).toEqual([
      { code: 'REQUIRED', field: 'name' },
      { code: 'INVALID', field: 'location' },
      { code: 'REQUIRED', field: 'type' },
      { code: 'INVALID', field: 'goodDirections' },
      { code: 'INVALID', field: 'water' },
      { code: 'INVALID', field: 'isStudySpot' },
    ]);
  });

  it('checks and returns only the fields sent when partial', () => {
    expect(parseSpot({ status: 'verified' }, { partial: true })).toEqual({
      fields: { status: 'verified' },
      issues: [],
    });
    expect(parseSpot({ water: '' }, { partial: true }).fields).toEqual({ water: null });
    expect(parseSpot({ lat: 45 }, { partial: true }).issues).toEqual([
      { code: 'INVALID', field: 'location' },
    ]);
  });
});
