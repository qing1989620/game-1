import { describe, expect, it } from 'vitest';
import { CITY_TEMPO, hz, musicVoices, stepSeconds, type MusicCity } from '../src/game/music';

const CITIES: MusicCity[] = ['dock', 'forge', 'thread', 'snow', 'dune'];

/** Everything a step can produce, so guards cover the whole arrangement. */
const everyStep = (city: MusicCity, recovered: boolean) =>
  Array.from({ length: 32 }, (_, beat) => musicVoices(city, recovered, beat));

describe('soundtrack arrangement', () => {
  it('gives each city its own tempo and derives the step length from it', () => {
    const tempos = new Set(CITIES.map((c) => CITY_TEMPO[c]));
    expect(tempos.size).toBe(CITIES.length);
    for (const city of CITIES) {
      expect(stepSeconds(city)).toBeCloseTo(60 / CITY_TEMPO[city] / 2, 10);
    }
  });

  it('places a three-note pad only on bar lines', () => {
    for (const city of CITIES) {
      for (const beat of [0, 8, 16, 24]) {
        const pad = musicVoices(city, false, beat).filter((v) => v.dur === 4.4);
        expect(pad, `${city} beat ${beat}`).toHaveLength(3);
        // The pad should be a chord, not three copies of one pitch.
        expect(new Set(pad.map((v) => Math.round(v.freq))).size).toBe(3);
      }
      for (const beat of [1, 2, 3, 5, 6, 7, 9]) {
        expect(musicVoices(city, false, beat).filter((v) => v.dur === 4.4), `${city} beat ${beat}`)
          .toHaveLength(0);
      }
    }
  });

  it('keeps the snowfield unpulsed: wind is its pulse, not a drum', () => {
    for (const beat of [0, 4, 8, 12]) {
      const low = musicVoices('snow', false, beat).filter((v) => v.freq < 60 && v.dur < 0.3);
      expect(low, `snow beat ${beat}`).toHaveLength(0);
    }
    // The other cities do get a pulse on the half bar.
    expect(musicVoices('dock', false, 0).some((v) => v.freq === 43)).toBe(true);
    expect(musicVoices('dune', false, 0).some((v) => v.freq === 46)).toBe(true);
  });

  it('rests the melody sometimes instead of looping eight even notes', () => {
    // (beat / 2) % 16 === 5 is a rest, so beat 10 carries nothing at all.
    expect(musicVoices('dock', false, 10)).toHaveLength(0);
    // ...and the step before it does have a melody note.
    expect(musicVoices('dock', false, 8).some((v) => v.dur === 1.35)).toBe(true);
  });

  it('brightens the harmony once the city is repaired', () => {
    for (const city of CITIES) {
      const dark = musicVoices(city, false, 0).map((v) => Math.round(v.freq)).sort((a, b) => a - b);
      const lit = musicVoices(city, true, 0).map((v) => Math.round(v.freq)).sort((a, b) => a - b);
      expect(dark, city).not.toEqual(lit);
    }
  });

  it('never leaves the audible band', () => {
    for (const city of CITIES) {
      for (const recovered of [false, true]) {
        for (const voices of everyStep(city, recovered)) {
          for (const v of voices) {
            expect(v.freq).toBeGreaterThanOrEqual(30);
            expect(v.freq).toBeLessThanOrEqual(1200);
          }
        }
      }
    }
  });

  it('never stacks so much gain that the limiter has to rescue it', () => {
    // The bus adds 0.5 and a compressor sits behind it; a step over ~0.35
    // would already be pumping before the limiter engaged.
    for (const city of CITIES) {
      for (const recovered of [false, true]) {
        for (const voices of everyStep(city, recovered)) {
          const total = voices.reduce((sum, v) => sum + v.gain, 0);
          expect(total, `${city} recovered=${recovered}`).toBeLessThanOrEqual(0.35);
        }
      }
    }
  });

  it('is deterministic, so a seek or a reload cannot change the tune', () => {
    for (const city of CITIES) {
      for (const beat of [0, 3, 7, 12, 21]) {
        expect(musicVoices(city, true, beat)).toEqual(musicVoices(city, true, beat));
      }
    }
  });

  it('converts semitones with equal temperament from A2', () => {
    expect(hz(0)).toBe(110);
    expect(hz(12)).toBe(220);
    expect(hz(-12)).toBe(55);
    expect(hz(7)).toBeCloseTo(164.81, 2);
  });
});
