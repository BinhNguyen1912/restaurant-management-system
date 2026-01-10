import { createZodDto } from 'nestjs-zod'

import { Get } from '@nestjs/common'
import {
  getListUsersSchema,
  GetParamsUserSchema,
  GetUsersQuerySchema,
  UpdateUserBodySchema,
  UserBodySchema,
  UserResSchema,
} from '@/routes/users/users.model'

export class UserBodyDTO extends createZodDto(UserBodySchema) {}
export class UserResDTO extends createZodDto(UserResSchema) {}
export class UpdateUserBodyDTO extends createZodDto(UpdateUserBodySchema) {}
export class GetParamsUserDTO extends createZodDto(GetParamsUserSchema) {}
export class getUsersQueryDTO extends createZodDto(GetUsersQuerySchema) {}
export class getListUsersDTO extends createZodDto(getListUsersSchema) {}
