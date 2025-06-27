// unused - due to CORS issues with OpenAI Realtime API at time of testing

import { NextApiRequest, NextApiResponse } from 'next'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'POST') {
    try {
      const sessionConfig = {
        input_audio_format: "pcm16",
        input_audio_transcription: {
            model: "gpt-4o-transcribe",
            prompt: "Please transcribe the following audio into text. Do not include any other text in your response.",
            //language: "en", - not using language, will detect language after transcription
        },
        turn_detection: {
          type: "server_vad",
          threshold: 0.5,
          prefix_padding_ms: 200,
          silence_duration_ms: 500,
        },
        input_audio_noise_reduction: {
          type: "near_field"
        },
      };

      const r = await fetch("https://api.openai.com/v1/realtime/sessions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(sessionConfig),
      });

      console.log('Response:', r);

      if (!r.ok) {
        const errorText = await r.text();
        console.error('OpenAI error:', errorText);
        return res.status(r.status).json({ error: errorText });
      }

      const data = await r.json();
      // The ephemeral key is in data.client_secret.value
      res.status(200).json({
        ephemeralKey: data.client_secret.value,
        expiresAt: data.expires_at,
      });
    } catch (error) {
      console.error('Error generating ephemeral key:', error);
      res.status(500).json({ error: 'Failed to generate ephemeral key' });
    }
  } else {
    res.setHeader('Allow', ['POST'])
    res.status(405).end(`Method ${req.method} Not Allowed`)
  }
} 