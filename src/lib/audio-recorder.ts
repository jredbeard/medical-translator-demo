// This was buggy, but, I'm leaving it here for reference. Pivoted to fixed-size chunking instead in order to ship.

interface AudioRecorderConfig {
  sessionId: string
  onTranscript: (text: string, language: string) => void
  onError: (error: string) => void
  onStart: () => void
  onStop: () => void
}

export class AudioRecorder {
  private mediaRecorder: MediaRecorder | null = null
  private audioContext: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private microphone: MediaStreamAudioSourceNode | null = null
  private stream: MediaStream | null = null
  private config: AudioRecorderConfig
  private isRecording = false
  private audioChunks: Blob[] = []
  private silenceTimer: NodeJS.Timeout | null = null
  private isSpeaking = false
  private utteranceStartTime = 0
  private isProcessingUtterance = false
  private vadCooldownUntil = 0

  // VAD (Voice Activity Detection) settings
  // Adjusted for noisy environments (e.g., air conditioner running)
  private readonly SILENCE_THRESHOLD = 800 // ms of silence to end utterance (lower = more responsive)
  private readonly MIN_UTTERANCE_LENGTH = 300 // ms minimum utterance length
  private readonly VOLUME_THRESHOLD = 0.1 // higher = less sensitive to background noise

  constructor(config: AudioRecorderConfig) {
    this.config = config
  }

