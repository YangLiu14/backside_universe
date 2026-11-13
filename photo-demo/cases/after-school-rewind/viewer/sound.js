// Seek the decoded four-second recording against the same clock used for the ball.
export function sound() {
  const recording = fetch('./broadcast.mp3').then(response => {
    if (!response.ok) throw Error('广播录音未能加载');
    return response.arrayBuffer();
  });
  let enabled = false, context, buffer, voice, motorGain, offset = 0, started = 0;
  const voiceTime = () => voice ? offset + context.currentTime - started : offset;
  function silence() {
    if (!voice) return;
    offset = voiceTime();
    voice.stop();
    voice.disconnect();
    voice = null;
  }
  function enable() {
    enabled = !enabled;
    if (enabled && !context) {
      context = new AudioContext();
      recording.then(data => context.decodeAudioData(data)).then(decoded => { buffer = decoded; });
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
    else { silence(); motorGain.gain.setTargetAtTime(0, context.currentTime, .025); }
    return enabled;
  }
  function update(t, playing, held) {
    if (!context) return;
    motorGain.gain.setTargetAtTime(enabled && held ? .055 : 0, context.currentTime, .035);
    if (!enabled || !playing || !buffer || context.state !== 'running' || t >= buffer.duration - .005) {
      silence(); return;
    }
    if (voice && Math.abs(voiceTime() - t) < .14) return;
    silence();
    voice = context.createBufferSource();
    voice.buffer = buffer;
    voice.connect(context.destination);
    offset = t; started = context.currentTime;
    voice.start(started, offset);
  }
  return { enable, update, get enabled() { return enabled; }, get voiceTime() { return voiceTime(); }, get paused() { return !voice; } };
}
