import { NextRequest, NextResponse } from 'next/server'
import Pusher from 'pusher'

const pusher = new Pusher({
  appId: process.env.PUSHER_APP_ID!,
  key: process.env.NEXT_PUBLIC_PUSHER_KEY!,
  secret: process.env.PUSHER_SECRET!,
  cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
  useTLS: true,
})

export async function POST(req: NextRequest) {
  const { code, event, data } = await req.json()

  if (!code || !event || !data) {
    return new Response('Missing parameters', { status: 400 })
  }

  const response = await pusher.trigger(`private-${code}`, event, data)
  return NextResponse.json({ status: 'ok', response })
}