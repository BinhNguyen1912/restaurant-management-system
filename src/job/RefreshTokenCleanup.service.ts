import { SharedRefreshTokenRepo } from '@/shared/shared-repository/shared-refreshToken'
import { Injectable } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
@Injectable()
export class RefreshTokenCleanupService {
  constructor(private readonly sharedRefreshTokenRepo: SharedRefreshTokenRepo) {}
  @Cron(CronExpression.EVERY_HOUR)
  async handleCleanRefreshToken() {
    try {
      return await this.sharedRefreshTokenRepo.deleteRefreshTokens()
    } catch (error) {
      console.log('Error cleaning up refresh tokens:', error)
    }
  }
}
