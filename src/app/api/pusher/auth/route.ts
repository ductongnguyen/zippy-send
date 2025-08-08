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
  const data = await req.text()
  const socketId = new URLSearchParams(data).get('socket_id')!
  const channel = new URLSearchParams(data).get('channel_name')!

  const authResponse = pusher.authorizeChannel(socketId, channel)
  return NextResponse.json(authResponse)
}