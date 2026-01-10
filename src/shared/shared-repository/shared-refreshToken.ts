import { PrismaService } from '@/shared/service/prisma.service'
import { Injectable } from '@nestjs/common'

@Injectable()
export class SharedRefreshTokenRepo {
  constructor(private readonly prismaService: PrismaService) {}
  deleteRefreshTokens() {
    return this.prismaService.refreshToken.deleteMany({
      where: {
        expiresAt: { lt: new Date() },
      },
    })
  }
}
