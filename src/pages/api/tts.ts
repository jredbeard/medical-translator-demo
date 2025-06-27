import { NextApiRequest, NextApiResponse } from 'next';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  try {
    const { text, language, voice = 'coral' } = req.body;
    if (!text || !language) return res.status(400).json({ error: 'Missing text or language' });

    // OpenAI TTS API expects a voice and model
    const response = await openai.audio.speech.create({
      model: 'gpt-4o-mini-tts',
      input: text,
      voice: voice,
      instructions: 'Please speak in a friendly and professional tone.', // would be fun to customize this to match inferred tone of the text haha
    }); // defaults to mp3 format

    // Read the audio as a buffer and encode as base64
    const buffer = Buffer.from(await response.arrayBuffer());
    const base64Audio = buffer.toString('base64');

    res.status(200).json({ audio: base64Audio });
  } catch (error) {
    console.error('TTS error:', error);
    res.status(500).json({ error: 'TTS failed' });
  }
} 