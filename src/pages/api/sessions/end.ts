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
            - Action: If there are actions of intent (e.g., schedule a follow-up, send lab order), return them in a JSON array under the key ‘actions’ using this format:
            {
              "actions": [
                { "type": "schedule_followup", "details": "next week" },
                { "type": "send_lab_order", "details": "blood panel" }
              ]
            }
            
            Respond in JSON format with no markdown code fencing. Do not include any other text in your response:
            {
              "subjective": "...",
              "objective": "...", 
              "assessment": "...",
              "plan": "...",
              "summary": "...",
              "actions": [ { "type": "...", "details": "..." } ]
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
        actions: { type: string; details: string }[];
      };

      const fallback = {
        subjective: 'N/A',
        objective: 'N/A',
        assessment: 'N/A',
        plan: 'N/A',
        summary: 'N/A',
        actions: []
      };

      try {
        const parsed = JSON.parse(content || '{}');
        const actions = parsed.actions || [];
        console.log('parsed', parsed);
        console.log('parsed actions', JSON.stringify(actions));
        soapData = {
          subjective: parsed.subjective || 'N/A',
          objective: parsed.objective || 'N/A',
          assessment: parsed.assessment || 'N/A',
          plan: parsed.plan || 'N/A',
          summary: parsed.summary || 'N/A',
          actions: parsed.actions || []
        };
        console.log('soapData', soapData);
        for (const action of actions) {
          if (!action.type) continue; // skip invalid actions
          try {
            const webhookResponse = await fetch('https://webhook.site/YOUR-UNIQUE-URL', { // just an example
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                sessionId,
                actionType: action.type,
                actionDetails: action.details || '',
                timestamp: new Date().toISOString(),
              }),
            });
            console.log(`Tool executed: ${action.type}`, webhookResponse.status);
          } catch (webhookError) {
            console.error(`Error executing tool ${action.type}:`, webhookError);
          }
        }

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
          action: JSON.stringify(soapData.actions), // would be better to store as JSON in the DB, but this is just for example
          // probably a "successfully executed actions" or something would be good too I suppose, but maybe that's tracked elsewhere
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