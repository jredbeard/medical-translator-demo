import { NextApiRequest, NextApiResponse } from 'next'
import { PrismaClient } from '../../generated/prisma'

const prisma = new PrismaClient()

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'POST') {
    try {
      const { 
        sessionId, 
        originalText, 
        translatedText, 
        originalLanguage, 
        translatedLanguage
      } = req.body

      if (!sessionId || !originalText || !translatedText) {
        return res.status(400).json({ error: 'Missing required fields' })
      }

      // Save message to database
      const message = await prisma.message.create({
        data: {
          originalText,
          translatedText,
          originalLanguage: originalLanguage || 'en',
          translatedLanguage: translatedLanguage || 'es',
          sessionId,
        },
      })

      res.status(200).json({
        messageId: message.id,
        success: true,
      })

    } catch (error) {
      console.error('Error saving message:', error)
      res.status(500).json({ error: 'Failed to save message' })
    }
  } else {
    res.setHeader('Allow', ['POST'])
    res.status(405).end(`Method ${req.method} Not Allowed`)
  }
} 