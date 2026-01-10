import { PrismaService } from '@/shared/service/prisma.service'
import { Injectable } from '@nestjs/common'

@Injectable()
export class ProfileRepository {
  constructor(private readonly prismaService: PrismaService) {}
}
