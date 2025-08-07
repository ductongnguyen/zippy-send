import { Server, Socket } from "socket.io"
import { NextApiRequest, NextApiResponse } from "next"

type NextApiResponseWithSocket = NextApiResponse & {
  socket: {
    server: {
      io?: Server
    } & any
  }
}

export default function handler(
  req: NextApiRequest,
  res: NextApiResponseWithSocket
) {
  if (!res.socket.server.io) {
    const io = new Server(res.socket.server)
    res.socket.server.io = io

    io.on("connection", (socket: Socket) => {
      console.log("Client connected", socket.id)
      
      socket.on("join-room", (room: string) => {
        socket.join(room)
      })

      socket.on("signal", ({ room, data }: { room: string; data: any }) => {
        socket.to(room).emit("signal", data)
      })
    })
  }

  res.end()
}