import { Injectable, OnModuleInit } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'
import envConfig from '../config'

import 'dotenv/config'
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  constructor() {
    super()
  }
  async onModuleInit() {
    await this.$connect()
  }
}
