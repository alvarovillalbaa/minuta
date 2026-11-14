class MinutaCapture extends AudioWorkletProcessor {
  constructor() {
    super(); this.frames = 0; this.buffer = new Float32Array(4096);
    this.port.onmessage = event => { if (event.data === 'flush') { if (this.frames) { const tail = this.buffer.slice(0, this.frames); this.port.postMessage(tail, [tail.buffer]); this.frames = 0; } this.port.postMessage({ flushed: true }); } };
  }
  process(inputs) {
    const channels = inputs[0]; if (!channels?.length) return true;
    const count = channels[0].length;
    for (let i = 0; i < count; i++) {
      let value = 0; for (const channel of channels) value += channel[i] || 0;
      this.buffer[this.frames++] = value / channels.length;
      if (this.frames === this.buffer.length) { this.port.postMessage(this.buffer, [this.buffer.buffer]); this.buffer = new Float32Array(4096); this.frames = 0; }
    }
    return true;
  }
}
registerProcessor('minuta-capture', MinutaCapture);
