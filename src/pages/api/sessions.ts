import { NextApiRequest, NextApiResponse } from 'next'
import { PrismaClient } from '../../generated/prisma'

const prisma = new PrismaClient()

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    try {
      const sessions = await prisma.session.findMany({
        include: {
          messages: {
            orderBy: {
              createdAt: 'asc'
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      })

      res.status(200).json(sessions)
    } catch (error) {
      console.error('Error fetching sessions:', error)
      res.status(500).json({ error: 'Failed to fetch sessions' })
    }
  } else {
    res.setHeader('Allow', ['GET'])
    res.status(405).end(`Method ${req.method} Not Allowed`)
  }
} 