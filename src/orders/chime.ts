/**
 * A short two-note chime for the kitchen display when a new ticket arrives - the alert the kitchen
 * screens surveyed on 8 Oct 2026 all have (Satisfecho, POSR, madebyaris). Made with Web Audio, so
 * there is no sound file to load or cache.
 *
 * Browsers only play sound after someone has tapped the page, so the kitchen turns it on with a
 * tap, and that tap is what lets later chimes play. Failing to play is never an error: the ticket
 * is on the screen either way.
 */

type AudioCtor = typeof AudioContext;

let context: AudioContext | null = null;

function audio(): AudioContext | null {
  try {
    const Ctor: AudioCtor | undefined = window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext;
    if (!Ctor) return null;
    context ??= new Ctor();
    if (context.state === 'suspended') void context.resume();
    return context;
  } catch {
    return null;
  }
}

export function chime(): void {
  const ctx = audio();
  if (!ctx) return;
  try {
    const start = ctx.currentTime;
    [880, 1318.5].forEach((frequency, i) => {
      const at = start + i * 0.18;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.35, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.16);
      osc.connect(gain).connect(ctx.destination);
      osc.start(at);
      osc.stop(at + 0.17);
    });
  } catch {
    // No sound - the ticket is still on the screen.
  }
}

/** Which kitchen-screen lines are new since the last look: what triggers the chime. */
export function newlySent(previous: ReadonlySet<string> | null, current: ReadonlySet<string>): boolean {
  if (!previous) return false; // the first load is not "new"
  for (const id of current) if (!previous.has(id)) return true;
  return false;
}
