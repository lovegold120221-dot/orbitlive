/**
 * Orbit Live Translator - PCM capture worklet.
 *
 * Runs on the audio rendering thread. Its only job is to hand fixed-size blocks
 * of mono PCM up to the main thread, batched, so the main thread does one
 * message per ~100 ms instead of one per render quantum (which at 16 kHz would
 * be ~125 messages/second per source and would starve it).
 *
 * No resampling happens here. The context is created at 16 kHz, so the
 * browser's own resampler in the graph does that work in native code.
 * 1600 samples at 16 kHz = ~100 ms per message: the accumulator the Gemini
 * Live pipeline expects. Never send per-quantum frames over the network.
 */
class OrbitPcmTap extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const o = options.processorOptions || {};
    this.targetRate = o.targetRate || 16000;
    // ~100 ms per message at the context rate.
    this.blockFrames = Math.max(
      256,
      Math.round(sampleRate * (o.blockMs || 100) / 1000)
    );
    this.buffer = new Float32Array(this.blockFrames);
    this.filled = 0;
    this.stopped = false;

    this.port.onmessage = (e) => {
      if (e.data && e.data.type === 'stop') {
        this.stopped = true;
      }
    };
  }

  process(inputs) {
    if (this.stopped) {
      return false;
    }
    const input = inputs[0];
    if (!input || !input.length) {
      return true;
    }
    const ch = input[0];
    if (!ch) {
      return true;
    }

    for (let i = 0; i < ch.length; i++) {
      this.buffer[this.filled++] = ch[i];
      if (this.filled === this.blockFrames) {
        // Copy out: the buffer is reused, and the main thread processes
        // asynchronously, so handing over the live array would tear.
        const out = this.buffer.slice(0);
        this.port.postMessage(
          { type: 'pcm', samples: out, sampleRate: sampleRate },
          []
        );
        this.filled = 0;
      }
    }
    return true;
  }
}

registerProcessor('orbit-pcm-tap', OrbitPcmTap);
