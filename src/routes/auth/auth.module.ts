import { AuthController } from '@/routes/auth/auth.controller'
import { AuthRepo } from '@/routes/auth/auth.repo'
import { AuthService } from '@/routes/auth/auth.service'
import { Module } from '@nestjs/common'

@Module({
  controllers: [AuthController],
  providers: [AuthRepo, AuthService],
})
export class AuthModule {}
