import { NextApiRequest, NextApiResponse } from 'next'
import { PrismaClient } from '../../../generated/prisma'
import OpenAI from 'openai'

const prisma = new PrismaClient()
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'POST') {
    try {
      const { sessionId } = req.body

      if (!sessionId) {
        return res.status(400).json({ error: 'Session ID is required' })
      }

      // Get all messages for the session
      const messages = await prisma.message.findMany({
        where: { sessionId },
        orderBy: { createdAt: 'asc' },
      })

      // Generate SOAP summary
      const conversationText = messages
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((msg: any) => `${msg.originalLanguage === 'en' ? 'Doctor' : 'Patient'}: ${msg.originalText}`)
        .join('\n')

      const soapSummary = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `You are a medical professional. Analyze the following conversation and create a SOAP note summary.
            If there's not any part the conversation that is relevant to the SOAP note, leave it blank. Still return the JSON format.
            If there is an action of intent (schedule a follow up, send lab order, etc), include it in the plan.
            SOAP format along with a general summary of the conversation:
            - Subjective: Patient's symptoms and concerns
            - Objective: Observable findings and vital signs
            - Assessment: Diagnosis and clinical impression
            - Plan: Treatment plan and follow-up
            - Summary: A general summary of the conversation
            - Action: If there is an action of intent (schedule a follow up, send lab order, etc), include it in the plan.
            
            Respond in JSON format with no markdown code fencing. Do not include any other text in your response:
            {
              "subjective": "...",
              "objective": "...", 
              "assessment": "...",
              "plan": "...",
              "summary": "...",
              "action": "..."
            }`
          },
          {
            role: 'user',
            content: conversationText
          }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
      })

      const content = soapSummary.choices[0].message.content;

      console.log('soapSummary', soapSummary);
      console.log('content', content);

      let soapData: {
        subjective: string;
        objective: string;
        assessment: string;
        plan: string;
        summary: string;
        action: string;
      };

      const fallback = {
        subjective: 'N/A',
        objective: 'N/A',
        assessment: 'N/A',
        plan: 'N/A',
        summary: 'N/A',
        action: 'N/A'
      };

      try {
        const parsed = JSON.parse(content || '{}');
        console.log('parsed', parsed);
        soapData = {
          subjective: parsed.subjective || 'N/A',
          objective: parsed.objective || 'N/A',
          assessment: parsed.assessment || 'N/A',
          plan: parsed.plan || 'N/A',
          summary: parsed.summary || 'N/A',
          action: parsed.action || 'N/A'
        };
        console.log('soapData', soapData);
      } catch {
        soapData = fallback;
      }

      // Update session with SOAP summary and mark as completed
      await prisma.session.update({
        where: { id: sessionId },
        data: {
          status: 'COMPLETED',
          subjective: soapData.subjective,
          objective: soapData.objective,
          assessment: soapData.assessment,
          plan: soapData.plan,
          action: soapData.action,
          summary: soapData.summary
        },
      })

      res.status(200).json({
        sessionId,
        soapSummary: soapData,
      })

    } catch (error) {
      console.error('Error ending session:', error)
      res.status(500).json({ error: 'Failed to end session' })
    }
  } else {
    res.setHeader('Allow', ['POST'])
    res.status(405).end(`Method ${req.method} Not Allowed`)
  }
} 