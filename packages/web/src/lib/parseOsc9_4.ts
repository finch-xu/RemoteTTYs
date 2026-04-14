// OSC 9;4 progress bar protocol parser (ConEmu/Windows Terminal/Ghostty)
// Format: ESC ] 9 ; 4 ; <state> ; <value> <terminator>
// Terminators: BEL (0x07) or ST (ESC \)

export type ProgressState = 0 | 1 | 2 | 3 | 4;

export interface ProgressInfo {
  state: ProgressState;
  value: number;
}

const ESC = 0x1b;
const RBRACKET = 0x5d; // ]
const NINE = 0x39;     // 9
const SEMI = 0x3b;     // ;
const FOUR = 0x34;     // 4
const BEL = 0x07;
const BACKSLASH = 0x5c; // \
const ZERO = 0x30;
const MAX_DIGIT = 0x39;

/** Parse consecutive ASCII digits starting at `start`, returning [value, nextIndex]. */
function parseDigits(data: Uint8Array, start: number): [number, number] {
  let val = 0;
  let i = start;
  while (i < data.length && data[i] >= ZERO && data[i] <= MAX_DIGIT) {
    val = val * 10 + (data[i] - ZERO);
    i++;
  }
  return [val, i];
}

/**
 * Scan a Uint8Array for the last OSC 9;4 sequence.
 * Returns parsed {state, value} or null if none found.
 *
 * Takes the last match because a single write() can contain
 * multiple progress updates — only the final state matters.
 */
export function parseOsc9_4(data: Uint8Array): ProgressInfo | null {
  let result: ProgressInfo | null = null;
  const len = data.length;

  for (let i = 0; i < len; i++) {
    if (data[i] !== ESC) continue;

    // Need at least: ESC ] 9 ; 4 ; <digit> ; <digit> <terminator> = 10 bytes
    if (i + 9 >= len) break;

    // Match fixed prefix: ] 9 ; 4 ;
    if (data[i + 1] !== RBRACKET || data[i + 2] !== NINE ||
        data[i + 3] !== SEMI || data[i + 4] !== FOUR || data[i + 5] !== SEMI) {
      continue;
    }

    let j = i + 6;
    if (j >= len || data[j] < ZERO || data[j] > MAX_DIGIT) continue;

    const [state, afterState] = parseDigits(data, j);
    j = afterState;
    if (state > 4) continue;

    if (j >= len || data[j] !== SEMI) continue;
    j++;

    if (j >= len || data[j] < ZERO || data[j] > MAX_DIGIT) continue;

    let [value, afterValue] = parseDigits(data, j);
    j = afterValue;
    if (value > 100) value = 100;

    // Check terminator: BEL or ESC \
    if (j < len && data[j] === BEL) {
      result = { state: state as ProgressState, value };
      i = j;
    } else if (j + 1 < len && data[j] === ESC && data[j + 1] === BACKSLASH) {
      result = { state: state as ProgressState, value };
      i = j + 1;
    }
  }

  return result;
}
