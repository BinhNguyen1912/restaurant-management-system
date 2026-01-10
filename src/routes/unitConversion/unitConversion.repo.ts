import {
  getAllUnitConversionResType,
  unitConversionBodyType,
  unitConversionResType,
  unitConversionUpdateBodyType,
} from '@/routes/unitConversion/unitConversion.model'
import { PrismaService } from '@/shared/service/prisma.service'
import { Injectable } from '@nestjs/common'

@Injectable()
export class UnitConversionRepo {
  constructor(private readonly prismaService: PrismaService) {}

  create(data: unitConversionBodyType, userId: number): Promise<unitConversionResType> {
    return this.prismaService.unitConversion.create({
      data: {
        ...data,
        createdById: userId,
      },
    })
  }
  async getList(): Promise<getAllUnitConversionResType> {
    const [data, totalItems] = await Promise.all([
      this.prismaService.unitConversion.findMany({
        where: {
          deletedAt: null,
        },
        orderBy: {
          createdAt: 'desc',
        },
      }),
      this.prismaService.unitConversion.count({
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
  update({
    id,
    data,
    userId,
  }: {
    id: number
    data: unitConversionUpdateBodyType
    userId: number
  }): Promise<unitConversionResType> {
    return this.prismaService.unitConversion.update({
      where: {
        id,
        deletedAt: null,
      },
      data: {
        ...data,
        updatedById: userId,
      },
    })
  }
  delete({ id, isHard, userId }: { id: number; isHard?: boolean; userId: number }): Promise<unitConversionResType> {
    return isHard
      ? this.prismaService.unitConversion.update({
          where: {
            id,
            deletedAt: null,
          },
          data: {
            deletedAt: new Date(),
            deletedById: userId,
          },
        })
      : this.prismaService.unitConversion.delete({
          where: {
            id,
            deletedAt: null,
          },
        })
  }
}
