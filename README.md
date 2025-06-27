# Medical Translation App

A real-time hands-free medical translation application built with Next.js, Tailwind CSS, Prisma, PostgreSQL, and OpenAI's Realtime API with WebRTC. The app provides instant speech-to-text, translation, and text-to-speech capabilities for medical consultations between English-speaking doctors and Spanish-speaking patients.

## Features

- **Real-time Speech Processing**: Uses OpenAI's Realtime API with WebRTC for instant speech capture and processing
- **Individual Utterance Detection**: Captures and processes speech in real-time as individual utterances
- **Bidirectional Translation**: Automatically translates between English and Spanish
- **Language Auto-Detection**: Automatically detects the source language and translates accordingly
- **Text-to-Speech Playback**: Provides audio playback of translations
- **Session Management**: Start, stop, and manage translation sessions
- **SOAP Note Generation**: Automatically generates SOAP (Subjective, Objective, Assessment, Plan) summaries
- **Session History**: View and access previous translation sessions
- **Modern Dark UI**: Beautiful, responsive interface optimized for both mobile and desktop
- **Secure API Keys**: Uses ephemeral keys to keep your OpenAI API key secure

## Tech Stack

- **Frontend**: Next.js, React, TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes, Prisma ORM
- **Database**: PostgreSQL
- **AI Services**: OpenAI Realtime API, GPT-4o
- **Real-time Communication**: WebRTC, RTCDataChannel
- **Deployment**: Vercel (serverless)

## Prerequisites

- Node.js 18+ 
- npm or yarn
- OpenAI API key with access to Realtime API
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
- **WebRTC Client**: Custom WebRTC implementation for OpenAI Realtime API
- **RTCDataChannel**: Real-time communication channel for events
- **Audio Processing**: Direct microphone access and audio streaming
- **State Management**: React hooks for session and message state
- **UI Components**: Tailwind CSS for responsive, modern interface

### Backend
- **API Routes**: Next.js serverless functions for session management
- **Database**: Prisma ORM with Neon PostgreSQL
- **Security**: Ephemeral key generation for secure API access

### Real-time Processing
- **WebRTC**: Direct browser-to-OpenAI connection for audio streaming
- **RTCDataChannel**: Real-time event communication
- **SDP Protocol**: Session Description Protocol for connection establishment
- **Utterance Detection**: Individual speech segment processing

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
- `OPENAI_API_KEY`: Your OpenAI API key with Realtime API access
- `NEXTAUTH_SECRET`: A secure random string
- `NEXTAUTH_URL`: Your production domain

- Chrome 66+
- Firefox 60+
- Safari 14+
- Edge 79+