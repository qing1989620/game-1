/**
 * Musical decisions, separated from playback.
 *
 * `CityAudio` owns the Web Audio graph; this module answers only "given the
 * city, whether the city has been repaired, and which eighth-note we are on,
 * what voices should sound?". Keeping it pure means the arrangement can be
 * unit-tested without an AudioContext, and the audio layer stays a thin
 * scheduler.
 *
 * Nothing here loads a file: every note is synthesised, which is why the game
 * ships without any audio asset and the licence file only has to cover three.js.
 */

export type MusicCity = 'dock' | 'forge' | 'thread' | 'snow' | 'dune';

/** One synthesised voice, with its start offset relative to the step it belongs to. */
export interface MusicVoice {
  /** Seconds after the step start. */
  offset: number;
  /** Hertz. */
  freq: number;
  /** Seconds. */
  dur: number;
  /** Peak gain before the master bus. Kept small; the bus and limiter sum them. */
  gain: number;
  wave: 'sine' | 'triangle' | 'square' | 'sawtooth';
}

const A2 = 110;

/** Semitones above A2 → hertz. */
export const hz = (semitones: number): number => A2 * 2 ** (semitones / 12);

/**
 * Four bars per city, as semitone triads above A2.
 *
 * Each set is chosen against the melody pool the city already used, so the new
 * pad sits under the existing line instead of fighting it. A repaired city
 * swaps to a brighter set: the same root movement, major rather than minor.
 */
const PROGRESSIONS: Record<MusicCity, { dark: number[][]; lit: number[][] }> = {
  // D minor pentatonic melodies: i – VI – III – VII
  dock: { dark: [[0, 3, 7], [-4, 0, 3], [3, 7, 10], [-2, 2, 5]], lit: [[0, 4, 7], [-4, 0, 4], [3, 7, 10], [-2, 2, 7]] },
  // Adds the minor second the forge melody leans on.
  forge: { dark: [[5, 8, 12], [1, 5, 8], [-4, 0, 3], [0, 3, 7]], lit: [[5, 9, 12], [1, 5, 9], [-4, 0, 4], [0, 4, 7]] },
  // Narrower voicings, matching the arpeggios the third city already plays.
  thread: { dark: [[7, 10, 14], [3, 7, 10], [-2, 2, 5], [5, 8, 12]], lit: [[7, 11, 14], [3, 7, 11], [-2, 2, 7], [5, 9, 12]] },
  // Low and open: the snowfield is mostly wind, so the pad stays below the noise.
  snow: { dark: [[5, 8, 12], [1, 5, 8], [-2, 1, 5], [5, 8, 12]], lit: [[5, 9, 12], [1, 5, 9], [-2, 2, 5], [5, 9, 12]] },
  // Phrygian: the flat second is what makes the dunes sound like dunes.
  dune: { dark: [[5, 8, 12], [6, 10, 13], [3, 7, 10], [0, 3, 7]], lit: [[5, 9, 12], [6, 10, 13], [3, 7, 10], [0, 4, 7]] },
};

/** Eighth-note tempo per city. Snow is slowest; the forge runs hot. */
export const CITY_TEMPO: Record<MusicCity, number> = {
  dock: 88, forge: 110, thread: 104, snow: 68, dune: 76,
};

/** Seconds per scheduled step (an eighth note). */
export const stepSeconds = (city: MusicCity): number => 60 / CITY_TEMPO[city] / 2;

/** The melody pool each city already used, as semitones above A2. */
const MELODY: Record<MusicCity, { dark: number[]; lit: number[] }> = {
  dock: { dark: [3, 5, 12, 8, 3, -2, 5, 0], lit: [3, 8, 12, 15, 17, 12, 8, 5] },
  forge: { dark: [0, 3, 7, 5, 0, -4, 3, -7], lit: [0, 7, 12, 15, 12, 7, 3, 0] },
  thread: { dark: [3, 7, 12, 10, 3, 0, 7, -2], lit: [3, 7, 12, 17, 19, 17, 12, 7] },
  snow: { dark: [0, 3, 5, 8, 0, -4, 3, -7], lit: [0, 5, 8, 12, 17, 12, 8, 5] },
  dune: { dark: [3, 5, 12, 8, 3, -2, 5, -7], lit: [3, 8, 12, 17, 19, 17, 12, 8] },
};

/** Melody rests, so the line breathes instead of looping eight even notes. */
const RESTS = new Set([5, 9, 14]);

function chordFor(city: MusicCity, recovered: boolean, beat: number): number[] {
  const set = PROGRESSIONS[city][recovered ? 'lit' : 'dark'];
  return set[Math.floor(beat / 8) % set.length];
}

function melodyFor(city: MusicCity, recovered: boolean, beat: number): number {
  const pool = MELODY[city][recovered ? 'lit' : 'dark'];
  return pool[beat % pool.length];
}

/**
 * Voices for one eighth-note step.
 *
 * Four layers, each with one job: a slow pad for harmony, a bass for weight, a
 * melody on the half-beat, and a soft pulse to keep time. The arrangement is
 * deliberately sparse — this runs under footsteps and dialogue, not over them.
 *
 * @param beat Monotonically increasing step counter owned by the scheduler.
 */
export function musicVoices(city: MusicCity, recovered: boolean, beat: number): MusicVoice[] {
  const voices: MusicVoice[] = [];

  // Bar line: a three-note pad plus the root underneath. Long envelopes so the
  // harmony sustains across the bar rather than pumping on every note.
  if (beat % 8 === 0) {
    const chord = chordFor(city, recovered, beat);
    const padGain = city === 'snow' ? 0.036 : 0.046;
    for (const semitone of chord) {
      voices.push({ offset: 0, freq: hz(semitone), dur: 4.4, gain: padGain, wave: 'sine' });
    }
    voices.push({ offset: 0, freq: hz(chord[0] - 12), dur: 3.2, gain: 0.085, wave: 'triangle' });
  }

  // Pulse. The snowfield has no percussion — wind is its pulse.
  if (beat % 4 === 0 && city !== 'snow') {
    voices.push({ offset: 0, freq: city === 'dune' ? 46 : 43, dur: 0.16, gain: 0.08, wave: 'sine' });
  }

  // Melody on the half-beat, with rests.
  if (beat % 2 === 0 && !RESTS.has((beat / 2) % 16)) {
    const freq = hz(melodyFor(city, recovered, beat / 2) + 12);
    voices.push({ offset: 0, freq, dur: 1.35, gain: recovered ? 0.045 : 0.038, wave: 'sine' });
  }

  // A second voice of the chord, an octave up, only once the city is repaired:
  // a small audible reward for finishing the chapter.
  if (recovered && beat % 8 === 4) {
    voices.push({ offset: 0, freq: hz(chordFor(city, recovered, beat)[1] + 12), dur: 2.1, gain: 0.02, wave: 'triangle' });
  }

  // City character.
  if (city === 'forge' && beat % 2 === 1) {
    voices.push({ offset: 0, freq: 110 * (1 + (beat % 3)), dur: 0.06, gain: 0.016, wave: 'square' });
  }
  if (city === 'thread' && beat % 2 === 1) {
    voices.push({ offset: 0, freq: hz(melodyFor(city, recovered, beat) + 24), dur: 0.26, gain: 0.017, wave: 'triangle' });
  }
  if (city === 'dune' && beat % 8 === 6) {
    voices.push({ offset: 0, freq: hz(chordFor(city, recovered, beat)[2] + 12), dur: 1.1, gain: 0.012, wave: 'triangle' });
  }

  return voices;
}
