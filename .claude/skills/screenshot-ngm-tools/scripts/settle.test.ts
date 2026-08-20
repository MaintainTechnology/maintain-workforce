/**
 * Checks for settleText — the guard that stops the skill saving a blank marketing shot.
 *
 * The skill lives under .claude/ (gitignored, outside src/), so `npm test` does NOT pick this
 * up. Run it directly:
 *   npx tsx --test .claude/skills/screenshot-ngm-tools/scripts/settle.test.ts
 *
 * A virtual clock is injected, so this runs in milliseconds with no browser.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { settleText, type TextSource } from './tools.config';

/** Time that only advances when the loop sleeps. */
function fakeClock() {
  let t = 0;
  return { now: () => t, sleep: async (ms: number) => void (t += ms) };
}

/** Yields each length in turn, then repeats the final one forever. */
function source(lengths: number[]): TextSource {
  let i = 0;
  return {
    async innerText() {
      const len = lengths[Math.min(i++, lengths.length - 1)];
      return 'x'.repeat(len);
    },
  };
}

const OPTS = { timeoutMs: 60_000, minChars: 400, stablePolls: 3, pollMs: 2_000 };

test('returns the settled length once a streaming answer stops growing', async () => {
  const settled = await settleText(source([100, 600, 900]), { ...OPTS, ...fakeClock() });
  assert.equal(settled, 900);
});

test('throws when no answer ever renders — the blank-frame bug', async () => {
  await assert.rejects(
    () => settleText(source([0]), { ...OPTS, ...fakeClock() }),
    /answer never settled: last length 0/,
  );
});

test('throws on a short placeholder that never grows past minChars', async () => {
  await assert.rejects(
    () => settleText(source([12]), { ...OPTS, ...fakeClock() }), // e.g. "Thinking…"
    /need >= 400 chars/,
  );
});

test('does not settle early while text is still growing', async () => {
  // Grows by 50 chars every poll and never stops — must hit the deadline, not return.
  let n = 0;
  const growing: TextSource = { async innerText() { return 'x'.repeat((n += 50)); } };
  await assert.rejects(() => settleText(growing, { ...OPTS, ...fakeClock() }), /never settled/);
});

test('a pause shorter than stablePolls does not count as settled', async () => {
  // Stalls at 500 for 2 polls, resumes, then truly settles at 1200.
  const settled = await settleText(source([500, 500, 900, 1200]), { ...OPTS, ...fakeClock() });
  assert.equal(settled, 1200);
});
