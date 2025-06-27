# Medical Translation App Setup Guide

## Quick Start (Run locally)

The app is currently running in demo mode. You can:


1. **Start the development server:**
   ```bash
   npm run dev
   ```

2. **Open your browser** to `http://localhost:3000`

3. **Test the UI:**
   - Click "Start Session" to begin
   - Click "Start Recording" to simulate speech recognition
   - View the conversation and SOAP summary
   - Check the session history

## Full Setup (Real-time Translation)

To enable real-time speech-to-text, translation, and text-to-speech:

### 1. Environment Variables

Create a `.env` file in the root directory:

```env
# Database
DATABASE_URL="postgresql://username:password@host:port/database"

# OpenAI
OPENAI_API_KEY="your-openai-api-key-here"

# Next.js
NEXTAUTH_SECRET="your-nextauth-secret-here"
NEXTAUTH_URL="http://localhost:3000"
```

### 2. Database Setup

1. **Setup a fresh PostgreSQL database:**
   - Copy the connection string to your `.env` file

2. **Initialize the database:**
   ```bash
   npx prisma generate
   npx prisma db push
   ```

### 3. OpenAI API Setup

1. **Get an OpenAI API key:**
   - Go to [platform.openai.com](https://platform.openai.com)
   - Create an account and get your API key
   - Add it to your `.env` file

### 5. Production Deployment

(don't deploy this in production, this is not a production app - it doesn't even have auth)

For production deployment:

1. **Set up environment variables** on your hosting platform
2. **Configure HTTPS** (required to get around CORS issues with OpenAI realtime API at time of testing)
3. **Set up a production database**
4. **Deploy to Vercel, Netlify, or your preferred platform**

## Current Features

✅ **Somewhat modern UI with dark theme**
✅ **Responsive design for mobile/desktop**
✅ **Session management**
✅ **Conversation display**
✅ **SOAP summary generation**
✅ **Session history**
✅ **Hamburger menu for history**
🔄 **Real-time speech-to-text** (OpenAI realtime API)
🔄 **Medical translation** (OpenAI GPT-4o)
🔄 **Text-to-speech** (OpenAI TTS)
🔄 **Language auto-detection**