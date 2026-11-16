// Only the tape motor is audible; broadcast dialogue stays in the subtitles.
export function sound() {
  let enabled = false, context, motorGain, rewinding = false;
  function enable() {
    enabled = !enabled;
    if (enabled && !context) {
      context = new AudioContext();
      const strip = context.createBuffer(1, context.sampleRate, context.sampleRate);
      const data = strip.getChannelData(0);
      let seed = 32177;
      for (let i = 0; i < data.length; i++) {
        seed = seed * 16807 % 2147483647;
        data[i] = (seed / 2147483647 - .5) * (.7 + .3 * Math.sin(i / context.sampleRate * 120));
      }
      const motor = context.createBufferSource(), filter = context.createBiquadFilter();
      motor.buffer = strip; motor.loop = true; filter.type = 'bandpass'; filter.frequency.value = 1250;
      filter.Q.value = .65; motorGain = context.createGain(); motorGain.gain.value = 0;
      motor.connect(filter).connect(motorGain).connect(context.destination);
      motor.start();
    }
    if (enabled) context.resume().catch(() => {});
    else { rewinding = false; motorGain.gain.setTargetAtTime(0, context.currentTime, .025); }
    return enabled;
  }
  function update(held) {
    if (!context) return;
    rewinding = enabled && !!held;
    motorGain.gain.setTargetAtTime(rewinding ? .055 : 0, context.currentTime, .035);
  }
  return { enable, update, get enabled() { return enabled; }, get rewinding() { return rewinding; } };
}
