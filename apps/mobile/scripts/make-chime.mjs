// Writes assets/chime.wav: the web app's end-of-rest tone (see
// apps/web/src/features/logging/alert.ts), two short sine tones at 880 and
// 1175 Hz, ramped so neither end clicks. Run with `node scripts/make-chime.mjs`.
import { writeFileSync } from 'node:fs';

const RATE = 44_100;
const TONE = 0.18;
const PEAK = 0.18 * 32_767;
const tones = [880, 1175];

const samples = new Int16Array(Math.round(RATE * TONE * tones.length));
for (const [index, frequency] of tones.entries()) {
  const offset = Math.round(index * TONE * RATE);
  const length = Math.round(TONE * RATE);
  for (let i = 0; i < length; i += 1) {
    const t = i / RATE;
    // 20 ms attack, then a decay to silence by 160 ms, as the web ramp does.
    const envelope = t < 0.02 ? t / 0.02 : Math.max(0, 1 - (t - 0.02) / 0.14);
    samples[offset + i] = Math.round(Math.sin(2 * Math.PI * frequency * t) * envelope * PEAK);
  }
}

const data = Buffer.from(samples.buffer);
const header = Buffer.alloc(44);
header.write('RIFF', 0);
header.writeUInt32LE(36 + data.length, 4);
header.write('WAVE', 8);
header.write('fmt ', 12);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20);
header.writeUInt16LE(1, 22);
header.writeUInt32LE(RATE, 24);
header.writeUInt32LE(RATE * 2, 28);
header.writeUInt16LE(2, 32);
header.writeUInt16LE(16, 34);
header.write('data', 36);
header.writeUInt32LE(data.length, 40);

writeFileSync(new URL('../assets/chime.wav', import.meta.url), Buffer.concat([header, data]));
