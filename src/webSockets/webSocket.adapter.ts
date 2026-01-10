import { ManagerRoom } from '@/shared/constants/others.constant'
import { roleName } from '@/shared/constants/role.constant'
import { TokenService } from '@/shared/service/token.service'
import { WebSocketRepo } from '@/shared/shared-repository/shared-webSocket'
import { INestApplicationContext, UnauthorizedException } from '@nestjs/common'
import { IoAdapter } from '@nestjs/platform-socket.io'
import { Server, ServerOptions, Socket } from 'socket.io'
//NestJS cho phép bạn viết adapter cho socket.io để handle auth một lần duy nhất

//INestApplicationContext là một interface trong NestJS, đại diện cho container IoC (Inversion of Control) – nơi quản lý dependency injection.
//Bạn có thể dùng nó để lấy các service, repository, module đã được NestJS quản lý.
export class WebSocketAuthAdapter extends IoAdapter {
  private readonly tokenService: TokenService
  private readonly webSocketRepo: WebSocketRepo
  constructor(app: INestApplicationContext) {
    super(app)
    this.tokenService = app.get(TokenService)
    this.webSocketRepo = app.get(WebSocketRepo)
  }
  createIOServer(port: number, options?: ServerOptions): Server {
    const server = super.createIOServer(port, {
      ...options,
      cors: {
        origin: '*',
        credentials: true,
      },
    })
    // Chỉ áp dụng middleware một lần cho tất cả namespaces
    server.use((socket, next) => {
      this.authMiddleware(socket, next)
    })

    return server
  }
  async authMiddleware(socket: Socket, next: (err?: any) => void) {
    const { authorization } = socket.handshake.auth

    if (!authorization) {
      return next(new UnauthorizedException('Error.MissingAccessTokenInHeaders'))
    }

    const token = authorization.split(' ')[1]
    if (!token) {
      return next(new UnauthorizedException('Error.NotFoundToken'))
    }

    try {
      const { roleName: roleOfUser, userId } = await this.tokenService.VerifyAccessToken(token)

      if (roleOfUser == roleName.GUEST) {
        await this.webSocketRepo.create({
          guestId: userId,
          socketId: socket.id,
        })
      } else if (roleOfUser == roleName.STAFF || roleOfUser == roleName.ADMIN) {
        await this.webSocketRepo.create({
          userId,
          socketId: socket.id,
        })
        socket.join(ManagerRoom)
      } else {
        await this.webSocketRepo.create({
          userId,
          socketId: socket.id,
        })
      }
      next()
    } catch (error) {
      next(error)
    }
  }
}
