import { useState, useEffect, useRef } from 'react'
import { Mic, MicOff, Play, Square, History, X } from 'lucide-react'
import { FixedChunkRecorder } from '../lib/fixed-chunk-recorder'

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
  summary: string
  actions: { type: string; details: string }[]
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
  const fixedChunkRecorderRef = useRef<FixedChunkRecorder | null>(null)
  const [fixedTranscript, setFixedTranscript] = useState('')
  const [sentenceBuffer, setSentenceBuffer] = useState('')
  const bufferTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const isProcessingBufferedUtterance = useRef(false)

  useEffect(() => {
    fetchSessions()
  }, [])

  const sentenceBufferRef = useRef(''); // make sure we're using the latest value of sentenceBuffer always
  useEffect(() => {
    sentenceBufferRef.current = sentenceBuffer;
  }, [sentenceBuffer]);

  // use a ref to always have the latest messages
  const messagesRef = useRef<Message[]>([]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

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

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString()
  }

  // Helper to process the buffered utterance
  const processBufferedUtterance = async (utterance: string) => {
    if (!utterance.trim()) return;
    console.log('Processing buffered utterance:', utterance);
    
    // Check for repeat requests
    const repeatPhrases = [
      'repeat that', 'repeat', 'say that again', 'what did you say', 'can you repeat',
      'repite eso', 'repite', 'dilo otra vez', 'qué dijiste', 'puedes repetir'
    ];
    const isRepeatRequest = repeatPhrases.some(phrase => 
      utterance.toLowerCase().includes(phrase.toLowerCase())
    );
    
    if (isRepeatRequest) {
      console.log('Repeat request detected, looking for last doctor message');
      
      const lastDoctorMessage = messagesRef.current
        .slice()
        .reverse()
        .find(message => message.speaker === 'Doctor');
      
      console.log('Last doctor message found:', lastDoctorMessage);
      
      if (lastDoctorMessage) {
        try {
          // Replay the doctor's last message via TTS in Spanish
          const ttsResponse = await fetch('/api/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text: lastDoctorMessage.translatedText,
              language: 'es', // Always Spanish since it's the doctor's message
            }),
          });
          if (ttsResponse.ok) {
            const { audio } = await ttsResponse.json();
            const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
            const audioData = Uint8Array.from(atob(audio), c => c.charCodeAt(0));
            const buffer = await audioContext.decodeAudioData(audioData.buffer);
            const source = audioContext.createBufferSource();
            source.buffer = buffer;
            source.connect(audioContext.destination);
            source.start(0);
          }
        } catch (error) {
          console.error('Error replaying doctors last message:', error);
        }
      } else {
        console.log('No previous doctor message found to repeat');
      }
      return; // don't process as a normal message, return early
    }
    
    try {
      const translationResponse = await fetch('/api/translate-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: utterance }),
      });
      if (!translationResponse.ok) return;
      const { translation, participant } = await translationResponse.json();
      // Save message to database
      const saveResponse = await fetch('/api/save-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: currentSessionId,
          originalText: utterance,
          translatedText: translation,
          originalLanguage: participant === 'doctor' ? 'en' : 'es',
          translatedLanguage: participant === 'doctor' ? 'es' : 'en',
        }),
      });
      if (saveResponse.ok) {
        const data = await saveResponse.json();
        const newMessage: Message = {
          id: data.messageId,
          originalText: utterance,
          translatedText: translation,
          speaker: participant === 'doctor' ? 'Doctor' : 'Patient',
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, newMessage]);
      }
      // TTS playback
      if (translation) {
        const ttsResponse = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: translation,
            language: participant === 'doctor' ? 'es' : 'en',
          }),
        });
        if (ttsResponse.ok) {
          const { audio } = await ttsResponse.json();
          const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
          const audioData = Uint8Array.from(atob(audio), c => c.charCodeAt(0));
          const buffer = await audioContext.decodeAudioData(audioData.buffer);
          const source = audioContext.createBufferSource();
          source.buffer = buffer;
          source.connect(audioContext.destination);
          source.start(0);
        }
      }
    } catch (error) {
      console.error('Error translating, saving, or playing message:', error);
    }
  };

  // Helper to process and clear the buffer only once
  const processAndClearBuffer = (buffer: string) => {
    if (isProcessingBufferedUtterance.current) return;
    if (bufferTimeoutRef.current) {
      clearTimeout(bufferTimeoutRef.current);
      bufferTimeoutRef.current = null;
    }
    if (buffer.trim()) {
      console.log('Processing buffer:', buffer);
      isProcessingBufferedUtterance.current = true;
      processBufferedUtterance(buffer.trim()).finally(() => {
        console.log('Processing buffer finished');
        isProcessingBufferedUtterance.current = false;
      });
    }
  };

  const handleStartRecording = async () => {
    setError(null);
    setIsRecording(true);
    setSentenceBuffer('');
    if (!fixedChunkRecorderRef.current) {
      fixedChunkRecorderRef.current = new FixedChunkRecorder({
        sessionId: currentSessionId!,
        chunkIntervalMs: 4000,
        onTranscript: (fullTranscript, lastChunk) => {
          setFixedTranscript(fullTranscript);
          setSentenceBuffer(prev => prev ? prev + ' ' + lastChunk : lastChunk);
          // Fail-safe: reset timeout
          if (bufferTimeoutRef.current) clearTimeout(bufferTimeoutRef.current);
          bufferTimeoutRef.current = setTimeout(() => {
            processAndClearBuffer(sentenceBufferRef.current);
            setSentenceBuffer('');
          }, 7000);
        },
        onSilence: () => {
          // On silence, process and clear the buffer only once
          processAndClearBuffer(sentenceBufferRef.current);
          setSentenceBuffer('');
        },
      });
    }
    await fixedChunkRecorderRef.current.start();
  };

  const handleStopRecording = () => {
    setIsRecording(false);
    fixedChunkRecorderRef.current?.stop();
    if (bufferTimeoutRef.current) {
      clearTimeout(bufferTimeoutRef.current);
      bufferTimeoutRef.current = null;
    }
    // Process any remaining buffer on stop
    if (sentenceBuffer.trim() && !isProcessingBufferedUtterance.current) {
      processAndClearBuffer(sentenceBufferRef.current);
      setSentenceBuffer('');
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 p-4">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <h1 className="text-2xl font-bold text-blue-400">Medical Translator</h1>
          <div className="flex items-center space-x-2">
            {/* Show session history button only on mobile */}
            {!showHistory && (
              <button
                onClick={() => setShowHistory(true)}
                className="p-2 rounded-lg bg-gray-700 hover:bg-gray-600 transition-colors lg:hidden"
                title="Toggle session history"
                aria-label="Toggle session history"
              >
                <History className="w-5 h-5" />
              </button>
            )}
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
                  {isSessionActive && isRecording && (
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
                  <>
                    <button
                      onClick={endSession}
                      className="flex items-center space-x-2 px-6 py-3 bg-red-600 hover:bg-red-700 rounded-lg font-medium transition-colors"
                    >
                      <Square className="w-5 h-5" />
                      <span>End Session</span>
                    </button>
                    <button
                      onClick={isRecording ? handleStopRecording : handleStartRecording}
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
                  </>
                )}
              </div>

              {error && (
                <div className="mt-4 p-3 bg-red-900 border border-red-700 rounded-lg">
                  <p className="text-red-200">{error}</p>
                </div>
              )}

              {/* Audio Recording Info */}
              <div className="mt-4 p-3 bg-blue-900 border border-blue-700 rounded-lg">
                <p className="text-blue-200">
                  <strong>Medical Translator Demo:</strong> This app records voices in a hands free manner. Audio is sent to OpenAI's Whisper API for transcription, then translated and played back. A summary will be generated at the end of the session.
                </p>
              </div>

              {isSessionActive && isRecording && (
                <div className="flex items-center justify-center space-x-2 mt-2">
                  <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse"></div>
                  <span className="text-yellow-200 font-medium">Translating</span>
                </div>
              )}
            </div>

            {/* Messages */}
            <div className="bg-gray-800 rounded-lg p-6 mb-6">
              <h3 className="text-lg font-semibold mb-4">Conversation</h3>
              <div className="space-y-4 max-h-96 overflow-y-auto">
                {messages.length === 0 ? (
                  <p className="text-gray-400 text-center py-8">
                    {!isSessionActive && 'Start a session to begin...'}
                    {isSessionActive && !isRecording && 'Start recording to begin real-time translation...'}
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

            {/* General Summary and Actions */}
            {soapSummary && (
              <div className="bg-gray-800 rounded-lg p-6 mt-6">
                <h3 className="text-lg font-semibold mb-4">Session Summary</h3>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="bg-gray-700 rounded-lg p-4">
                    <h4 className="font-medium text-cyan-400 mb-2">General Summary</h4>
                    <p className="text-gray-300">{soapSummary.summary}</p>
                  </div>
                  <div className="bg-gray-700 rounded-lg p-4">
                    <h4 className="font-medium text-orange-400 mb-2">Actions & Follow-up</h4>
                    {soapSummary.actions.length > 0 ? (
                      <div className="space-y-2">
                        {soapSummary.actions.map((action, index) => (
                          <div key={index} className="flex items-start space-x-2">
                            <span className="text-orange-400 text-sm font-medium min-w-0 flex-shrink-0">
                              {action.type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}:
                            </span>
                            <span className="text-gray-300 text-sm">{action.details}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-gray-400 text-sm">No actions identified</p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Desktop: always show sidebar */}
          <div className="lg:col-span-1 hidden lg:block">
            <div className="bg-gray-800 rounded-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">Session History</h3>
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

          {/* Mobile: show as dialog/modal */}
          {showHistory && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 lg:hidden">
              <div className="bg-gray-800 rounded-lg p-6 w-11/12 max-w-md mx-auto relative">
                <button
                  onClick={() => setShowHistory(false)}
                  className="absolute top-2 right-2 p-1 rounded hover:bg-gray-700"
                  title="Close history"
                  aria-label="Close history"
                >
                  <X className="w-4 h-4" />
                </button>
                <h3 className="text-lg font-semibold mb-4">Session History</h3>
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
          )}
        </div>
      </div>
    </div>
  )
}
