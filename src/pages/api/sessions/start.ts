import { NextApiRequest, NextApiResponse } from 'next'
import { PrismaClient } from '../../../generated/prisma'

// in a production scenario, we should use some kind of auth to ensure that only authorized users can start a session

const prisma = new PrismaClient()

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'POST') {
    try {
      const session = await prisma.session.create({
        data: {
          status: 'ACTIVE',
        },
      })

      res.status(200).json({ sessionId: session.id })
    } catch (error) {
      console.error('Error starting session:', error)
      res.status(500).json({ error: 'Failed to start session' })
    }
  } else {
    res.setHeader('Allow', ['POST'])
    res.status(405).end(`Method ${req.method} Not Allowed`)
  }
} 