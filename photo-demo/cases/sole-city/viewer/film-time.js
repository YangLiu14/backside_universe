// Camera and city cues are authored on the original 35-second cut. The edit
// removes time before growth and eases back to real time before the first street.
export const authoredSeconds = 35;
export const revealStart = .505;

export function filmTiming(duration) {
  const saved = authoredSeconds - duration;
  const end = revealStart * authoredSeconds - saved;
  const blend = 3;
  const start = end - blend;
  const extraSpeed = saved / (start + blend / 2);
  function phaseAt(progress) {
    const t = progress * duration;
    if (t >= end) return (t + saved) / authoredSeconds;
    if (t <= start) return t * (1 + extraSpeed) / authoredSeconds;
    const left = end - t;
    return (t + saved - extraSpeed * left * left / (2 * blend)) / authoredSeconds;
  }
  function progressAt(phase) {
    const t = phase * authoredSeconds;
    if (phase >= revealStart) return (t - saved) / duration;
    if (t <= start * (1 + extraSpeed)) return t / ((1 + extraSpeed) * duration);
    // Invert the integrated speed ramp without subtracting near-equal roots.
    const distance = revealStart * authoredSeconds - t;
    const left = 2 * distance / (1 + Math.sqrt(1 + 2 * extraSpeed * distance / blend));
    return (end - left) / duration;
  }
  return {phaseAt, progressAt};
}
