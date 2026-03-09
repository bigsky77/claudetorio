import * as Tone from 'tone';

export type MusicMood = 'idle' | 'active' | 'error_spike' | 'completed' | 'failed';

export class FactorioAudioEngine {
  private kick: Tone.MembraneSynth;
  private kickSeq: Tone.Sequence<string | null>;
  private hihat: Tone.NoiseSynth;
  private hihatSeq: Tone.Sequence<string | null>;
  private bass: Tone.Synth;
  private bassSeq: Tone.Sequence<string | null>;
  private lead: Tone.Synth;
  private leadDelay: Tone.PingPongDelay;
  private leadSeq: Tone.Sequence<string | null>;
  private masterVol: Tone.Volume;
  private started = false;

  constructor() {
    this.masterVol = new Tone.Volume(-18).toDestination();

    // Kick: punchy 4-on-the-floor
    this.kick = new Tone.MembraneSynth({
      pitchDecay: 0.05,
      octaves: 6,
      envelope: { attack: 0.001, decay: 0.25, sustain: 0, release: 0.1 },
      volume: -2,
    }).connect(this.masterVol);

    this.kickSeq = new Tone.Sequence<string | null>(
      (time, note) => {
        if (note) this.kick.triggerAttackRelease(note, '8n', time);
      },
      ['C1', null, null, null, 'C1', null, null, null,
       'C1', null, null, null, 'C1', null, null, null],
      '16n'
    );

    // Hi-hat: straight 8th notes, crisp
    this.hihat = new Tone.NoiseSynth({
      noise: { type: 'white' },
      envelope: { attack: 0.001, decay: 0.04, sustain: 0, release: 0.03 },
      volume: -18,
    }).connect(this.masterVol);

    this.hihatSeq = new Tone.Sequence<string | null>(
      (time, x) => {
        if (x) this.hihat.triggerAttackRelease('16n', time);
      },
      ['x', null, 'x', null, 'x', null, 'x', null,
       'x', null, 'x', null, 'x', null, 'x', null],
      '16n'
    );

    // Bass: square wave, rhythmic A minor riff
    this.bass = new Tone.Synth({
      oscillator: { type: 'square' },
      envelope: { attack: 0.005, decay: 0.1, sustain: 0.5, release: 0.08 },
      volume: -8,
    }).connect(this.masterVol);

    this.bassSeq = new Tone.Sequence<string | null>(
      (time, note) => {
        if (note) this.bass.triggerAttackRelease(note, '16n', time);
      },
      ['A2', null, 'A2', null, 'G2', null, 'A2', null,
       'A2', null, 'C3', null, 'E3', null, 'D3', null],
      '16n'
    );

    // Lead arp: square wave, A minor pentatonic, ping-pong delay
    this.leadDelay = new Tone.PingPongDelay({ delayTime: '16n', feedback: 0.25, wet: 0.25 }).connect(this.masterVol);
    this.lead = new Tone.Synth({
      oscillator: { type: 'square' },
      envelope: { attack: 0.005, decay: 0.08, sustain: 0.25, release: 0.08 },
      volume: -10,
    }).connect(this.leadDelay);

    this.leadSeq = new Tone.Sequence<string | null>(
      (time, note) => {
        if (note) this.lead.triggerAttackRelease(note, '16n', time);
      },
      ['A4', 'C5', 'E5', 'G5', 'A5', 'G5', 'E5', 'C5',
       'A4', 'C5', 'D5', 'E5', 'G5', 'E5', 'D5', 'C5'],
      '16n'
    );

    Tone.getTransport().bpm.value = 140;
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    const now = Tone.now();
    this.kickSeq.start(now);
    this.hihatSeq.start(now);
    this.bassSeq.start(now);
    this.leadSeq.start(now + 0.5);
    Tone.getTransport().start();
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;
    Tone.getTransport().stop();
    this.kickSeq.stop();
    this.hihatSeq.stop();
    this.bassSeq.stop();
    this.leadSeq.stop();
  }

  setMood(mood: MusicMood): void {
    const now = Tone.now();
    switch (mood) {
      case 'idle':
        Tone.getTransport().bpm.rampTo(120, 4);
        this.masterVol.volume.rampTo(-20, 2);
        break;
      case 'active':
        Tone.getTransport().bpm.rampTo(155, 4);
        this.masterVol.volume.rampTo(-16, 2);
        break;
      case 'error_spike':
        Tone.getTransport().bpm.rampTo(170, 1);
        this.masterVol.volume.rampTo(-14, 0.3);
        this.masterVol.volume.rampTo(-18, 2, now + 2);
        Tone.getTransport().bpm.rampTo(140, 4, now + 2);
        break;
      case 'completed':
        this.kickSeq.stop();
        this.hihatSeq.stop();
        this.bassSeq.stop();
        this.leadSeq.stop();
        // Chiptune victory fanfare: ascending run
        ['A4', 'C5', 'E5', 'A5'].forEach((note, i) => {
          this.lead.triggerAttackRelease(note, '8n', now + 0.1 + i * 0.15);
        });
        this.masterVol.volume.rampTo(-6, 0, now);
        this.masterVol.volume.rampTo(-Infinity, 3, now + 1.2);
        break;
      case 'failed':
        Tone.getTransport().bpm.rampTo(80, 4);
        this.masterVol.volume.rampTo(-26, 3);
        this.leadSeq.stop();
        break;
    }
  }

  async fadeOut(durationSeconds: number): Promise<void> {
    const now = Tone.now();
    this.masterVol.volume.rampTo(-Infinity, durationSeconds, now);
    return new Promise((resolve) => setTimeout(resolve, durationSeconds * 1000));
  }

  dispose(): void {
    this.stop();
    this.kickSeq.dispose();
    this.hihatSeq.dispose();
    this.bassSeq.dispose();
    this.leadSeq.dispose();
    this.kick.dispose();
    this.hihat.dispose();
    this.bass.dispose();
    this.lead.dispose();
    this.leadDelay.dispose();
    this.masterVol.dispose();
  }
}
