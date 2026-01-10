import { getAllUnitResType, unitBodyType, unitResType, unitUpdateBodyType } from '@/routes/unit/unit.model'
import { PrismaService } from '@/shared/service/prisma.service'
import { Injectable } from '@nestjs/common'

@Injectable()
export class UnitRepo {
  constructor(private readonly prismaService: PrismaService) {}

  create(data: unitBodyType, userId: number): Promise<unitResType> {
    return this.prismaService.unit.create({
      data: {
        ...data,
        createdById: userId,
      },
    })
  }
  async getList(): Promise<getAllUnitResType> {
    const [data, totalItems] = await Promise.all([
      this.prismaService.unit.findMany({
        where: {
          deletedAt: null,
        },
        orderBy: {
          createdAt: 'desc',
        },
      }),
      this.prismaService.unit.count({
        where: {
          deletedAt: null,
        },
      }),
    ])
    return {
      data,
      totalItems,
    }
  }
  update({ name, data, userId }: { name: string; data: unitUpdateBodyType; userId: number }): Promise<unitResType> {
    return this.prismaService.unit.update({
      where: {
        name,
        deletedAt: null,
      },
      data: {
        ...data,
        updatedById: userId,
      },
    })
  }
  delete({ name, isHard, userId }: { name: string; isHard?: boolean; userId: number }): Promise<unitResType> {
    return isHard
      ? this.prismaService.unit.update({
          where: {
            name,
            deletedAt: null,
          },
          data: {
            deletedAt: new Date(),
            deletedById: userId,
          },
        })
      : this.prismaService.unit.delete({ where: { name, deletedAt: null } })
  }
}
