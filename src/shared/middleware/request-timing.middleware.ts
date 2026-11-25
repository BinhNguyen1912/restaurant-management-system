import { Injectable, Logger, NestMiddleware } from '@nestjs/common'
import { NextFunction, Request, Response } from 'express'

/**
 * Đo thời gian từng request — bật bằng `LOG_REQUESTS=true` (mặc định tắt để không rác log).
 *
 * Có cái này mới trả lời được "FE chậm vì trang hay vì API": log in `method path status ms`,
 * request > 300ms bị đánh dấu `SLOW`.
 */
@Injectable()
export class RequestTimingMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP')

  use(req: Request, res: Response, next: NextFunction) {
    const startedAt = process.hrtime.bigint()
    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - startedAt) / 1_000_000
      const line = `${req.method} ${req.originalUrl} ${res.statusCode} ${ms.toFixed(0)}ms`
      if (ms >= 300) this.logger.warn(`${line} SLOW`)
      else this.logger.log(line)
    })
    next()
  }
}
