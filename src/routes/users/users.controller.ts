import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common'
import { UsersService } from './users.service'
import { ZodSerializerDto } from 'nestjs-zod'
import { AccessSubject } from '@prisma/client'
import {
  getListUsersDTO,
  GetParamsUserDTO,
  getUsersQueryDTO,
  UpdateUserBodyDTO,
  UserBodyDTO,
  UserResDTO,
} from '@/routes/users/user.dto'
import { ActiveUser } from '@/shared/decorators/active-user.decorator'
import { ActiveRole } from '@/shared/decorators/active-role.decorator'
import { LogAccess } from '@/shared/decorators/access-log.decorator'
import { CreateGuestDTO, CreateGuestResDTO, GetProfileDetailResDTO } from '@/shared/dtos/shared-users.dto'
import { MessageResDto } from '@/shared/dtos/respone.dto'
import { RequireStepUp } from '@/shared/decorators/step-up.decorator'

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @RequireStepUp()
  @ZodSerializerDto(UserResDTO)
  async create(
    @Body() body: UserBodyDTO,
    @ActiveUser('userId') createdById: number,
    @ActiveRole('name') roleName: string,
  ) {
    const user = await this.usersService.create({ createdById, roleName, body })
    return user
  }

  @Get(':userId')
  @LogAccess({ route: 'GET /users/:userId', subject: { type: AccessSubject.USER, param: 'userId' } })
  @ZodSerializerDto(GetProfileDetailResDTO)
  async getUser(@Param() param: GetParamsUserDTO) {
    const user = await this.usersService.getUser(param.userId)
    return user
  }

  @Put(':userId')
  @RequireStepUp()
  @ZodSerializerDto(UserResDTO)
  async update(
    @Param() param: GetParamsUserDTO,
    @Body() body: UpdateUserBodyDTO,
    @ActiveUser('userId') userId: number,
    @ActiveRole('name') updateByRoleName: string,
  ) {
    const user = await this.usersService.update({ data: body, id: param.userId, updateByRoleName, updatedById: userId })
    return user
  }

  @Get('')
  @LogAccess({ route: 'GET /users' })
  @ZodSerializerDto(getListUsersDTO)
  async getListUsers(@Query() pagination: getUsersQueryDTO) {
    const users = await this.usersService.getList(pagination)
    return users
  }

  @Delete(':userId')
  @RequireStepUp()
  @ZodSerializerDto(UserResDTO)
  async delete(
    @Param() param: GetParamsUserDTO,
    @ActiveUser('userId') deletedById: number,
    @ActiveRole('name') roleNameAgent: string,
  ) {
    return await this.usersService.delete({
      id: param.userId,
      deletedById,
      roleNameAgent,
    })
  }

  @Post('create-guest')
  @ZodSerializerDto(CreateGuestResDTO)
  async createGuest(@Body() body: CreateGuestDTO, @ActiveUser('userId') createdById: number) {
    const guest = await this.usersService.createGuest({ createdById, data: body })
    return guest
  }
}
