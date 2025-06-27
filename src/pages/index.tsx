import { useState, useEffect, useRef } from 'react'
import { Mic, MicOff, Play, Square, History, X } from 'lucide-react'
import { RealtimeWebRTC } from '../lib/realtime-webrtc'

interface Message {
  id: string
  originalText: string
  translatedText: string
  speaker: string
  timestamp: Date
}

interface Session {
  id: string
  createdAt: string
  status: string
  messages: Message[]
  subjective?: string
  objective?: string
  assessment?: string
  plan?: string
}

interface SOAPSummary {
  subjective: string
  objective: string
  assessment: string
  plan: string
}

export default function MedicalTranslationApp() {
  const [isRecording, setIsRecording] = useState(false)
  const [isSessionActive, setIsSessionActive] = useState(false)
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [sessions, setSessions] = useState<Session[]>([])
  const [soapSummary, setSoapSummary] = useState<SOAPSummary | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isConnected, setIsConnected] = useState(false)

  const realtimeRef = useRef<RealtimeWebRTC | null>(null)

  useEffect(() => {
    fetchSessions()
  }, [])

  const fetchSessions = async () => {
    try {
      const response = await fetch('/api/sessions')
      const data = await response.json()
      setSessions(data)
    } catch (error) {
      console.error('Error fetching sessions:', error)
    }
  }

  const startSession = async () => {
    try {
      setIsLoading(true)
      setError(null)
      
      const response = await fetch('/api/sessions/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        throw new Error('Failed to start session')
      }

      const data = await response.json()
      setCurrentSessionId(data.sessionId)
      setIsSessionActive(true)
      setMessages([])
      setSoapSummary(null)
      setIsLoading(false)
      console.log('Session started:', data.sessionId)
    } catch (error) {
      console.error('Error starting session:', error)
      setError('Failed to start session')
      setIsLoading(false)
    }
  }

  const endSession = async () => {
    if (!currentSessionId) {
      setError('No active session to end')
      return
    }

    try {
      // Disconnect from Realtime API
      if (realtimeRef.current) {
        realtimeRef.current.disconnect()
        realtimeRef.current = null
        setIsConnected(false)
      }

      const response = await fetch('/api/sessions/end', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sessionId: currentSessionId }),
      })

      if (!response.ok) {
        throw new Error('Failed to end session')
      }

      const data = await response.json()
      setIsSessionActive(false)
      setCurrentSessionId(null)
      setSoapSummary(data.soapSummary)
      fetchSessions() // Refresh sessions list
      console.log('Session ended:', data.sessionId)
    } catch (error) {
      console.error('Error ending session:', error)
      setError('Failed to end session')
    }
  }

  const startRecording = async () => {
    try {
      if (!currentSessionId) {
        setError('No active session')
        return
      }

      // Get ephemeral key for Realtime API
      const keyResponse = await fetch('/api/realtime-key', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sessionId: currentSessionId }),
      })

      console.log('Key response:', keyResponse)

      if (!keyResponse.ok) {
        throw new Error('Failed to get ephemeral key')
      }

      const { ephemeralKey } = await keyResponse.json()

      // Initialize WebRTC Realtime API client
      realtimeRef.current = new RealtimeWebRTC({
        ephemeralKey,
        sessionId: currentSessionId,
        onTranscript: async (text: string, language: string) => {
          console.log('Transcript received:', text, language)
          try {
            // 1. Call translation endpoint
            const translationResponse = await fetch('/api/translate-text', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ text }),
            })
            if (!translationResponse.ok) return

            const { translation, participant } = await translationResponse.json()

            // 2. Save message to database with all info
            const saveResponse = await fetch('/api/save-message', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                sessionId: currentSessionId,
                originalText: text,
                translatedText: translation,
                originalLanguage: participant === 'doctor' ? 'en' : 'es',
                translatedLanguage: participant === 'doctor' ? 'es' : 'en',
              }),
            })

            if (saveResponse.ok) {
              const data = await saveResponse.json()
              const newMessage: Message = {
                id: data.messageId,
                originalText: text,
                translatedText: translation,
                speaker: participant === 'doctor' ? 'Doctor' : 'Patient',
                timestamp: new Date(),
              }
              setMessages(prev => [...prev, newMessage])
            }

            // 3. Call TTS endpoint and play audio
            if (translation) {
              const ttsResponse = await fetch('/api/tts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  text: translation,
                  language: participant === 'doctor' ? 'es' : 'en',
                  // Optionally, you can set a specific voice here
                }),
              })
              if (ttsResponse.ok) {
                const { audio } = await ttsResponse.json()
                // Play base64 audio using Web Audio API
                const audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
                const audioData = Uint8Array.from(atob(audio), c => c.charCodeAt(0))
                const buffer = await audioContext.decodeAudioData(audioData.buffer)
                const source = audioContext.createBufferSource()
                source.buffer = buffer
                source.connect(audioContext.destination)
                source.start(0)
              }
            }
          } catch (error) {
            console.error('Error translating, saving, or playing message:', error)
          }
        },
        onTranslation: async (originalText: string, translatedText: string, originalLanguage: string) => {
          console.log('Translation received:', originalText, '->', translatedText)
          
          // Update the last message with the translation
          if (messages.length > 0) {
            const lastMessage = messages[messages.length - 1]
            const updatedMessage = {
              ...lastMessage,
              translatedText: translatedText,
              speaker: originalLanguage === 'en' ? 'Doctor' : 'Patient',
            }
            
            setMessages(prev => prev.map((msg, index) => 
              index === prev.length - 1 ? updatedMessage : msg
            ))
          }
        },
        onError: (error: string) => {
          console.error('Realtime API error:', error)
          setError(error)
        },
        onClose: () => {
          console.log('Realtime API connection closed')
          setIsConnected(false)
          setIsRecording(false)
        },
      })

      // Connect to Realtime API
      await realtimeRef.current.connect()
      setIsConnected(true)
      setIsRecording(true)
      setError(null)

      console.log('WebRTC Realtime API connected and ready for speech processing')

    } catch (error) {
      console.error('Error starting recording:', error)
      setError('Failed to start Realtime API connection')
      setIsRecording(false)
    }
  }

  const stopRecording = () => {
    if (realtimeRef.current) {
      realtimeRef.current.disconnect()
      realtimeRef.current = null
      setIsRecording(false)
      setIsConnected(false)
      console.log('Recording stopped')
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString()
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 p-4">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <h1 className="text-2xl font-bold text-blue-400">Medical Translator</h1>
          <div className="flex items-center space-x-2">
            <div className="flex items-center space-x-2 text-green-400">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
              <span className="text-sm">Realtime API</span>
            </div>
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="p-2 rounded-lg bg-gray-700 hover:bg-gray-600 transition-colors"
              title="Toggle session history"
              aria-label="Toggle session history"
            >
              <History className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto p-4">
        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Translation Area */}
          <div className="lg:col-span-2">
            {/* Session Controls */}
            <div className="bg-gray-800 rounded-lg p-6 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold">
                  {isSessionActive ? 'Active Session' : 'Start New Session'}
                </h2>
                <div className="flex items-center space-x-2">
                  {isSessionActive && (
                    <div className="flex items-center space-x-2 text-green-400">
                      <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                      <span className="text-sm">Live</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center space-x-4">
                {!isSessionActive ? (
                  <button
                    onClick={startSession}
                    disabled={isLoading}
                    className="flex items-center space-x-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded-lg font-medium transition-colors"
                  >
                    <Play className="w-5 h-5" />
                    <span>{isLoading ? 'Starting...' : 'Start Session'}</span>
                  </button>
                ) : (
                  <button
                    onClick={endSession}
                    className="flex items-center space-x-2 px-6 py-3 bg-red-600 hover:bg-red-700 rounded-lg font-medium transition-colors"
                  >
                    <Square className="w-5 h-5" />
                    <span>End Session</span>
                  </button>
                )}

                {isSessionActive && (
                  <button
                    onClick={isRecording ? stopRecording : startRecording}
                    className={`flex items-center space-x-2 px-6 py-3 rounded-lg font-medium transition-colors ${
                      isRecording 
                        ? 'bg-red-600 hover:bg-red-700' 
                        : 'bg-green-600 hover:bg-green-700'
                    }`}
                  >
                    {isRecording ? (
                      <>
                        <MicOff className="w-5 h-5" />
                        <span>Stop Recording</span>
                      </>
                    ) : (
                      <>
                        <Mic className="w-5 h-5" />
                        <span>Start Recording</span>
                      </>
                    )}
                  </button>
                )}
              </div>

              {error && (
                <div className="mt-4 p-3 bg-red-900 border border-red-700 rounded-lg">
                  <p className="text-red-200">{error}</p>
                </div>
              )}

              {/* Realtime API Info */}
              <div className="mt-4 p-3 bg-blue-900 border border-blue-700 rounded-lg">
                <p className="text-blue-200">
                  <strong>OpenAI Realtime API:</strong> This app uses the OpenAI Realtime API with WebRTC 
                  for real-time speech processing. Individual utterances are captured and translated instantly.
                  {isConnected && (
                    <span className="block mt-2 text-green-300">
                      ✓ Connected to Realtime API - Ready for speech
                    </span>
                  )}
                </p>
              </div>
            </div>

            {/* Messages */}
            <div className="bg-gray-800 rounded-lg p-6 mb-6">
              <h3 className="text-lg font-semibold mb-4">Conversation</h3>
              <div className="space-y-4 max-h-96 overflow-y-auto">
                {messages.length === 0 ? (
                  <p className="text-gray-400 text-center py-8">
                    {isSessionActive 
                      ? 'Start recording to begin real-time translation...' 
                      : 'Start a session to begin...'
                    }
                  </p>
                ) : (
                  messages.map((message, index) => (
                    <div key={index} className="bg-gray-700 rounded-lg p-4">
                      <div className="flex items-start justify-between mb-2">
                        <span className="text-sm font-medium text-blue-400">
                          {message.speaker}
                        </span>
                        <span className="text-xs text-gray-400">
                          {message.timestamp.toLocaleTimeString()}
                        </span>
                      </div>
                      <div className="space-y-2">
                        <p className="text-gray-300">
                          <span className="text-gray-500 text-sm">Original:</span> {message.originalText}
                        </p>
                        <p className="text-white">
                          <span className="text-gray-500 text-sm">Translation:</span> {message.translatedText}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* SOAP Summary */}
            {soapSummary && (
              <div className="bg-gray-800 rounded-lg p-6">
                <h3 className="text-lg font-semibold mb-4">SOAP Summary</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-gray-700 rounded-lg p-4">
                    <h4 className="font-medium text-blue-400 mb-2">Subjective</h4>
                    <p className="text-gray-300">{soapSummary.subjective}</p>
                  </div>
                  <div className="bg-gray-700 rounded-lg p-4">
                    <h4 className="font-medium text-green-400 mb-2">Objective</h4>
                    <p className="text-gray-300">{soapSummary.objective}</p>
                  </div>
                  <div className="bg-gray-700 rounded-lg p-4">
                    <h4 className="font-medium text-yellow-400 mb-2">Assessment</h4>
                    <p className="text-gray-300">{soapSummary.assessment}</p>
                  </div>
                  <div className="bg-gray-700 rounded-lg p-4">
                    <h4 className="font-medium text-purple-400 mb-2">Plan</h4>
                    <p className="text-gray-300">{soapSummary.plan}</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* History Sidebar */}
          <div className={`lg:col-span-1 ${showHistory ? 'block' : 'hidden lg:block'}`}>
            <div className="bg-gray-800 rounded-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">Session History</h3>
                <button
                  onClick={() => setShowHistory(false)}
                  className="lg:hidden p-1 rounded hover:bg-gray-700"
                  title="Close history"
                  aria-label="Close history"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {sessions.length === 0 ? (
                  <p className="text-gray-400 text-center py-4">No sessions yet</p>
                ) : (
                  sessions.map((session) => (
                    <div key={session.id} className="bg-gray-700 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium">
                          Session {session.id.slice(-8)}
                        </span>
                        <span className={`text-xs px-2 py-1 rounded ${
                          session.status === 'COMPLETED' 
                            ? 'bg-green-900 text-green-200' 
                            : 'bg-yellow-900 text-yellow-200'
                        }`}>
                          {session.status}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 mb-2">
                        {formatDate(session.createdAt)}
                      </p>
                      <p className="text-sm text-gray-300">
                        {session.messages.length} messages
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
