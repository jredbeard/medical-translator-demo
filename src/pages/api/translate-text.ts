import { NextApiRequest, NextApiResponse } from 'next';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: 'Missing text' });

    const prompt = `
You are a translator. 
If the input is in English, translate it to Spanish. 
If the input is in Spanish, translate it to English. 
The doctor always speaks English, the patient always speaks Spanish.
Return a JSON object with:
- "translation": the translated text
- "participant": "doctor" if the input is English, "patient" if the input is Spanish.

Input: """${text}"""
`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'You are a careful, literal medical interpreter.' },
        { role: 'user', content: prompt }
      ],
      response_format: { type: 'json_object' }
    });

    const content = completion.choices[0].message.content;
    let result;
    try {
      result = JSON.parse(content || '{}');
    } catch {
      return res.status(500).json({ error: 'Failed to parse translation response' });
    }

    res.status(200).json(result);
  } catch (error) {
    console.error('Translation error:', error);
    res.status(500).json({ error: 'Translation failed' });
  }
} 