  private async startMediaRecorder() {
    let mimeType = '';
    if (MediaRecorder.isTypeSupported('audio/wav')) {
      mimeType = 'audio/wav';
    } else if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
      mimeType = 'audio/webm;codecs=opus';
    } else {
      mimeType = '';
    }
    console.log('Using MediaRecorder mimeType:', mimeType || 'default');
    this.audioChunks = [];
    this.mediaRecorder = new MediaRecorder(this.stream!, {
      ...(mimeType && { mimeType })
    });
    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        this.audioChunks.push(event.data);
      }
    };
    this.mediaRecorder.onstop = () => {
      this.processAudioChunk();
      // Start a new MediaRecorder for the next utterance if still recording
      if (this.isRecording) {
        this.startMediaRecorder();
      }
    };
    this.mediaRecorder.start();
  }

  async start(): Promise<void> {
    try {
      // Get microphone access
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
        }
      });

      // Set up audio context for VAD
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.8;

      this.microphone = this.audioContext.createMediaStreamSource(this.stream);
      this.microphone.connect(this.analyser);

      // Start the first MediaRecorder
      this.isRecording = true;
      this.startMediaRecorder();

      // Start VAD monitoring
      this.startVAD();

      this.config.onStart();
      console.log('Audio recording started with VAD');

    } catch (error) {
      console.error('Error starting audio recording:', error);
      this.config.onError(`Failed to start recording: ${error}`);
      throw error;
    }
  }

  private startVAD(): void {
    const dataArray = new Uint8Array(this.analyser!.frequencyBinCount)
    
    const checkVolume = () => {
      const now = Date.now();
      if (now < this.vadCooldownUntil) {
        requestAnimationFrame(checkVolume);
        return;
      }
      if (!this.isRecording || !this.analyser) return

      this.analyser.getByteFrequencyData(dataArray)
      
      // Calculate average volume
      const average = dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length
      const normalizedVolume = average / 255

      //console.log('VAD running, isSpeaking:', this.isSpeaking, 'normalizedVolume:', normalizedVolume, 'threshold:', this.VOLUME_THRESHOLD)

      if (normalizedVolume > this.VOLUME_THRESHOLD) {
        // Speech detected
        if (!this.isSpeaking) {
          this.isSpeaking = true
          this.utteranceStartTime = Date.now()
          console.log('Speech started (VAD)')
        }
        
        // Clear any existing silence timer
        if (this.silenceTimer) {
          clearTimeout(this.silenceTimer)
          this.silenceTimer = null
        }
      } else {
        // Silence detected
        if (this.isSpeaking) {
          if (!this.silenceTimer) {
            this.silenceTimer = setTimeout(() => {
              console.log('Silence detected, ending utterance');
              this.endUtterance();
            }, this.SILENCE_THRESHOLD);
          }
        } else {
          // If not speaking and volume is low, ensure isSpeaking is false
          this.isSpeaking = false;
        }
      }

      // Continue monitoring
      requestAnimationFrame(checkVolume)
    }

    checkVolume()
  }

  private endUtterance(): void {
    console.log('endUtterance called');
    if (!this.isSpeaking || this.isProcessingUtterance) return;

    this.isProcessingUtterance = true;
    this.vadCooldownUntil = Date.now() + 1000; // 1 second cooldown (prevents race condition for VAD)

    const utteranceDuration = Date.now() - this.utteranceStartTime;
    if (utteranceDuration >= this.MIN_UTTERANCE_LENGTH) {
      console.log('Utterance ended, processing audio chunk');
      // Stop the current MediaRecorder to finalize the chunk
      if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
        if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
          const timeSinceStart = Date.now() - this.utteranceStartTime;
          if (timeSinceStart < this.SILENCE_THRESHOLD) {
              console.log('Utterance too short, skipping stop to collect more data.');
              this.isProcessingUtterance = false;
              return;
          }
          this.mediaRecorder.stop();
        }
      } else {
        // If for some reason mediaRecorder is not active, just process the chunk
        this.processAudioChunk().finally(() => {
          this.isProcessingUtterance = false;
        });
      }
    } else {
      this.isProcessingUtterance = false;
    }

    this.isSpeaking = false;
    this.utteranceStartTime = 0;
  }

  private async processAudioChunk(): Promise<void> {
    console.log('processAudioChunk called');
    if (this.audioChunks.length === 0) return

    try {
      // Create a blob from the audio chunks
      const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' })
      
      // Discard if chunk is too short or too small (likely silence)
      if (audioBlob.size < 2000) { // adjust threshold as needed
        console.log('Discarding silent/too-short chunk');
        this.audioChunks = [];
        this.isProcessingUtterance = false;
        return;
      }
      
      // Convert to base64 using a safe chunked approach (avoids "Maximum call stack size exceeded" errors, but probably needs tuning)
      function arrayBufferToBase64(buffer: ArrayBuffer): string {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        const chunkSize = 0x8000; // 32k chunks
        for (let i = 0; i < bytes.length; i += chunkSize) {
          binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize) as any);
        }
        return btoa(binary);
      }
      const arrayBuffer = await audioBlob.arrayBuffer();
      const base64Audio = arrayBufferToBase64(arrayBuffer);

      // Add logging before sending audio
      console.log('Sending audio chunk', { length: base64Audio.length, sessionId: this.config.sessionId });

      try {
        const response = await fetch('/api/transcribe', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            audio: base64Audio,
            sessionId: this.config.sessionId
          }),
        });

        if (!response.ok) {
          console.warn('Transcription failed, skipping chunk:', response.statusText);
          this.audioChunks = [];
          return;
        }

        const { transcription } = await response.json();
        
        if (transcription && transcription.trim()) {
          console.log('onTranscript called:', transcription);
          this.config.onTranscript(transcription, 'unknown');
        } else {
          console.log('No transcription received, skipping.');
        }

        this.audioChunks = [];
      } catch (error) {
        console.error('Error processing audio chunk, skipping:', error);
        this.audioChunks = [];
        // Do not throw or stop the app
      }
    } catch (error) {
      console.error('Error processing audio chunk, skipping:', error);
      this.audioChunks = [];
      // Do not throw or stop the app
    }
  }

  stop(): void {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer)
      this.silenceTimer = null
    }

    if (this.isSpeaking) {
      this.endUtterance()
    }

    if (this.mediaRecorder && this.isRecording) {
      this.mediaRecorder.stop()
    }

    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop())
    }

    if (this.audioContext) {
      this.audioContext.close()
    }

    this.isRecording = false
    this.isSpeaking = false
    this.audioChunks = []
    this.stream = null
    this.mediaRecorder = null
    this.audioContext = null
    this.analyser = null
    this.microphone = null

    this.config.onStop()
    console.log('Audio recording stopped')
  }

  isRecordingAudio(): boolean {
    return this.isRecording
  }
} 