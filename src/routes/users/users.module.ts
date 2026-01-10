import { Module } from '@nestjs/common'
import { UsersController } from './users.controller'
import { UsersService } from '@/routes/users/users.service'
import { UsersRepository } from '@/routes/users/users.repo'

@Module({
  controllers: [UsersController],
  providers: [UsersService, UsersRepository],
})
export class UsersModule {}
