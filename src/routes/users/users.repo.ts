import { getListUsersType, GetUsersQueryType, UserBodyType } from '@/routes/users/users.model'
import { CreateGuestType } from '@/shared/models/shared-guest.model'
import { UserType } from '@/shared/models/shared-user.model'
import { PrismaService } from '@/shared/service/prisma.service'
import { Injectable } from '@nestjs/common'

@Injectable()
export class UsersRepository {
  constructor(private readonly prismaService: PrismaService) {}
  createUser(body: UserBodyType & Pick<UserType, 'createdById'>): Promise<UserType> {
    return this.prismaService.user.create({ data: body }) as any
  }
  async getListUsers(pagination: GetUsersQueryType): Promise<getListUsersType> {
    const take = pagination.limit
    const skip = (pagination.page - 1) * pagination.limit
    const [data, totalItems] = await Promise.all([
      this.prismaService.user.findMany({
        where: { deletedAt: null },
        skip,
        take,
        include: {
          branch: { select: { id: true, code: true, name: true } },
          role: {
            select: {
              name: true,
              id: true,
              permissions: {
                select: {
                  id: true,
                  method: true,
                  name: true,
                  path: true,
                  module: true,
                },
              },
            },
          },
        },
      }),
      this.prismaService.user.count({
        where: { deletedAt: null },
      }),
    ])
    return {
      data,
      limit: take,
      page: pagination.page,
      totalItems,
      totalPages: Math.ceil(totalItems / take),
    } as any
  }
  async deleteUser({ id, isHard, deletedById }: { id: number; isHard?: boolean; deletedById?: number }) {
    return isHard
      ? await this.prismaService.user.update({
          where: { id, deletedAt: null },
          data: { deletedAt: new Date(), deletedById },
        })
      : await this.prismaService.user.delete({ where: { id, deletedAt: null } })
  }
}
