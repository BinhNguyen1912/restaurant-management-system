import { Module } from '@nestjs/common'
import { BranchController } from '@/routes/branch/branch.controller'
import { BranchService } from '@/routes/branch/branch.service'
import { BranchRepo } from '@/routes/branch/branch.repo'

@Module({
  controllers: [BranchController],
  providers: [BranchService, BranchRepo],
})
export class BranchModule {}
