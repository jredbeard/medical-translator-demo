# Medical Translation App

A real-time hands-free medical translation application built with Next.js, Tailwind CSS, Prisma, PostgreSQL, and OpenAI's Whisper API. The app provides instant speech-to-text, translation, and text-to-speech capabilities for medical consultations between English-speaking doctors and Spanish-speaking patients.

This is a demo / hackathon app.

# Project Notes

For this project I chose to use Next.js, Prisma (postgres), and Neon for a quick-to-spin-up postgres db. I chose Next.js for the ease of deployment on vercel - there's no need to run a separate back end, but there are some design considerations to be made because of the serverless API in Next.js. For scalability, you can in fact run Next.js in a docker container on any cloud platform - it maybe isn't always the best framework of choice though for large scale apps though, imo. It's an excellent tool to quickly mock up apps in either case.

Since this uses serverless API's, we needed endpoints to start and end sessions, as well as one to fetch sessions and history. We'll also need one for fetching a realtime ephemeral key for OpenAI, and, translating transcribed text, and text-to-speech.

Upon ending a session, a summary is generated, displayed, and saved to the database.

I started out trying OpenAI's realtime API to simply transcribe text in individual utterances using WebRTC browser side.

Interestingly, the OpenAI realtime API did not seem to currently work from localhost due to CORS issues (even with their own demo app) - this made local testing not possible, and, forced me to deploy early to vercel in order to test this piece (I thought maybe they were just blocking http not https traffic via CORS headers). After doing some searching, it seems this is a widespread issue and seems to happen from production apps since it's still in beta. Given this, I backed out of this approach and came up with another one in order to get this shipped in time.

I decided to still try to use WebRTC (but with VAD) so that I could detect utterances. It could still work in a way without this, but, then we'd have to just send chunks to the regular OpenAI API to translate in a few second bursts probably. This also made it necessary to create a new transcribe API endpoint to use as well. This felt like the next best fallback solution.

After troubleshooting some bugs with a manual VAD detection, I decided to implement the simpler fixed-chunk-size with some detection for silence to string together into a single utterance. Obviously this would be much better (and probably easier) with the OpenAI realtime API, as, these problems are already solved with that solution. I left the libraries and API endpoints intact for the other solutions. The realtime API one may actually work fine when their CORS issues are resolved - the realtime-key endpoint does in fact get a proper ephemeral key, it's just that the SDP response returns as not ok (oddly it's a JSON object that contains text and explains "cors issue" - weird, it isn't the usual browser CORS message you'd receive).

I am using OpenAI's whisper to simply transcribe text in the individual utterances. Once the message is obtained, it is then sent through a separate LLM request using an API endpoint to do the translation (and detect the participant). I'm having it return JSON here. In a larger scale production application, it might make sense to use a library like BAML for structured responses - but this should be absolutely fine for this demo. Finally, the translated text is sent to a tts api endpoint and then replayed for the user.

I believe that we could do this in fewer requests - but, given the time constraints for this hackathon, I landed on this solution.

The summary is generated in SOAP format also in JSON.

The approach admittedly has some bugs, but, is close.


BELOW IS AI GENERATED README:

## Features

- **Local Audio Recording**: Uses browser-based audio recording with Voice Activity Detection (VAD) for real-time speech capture
- **Individual Utterance Detection**: Captures and processes speech in real-time as individual utterances
- **Bidirectional Translation**: Automatically translates between English and Spanish
- **Language Auto-Detection**: Automatically detects the source language and translates accordingly
- **Text-to-Speech Playback**: Provides audio playback of translations
- **Session Management**: Start, stop, and manage translation sessions
- **SOAP Note Generation**: Automatically generates SOAP (Subjective, Objective, Assessment, Plan) summaries
- **Session History**: View and access previous translation sessions
- **Modern Dark UI**: Beautiful, responsive interface optimized for both mobile and desktop
- **Secure API Keys**: Uses your OpenAI API key directly for transcription and translation

## Tech Stack

- **Frontend**: Next.js, React, TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes, Prisma ORM
- **Database**: PostgreSQL
- **AI Services**: OpenAI Whisper API, GPT-4o
- **Audio Processing**: Web Audio API, MediaRecorder API, Voice Activity Detection
- **Deployment**: Vercel (serverless)

