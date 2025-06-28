// simpler fixed chunk recorder that doesn't use VAD - ok for this demo
// i'm 100% sure this would be much better with either the realtime API or a more solid VAD implementation
// idea is to just continue recording and chunking every 4 seconds
// I'm sure this would be much better with either the realtime API or a more solid VAD implementation
// here we string together responses from the transcribe API to get a full transcript

export interface FixedChunkRecorderOptions {
  sessionId: string;
  chunkIntervalMs?: number; // default 4000ms
  onTranscript?: (fullTranscript: string, lastChunk: string) => void;
  onSilence?: () => void; // called when a silent/too-short chunk is detected
}

const MIN_CHUNK_SIZE = 2000; // bytes, discard if smaller (likely silence)

export class FixedChunkRecorder {
  private sessionId: string;
  private chunkIntervalMs: number;
  private onTranscript?: (fullTranscript: string, lastChunk: string) => void;
  private onSilence?: () => void;
  private isRecording = false;
  private transcript = '';
  private mediaRecorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private chunks: Blob[] = [];
  private interval: NodeJS.Timeout | null = null;

  constructor(options: FixedChunkRecorderOptions) {
    this.sessionId = options.sessionId;
    this.chunkIntervalMs = options.chunkIntervalMs || 4000;
    this.onTranscript = options.onTranscript;
    this.onSilence = options.onSilence;
  }

  getTranscript() {
    return this.transcript;
  }

  async start() {
    if (this.isRecording) return;
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.isRecording = true;
    console.log('[FixedChunkRecorder] Recording started');
    this.startMediaRecorder(this.stream);
  }

  stop() {
    this.isRecording = false;
    if (this.interval) clearInterval(this.interval);
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    console.log('[FixedChunkRecorder] Recording stopped');
  }

  private startMediaRecorder(stream: MediaStream) {
    let mimeType = '';
    if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
      mimeType = 'audio/webm;codecs=opus';
    } else {
      mimeType = '';
    }
    const recorder = new MediaRecorder(stream, { ...(mimeType && { mimeType }) });
    this.mediaRecorder = recorder;
    this.chunks = [];

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        this.chunks.push(event.data);
      }
    };

    recorder.onstop = async () => {
      const audioBlob = new Blob(this.chunks, { type: 'audio/webm' });
      console.log('[FixedChunkRecorder] Chunk stopped, size:', audioBlob.size);
      if (audioBlob.size < MIN_CHUNK_SIZE) {
        console.log('[FixedChunkRecorder] Discarding silent/too-short chunk');
        if (this.onSilence) this.onSilence();
        this.chunks = [];
        if (this.isRecording) this.startMediaRecorder(stream);
        return;
      }
      const arrayBuffer = await audioBlob.arrayBuffer();
      const base64Audio = this.arrayBufferToBase64(arrayBuffer);
      try {
        console.log('[FixedChunkRecorder] Sending chunk to /api/transcribe, size:', base64Audio.length);
        const response = await fetch('/api/transcribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ audio: base64Audio, sessionId: this.sessionId }),
        });
        if (response.ok) {
          const { transcription } = await response.json();
          console.log('[FixedChunkRecorder] Transcription received:', transcription);
          if (transcription && transcription.trim()) {
            this.transcript = this.transcript ? this.transcript + ' ' + transcription : transcription;
            if (this.onTranscript) this.onTranscript(this.transcript, transcription);
          }
        } else {
          console.warn('[FixedChunkRecorder] /api/transcribe returned error:', response.status, response.statusText);
        }
      } catch (err) {
        console.error('[FixedChunkRecorder] Error sending chunk to /api/transcribe:', err);
      }
      this.chunks = [];
      if (this.isRecording) this.startMediaRecorder(stream);
    };

    recorder.start();
    this.interval = setInterval(() => {
      if (recorder.state !== 'inactive') {
        recorder.stop();
      }
    }, this.chunkIntervalMs);
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize) as any);
    }
    return btoa(binary);
  }
} 