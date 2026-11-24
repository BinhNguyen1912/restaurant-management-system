import { Body, Controller, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common'
import { ZodSerializerDto } from 'nestjs-zod'
import { AccessTokenPayload } from '@/shared/types/jwt.types'
import { ActiveUser } from '@/shared/decorators/active-user.decorator'
import { ReconciliationService } from '@/routes/reconciliation/reconciliation.service'
import {
  ResolveItemDTO,
  RunDetailDTO,
  RunListDTO,
  RunQueryDTO,
  RunResDTO,
} from '@/routes/reconciliation/reconciliation.dtos'
import { resolveBranchId } from '@/shared/service/branch.resolver'
import { PrismaService } from '@/shared/service/prisma.service'
import { DEFAULT_RECONCILIATION_PERIOD, resolvePeriod } from '@/routes/reconciliation/reconciliation.period'

/**
 * Đối soát lưu lịch sử (ticket #13) — ADMIN.
 * Chạy tay được, cron 02:30 hằng ngày cũng chạy cho từng chi nhánh.
 */
@Controller('reconciliation')
export class ReconciliationController {
  constructor(
    private readonly reconciliationService: ReconciliationService,
    private readonly prismaService: PrismaService,
  ) {}

  /** Chạy đối soát 1 kỳ (bỏ trống ngày = hôm qua) */
  @Post('runs')
  @ZodSerializerDto(RunResDTO)
  async run(@Body() body: RunQueryDTO, @ActiveUser() user: AccessTokenPayload) {
    const period = resolvePeriod(body.fromDate, body.toDate)
    const branchId = body.branchId ?? (await resolveBranchId(this.prismaService, user))
    const run = await this.reconciliationService.executeRun({ ...period, branchId })
    return {
      message: 'Success.ReconciliationRun',
      run: { ...run, branchCode: run.branch?.code ?? null },
    }
  }

  /** Lịch sử các lần chạy */
  @Get('runs')
  @ZodSerializerDto(RunListDTO)
  async list(@Query() query: RunQueryDTO) {
    const runs = await this.reconciliationService.list(query)
    return {
      message: 'Success.ReconciliationRuns',
      data: runs.map((run) => ({
        id: run.id,
        periodFrom: run.periodFrom,
        periodTo: run.periodTo,
        branchId: run.branchId,
        branchCode: run.branch?.code ?? null,
        status: run.status,
        summary: run.summary ?? null,
        itemCount: run._count.items,
        startedAt: run.startedAt,
        finishedAt: run.finishedAt,
      })),
    }
  }

  /** Chi tiết 1 lần chạy: từng sai lệch */
  @Get('runs/:id')
  @ZodSerializerDto(RunDetailDTO)
  async detail(@Param('id', ParseIntPipe) id: number) {
    const run = await this.reconciliationService.detail(id)
    return {
      message: 'Success.ReconciliationRunDetail',
      run: {
        id: run.id,
        periodFrom: run.periodFrom,
        periodTo: run.periodTo,
        branchId: run.branchId,
        branchCode: run.branch?.code ?? null,
        status: run.status,
        summary: run.summary ?? null,
        error: run.error,
        startedAt: run.startedAt,
        finishedAt: run.finishedAt,
      },
      items: run.items,
    }
  }

  /** Đánh dấu sai lệch đã xử lý / bỏ qua (KHÔNG xoá dấu vết) */
  @Post('items/:id/status')
  async resolve(@Param('id', ParseIntPipe) id: number, @Body() body: ResolveItemDTO) {
    const item = await this.reconciliationService.resolveItem(id, body.status)
    return { message: 'Success.ReconciliationItemUpdated', item }
  }

  /** Kỳ mặc định của nút "Chạy đối soát" trên FE */
  @Get('default-period')
  defaultPeriod() {
    return { message: 'Success.ReconciliationDefaultPeriod', ...DEFAULT_RECONCILIATION_PERIOD }
  }
}
