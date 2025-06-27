import { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '../../generated/prisma';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import os from 'os';

const prisma = new PrismaClient();
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { audio, sessionId } = req.body;

    if (!audio || !sessionId) {
      console.error('Missing audio or sessionId', { audioLength: audio?.length, sessionId });
      return res.status(400).json({ error: 'Audio data and session ID are required' });
    }

    // Convert base64 audio to buffer
    const audioBuffer = Buffer.from(audio, 'base64');
    console.log('Audio buffer length:', audioBuffer.length);

    // Write buffer to a temporary file
    const tempFilePath = path.join(os.tmpdir(), `audio-${Date.now()}.webm`);
    fs.writeFileSync(tempFilePath, audioBuffer);
    console.log('Temp file written:', tempFilePath);

    // Transcribe using OpenAI
    try {
      const transcription = await openai.audio.transcriptions.create({
        file: fs.createReadStream(tempFilePath),
        model: 'gpt-4o-transcribe', // or 'whisper-1'
      });
      fs.unlinkSync(tempFilePath);
      return res.status(200).json({ transcription: transcription.text });
    } catch (openaiError: any) {
      console.error('OpenAI API error:', openaiError?.response?.data || openaiError);
      fs.unlinkSync(tempFilePath);
      return res.status(500).json({ error: 'Failed to transcribe audio', details: openaiError?.response?.data || openaiError.message });
    }
  } catch (error) {
    console.error('General error in transcribe endpoint:', error);
    return res.status(500).json({ error: 'Failed to transcribe audio' });
  }
} 