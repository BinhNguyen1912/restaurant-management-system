import { ALLOW_DURING_ENROLMENT_KEY, REQUEST_USER_KEY } from '@/shared/constants/auth.constant'
import { TwoFactorEnrolmentGuard } from '@/shared/guard/two-factor-enrolment.guard'
import { ExecutionContext, HttpException, HttpStatus } from '@nestjs/common'
import { Reflector } from '@nestjs/core'

const handler = () => {}
const enrolmentHandler = () => {}
Reflect.defineMetadata(ALLOW_DURING_ENROLMENT_KEY, true, enrolmentHandler)

class FakeController {}

const contextWith = (input: { user?: unknown; handler?: () => void }) =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ [REQUEST_USER_KEY]: input.user }) }),
    getHandler: () => input.handler ?? handler,
    getClass: () => FakeController,
  }) as unknown as ExecutionContext

const catchHttp = (run: () => boolean): HttpException => {
  try {
    run()
  } catch (error) {
    if (error instanceof HttpException) return error
    throw error
  }
  throw new Error('không ném lỗi — test này cần một lỗi HTTP')
}

describe('TwoFactorEnrolmentGuard', () => {
  const guard = new TwoFactorEnrolmentGuard(new Reflector())

  it('phiên bình thường (không có cờ) đi qua mọi route', () => {
    expect(guard.canActivate(contextWith({ user: { userId: 7, roleName: 'STAFF' } }))).toBe(true)
  })

  it('route công khai (không có user) đi qua', () => {
    expect(guard.canActivate(contextWith({ user: undefined }))).toBe(true)
  })

  it('phiên đang phải enrolment bị chặn 403 đúng mã lỗi', () => {
    const error = catchHttp(() => guard.canActivate(contextWith({ user: { userId: 7, enrolmentRequired: true } })))
    expect(error.getStatus()).toBe(HttpStatus.FORBIDDEN)
    expect(error.getResponse()).toBe('Error.TwoFactorEnrolmentRequired')
  })

  it('đường tự mở (@AllowDuringEnrolment) vẫn đi qua', () => {
    expect(
      guard.canActivate(contextWith({ user: { userId: 7, enrolmentRequired: true }, handler: enrolmentHandler })),
    ).toBe(true)
  })

  it('cờ false rõ ràng cũng là phiên bình thường', () => {
    expect(guard.canActivate(contextWith({ user: { userId: 7, enrolmentRequired: false } }))).toBe(true)
  })
})
