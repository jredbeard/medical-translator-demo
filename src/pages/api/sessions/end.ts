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
            SOAP format:
            - Subjective: Patient's symptoms and concerns
            - Objective: Observable findings and vital signs
            - Assessment: Diagnosis and clinical impression
            - Plan: Treatment plan and follow-up
            
            Respond in JSON format:
            {
              "subjective": "...",
              "objective": "...", 
              "assessment": "...",
              "plan": "..."
            }`
          },
          {
            role: 'user',
            content: conversationText
          }
        ],
        temperature: 0.1,
      })

      const soapText = soapSummary.choices[0]?.message?.content || ''
      let soapData
      try {
        soapData = JSON.parse(soapText)
      } catch {
        soapData = {
          subjective: 'Unable to generate summary',
          objective: '',
          assessment: '',
          plan: ''
        }
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