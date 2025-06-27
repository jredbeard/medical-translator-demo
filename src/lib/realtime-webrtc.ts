interface RealtimeConfig {
  ephemeralKey: string
  sessionId: string
  onTranscript: (text: string, language: string) => void
  onTranslation: (originalText: string, translatedText: string, originalLanguage: string) => void
  onError: (error: string) => void
  onClose: () => void
}

export class RealtimeWebRTC {
  private pc: RTCPeerConnection | null = null
  private dc: RTCDataChannel | null = null
  private audioElement: HTMLAudioElement | null = null
  private config: RealtimeConfig
  private isConnected = false

  constructor(config: RealtimeConfig) {
    this.config = config
  }

  async connect(): Promise<void> {
    try {
      // Create a peer connection
      this.pc = new RTCPeerConnection()

      // Set up to play remote audio from the model
      this.audioElement = document.createElement("audio")
      this.audioElement.autoplay = true
      this.pc.ontrack = (e) => {
        if (this.audioElement) {
          this.audioElement.srcObject = e.streams[0]
        }
      }

      // Add local audio track for microphone input in the browser
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
        }
      })
      this.pc.addTrack(mediaStream.getTracks()[0])

      // Set up data channel for sending and receiving events
      this.dc = this.pc.createDataChannel("oai-events")
      this.dc.addEventListener("message", (e) => {
        this.handleMessage(e.data)
      })

      // Start the session using the Session Description Protocol (SDP)
      const offer = await this.pc.createOffer()
      await this.pc.setLocalDescription(offer)

      const baseUrl = "https://api.openai.com/v1/realtime"
      const model = "gpt-4o-transcribe" // model must match that of the ephemeral key

      const sdpResponse = await fetch(`${baseUrl}?model=${model}`, {
        method: "POST",
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${this.config.ephemeralKey}`,
          "Content-Type": "application/sdp"
        },
      })

      console.log('SDP Response:', sdpResponse);

      if (!sdpResponse.ok) {
        throw new Error(`Failed to establish WebRTC connection: ${sdpResponse.statusText}`)
      }

      const answer = await sdpResponse.json()
      await this.pc.setRemoteDescription({
        type: "answer" as RTCSdpType,
        sdp: answer.sdp,
      })

      this.isConnected = true
      console.log('WebRTC connection established with OpenAI Realtime API')

    } catch (error) {
      console.error('Error connecting to Realtime API:', error)
      this.config.onError(`Failed to connect to Realtime API: ${error}`)
      throw error
    }
  }

  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data)
      console.log('Realtime message received:', message)

      switch (message.type) {
        case 'transcript':
          this.config.onTranscript(message.text, message.language || 'unknown')
          break
          
        case 'translation':
          this.config.onTranslation(
            message.original_text || '',
            message.translated_text || '',
            message.original_language || 'unknown'
          )
          break
          
        case 'transcript_delta':
          // Handle partial transcriptions if needed
          console.log('Partial transcript:', message.text)
          break
          
        case 'error':
          this.config.onError(message.error || 'Unknown error')
          break
          
        default:
          console.log('Unknown message type:', message.type, message)
      }
    } catch (error) {
      console.error('Error parsing message:', error)
    }
  }

  disconnect(): void {
    if (this.dc) {
      this.dc.close()
      this.dc = null
    }

    if (this.pc) {
      this.pc.close()
      this.pc = null
    }

    if (this.audioElement) {
      this.audioElement.pause()
      this.audioElement.srcObject = null
      this.audioElement = null
    }

    this.isConnected = false
    console.log('WebRTC connection closed')
    this.config.onClose()
  }

  isConnectedToAPI(): boolean {
    return this.isConnected
  }
} 