## Prerequisites

- Node.js 18+ 
- npm or yarn
- OpenAI API key with access to Whisper API
- Neon PostgreSQL database

## Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd medical-translation-app
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   Create a `.env.local` file in the root directory:
   ```env
   # Database
   DATABASE_URL="postgresql://username:password@host:port/database"
   
   # OpenAI
   OPENAI_API_KEY="your-openai-api-key"
   
   # Next.js
   NEXTAUTH_SECRET="your-nextauth-secret"
   NEXTAUTH_URL="http://localhost:3000"
   ```

4. **Set up the database**
   ```bash
   # Generate Prisma client
   npx prisma generate
   
   # Run database migrations
   npx prisma db push
   ```

5. **Start the development server**
   ```bash
   npm run dev
   ```

The app will be available at `http://localhost:3000`

## Usage

### Starting a Session

1. Click "Start Session" to begin a new translation session
2. Click "Start Recording" to begin real-time speech processing
3. Speak naturally - the app will automatically:
   - Detect your language (English or Spanish)
   - Transcribe your speech in real-time
   - Translate to the other language
   - Play back the translation via TTS

### During a Session

- **Real-time Processing**: Speech is processed as individual utterances for immediate response
- **Automatic Language Detection**: The app automatically detects whether you're speaking English or Spanish
- **Bidirectional Translation**: Translations work in both directions
- **Audio Playback**: Translations are automatically played back via text-to-speech

### Ending a Session

1. Click "Stop Recording" to stop speech processing
2. Click "End Session" to complete the session
3. The app will automatically generate a SOAP note summary
4. The session is saved to your history

### Session History

- Access previous sessions via the hamburger menu
- View conversation history and SOAP summaries
- All sessions are stored securely in the database

## Architecture

### Frontend
- **AudioRecorder**: Custom audio recording implementation with Voice Activity Detection
- **Web Audio API**: Real-time audio processing and analysis
- **MediaRecorder API**: Audio capture and chunking
- **State Management**: React hooks for session and message state
- **UI Components**: Tailwind CSS for responsive, modern interface

### Backend
- **API Routes**: Next.js serverless functions for session management
- **Database**: Prisma ORM with Neon PostgreSQL
- **Transcription**: OpenAI Whisper API for speech-to-text
- **Translation**: OpenAI GPT-4o for text translation
- **TTS**: OpenAI TTS API for text-to-speech

### Audio Processing
- **Voice Activity Detection**: Browser-based VAD using Web Audio API
- **Utterance Detection**: Automatic detection of speech start/stop
- **Audio Chunking**: Processing individual utterances
- **Format Support**: WebM audio format for optimal browser compatibility

## Database Schema

### Session
- `id`: Unique session identifier
- `createdAt`: Session start timestamp
- `status`: Session status (ACTIVE, COMPLETED)
- `subjective`: SOAP subjective notes
- `objective`: SOAP objective notes
- `assessment`: SOAP assessment notes
- `plan`: SOAP plan notes

### Message
- `id`: Unique message identifier
- `sessionId`: Reference to session
- `originalText`: Original transcribed text
- `translatedText`: Translated text
- `originalLanguage`: Source language code
- `translatedLanguage`: Target language code
- `createdAt`: Message timestamp

## Deployment

### Vercel Deployment

1. **Connect to Vercel**
   ```bash
   npx vercel
   ```

2. **Set environment variables in Vercel dashboard**
   - `DATABASE_URL`
   - `OPENAI_API_KEY`
   - `NEXTAUTH_SECRET`
   - `NEXTAUTH_URL`

3. **Deploy**
   ```bash
   npx vercel --prod
   ```

### Environment Variables for Production

Make sure to set these in your Vercel dashboard:
- `DATABASE_URL`: Your Neon PostgreSQL connection string
- `OPENAI_API_KEY`: Your OpenAI API key with Whisper API access
- `NEXTAUTH_SECRET`: A secure random string
- `NEXTAUTH_URL`: Your production domain

## Browser Support

The app requires modern browsers with support for:
- Web Audio API
- MediaRecorder API
- getUserMedia API
- ES6+ features

Supported browsers:
- Chrome 66+
- Firefox 60+
- Safari 14+
- Edge 79+