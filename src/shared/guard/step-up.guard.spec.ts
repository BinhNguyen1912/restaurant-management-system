import { HttpException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { STEP_UP_REQUIRED_KEY, STEP_UP_TOKEN_HEADER } from '@/shared/constants/auth.constant'
import { StepUpGuard } from '@/shared/guard/step-up.guard'

/**
 * Guard cho thao tác nhạy cảm — năm điều kiện, mỗi điều là một đường mở nếu sai:
 *  1. route không gắn `@RequireStepUp()` thì guard không có quyền cản trở gì;
 *  2. gắn rồi mà thiếu vé ⇒ 401 `Error.StepUpRequired` (FE biết phải hỏi mật khẩu, khác "không có quyền");
 *  3. vé hỏng/hết hạn ⇒ 401 `Error.StepUpInvalid`;
 *  4. **vé của người khác ⇒ chặn** — không có điều này thì vé hợp lệ của bất kỳ ai mở khoá được cho mọi người;
 *  5. vé đúng người, đúng loại ⇒ cho qua.
 */
class FakeController {}
const handlerWithoutStepUp = () => {}
const handlerWithStepUp = () => {}
Reflect.defineMetadata(STEP_UP_REQUIRED_KEY, true, handlerWithStepUp)

const makeContext = (options: {
  headers?: Record<string, unknown>
  user?: { userId: number }
  handler?: () => void
}) =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ headers: options.headers ?? {}, user: options.user }) }),
    getHandler: () => options.handler ?? handlerWithStepUp,
    getClass: () => FakeController,
  }) as never

const makeGuard = (VerifyStepUpToken: jest.Mock) =>
  new StepUpGuard({ VerifyStepUpToken } as never, new Reflector())

describe('StepUpGuard', () => {
  it('route không gắn @RequireStepUp thì cho qua, không cần vé', async () => {
    const verify = jest.fn()
    const guard = makeGuard(verify)

    const result = await guard.canActivate(makeContext({ handler: handlerWithoutStepUp }))

    expect(result).toBe(true)
    expect(verify).not.toHaveBeenCalled()
  })

  it('thiếu vé thì 401 Error.StepUpRequired (khác 403 "không có quyền")', async () => {
    const guard = makeGuard(jest.fn())

    await expect(guard.canActivate(makeContext({ user: { userId: 7 } }))).rejects.toMatchObject({
      status: 401,
      response: 'Error.StepUpRequired',
    })
  })

  it('vé hỏng hoặc hết hạn thì 401 Error.StepUpInvalid', async () => {
    const verify = jest.fn().mockRejectedValue(new Error('jwt expired'))
    const guard = makeGuard(verify)

    await expect(
      guard.canActivate(makeContext({ headers: { [STEP_UP_TOKEN_HEADER]: 'rac' }, user: { userId: 7 } })),
    ).rejects.toMatchObject({ status: 401, response: 'Error.StepUpInvalid' })
  })

  it('vé của NGƯỜI KHÁC bị chặn', async () => {
    const verify = jest.fn().mockResolvedValue({ userId: 99, typ: 'STEP_UP' })
    const guard = makeGuard(verify)

    const attempt = guard.canActivate(
      makeContext({ headers: { [STEP_UP_TOKEN_HEADER]: 've-cua-nguoi-khac' }, user: { userId: 7 } }),
    )

    await expect(attempt).rejects.toBeInstanceOf(HttpException)
    await expect(attempt).rejects.toMatchObject({ response: 'Error.StepUpInvalid' })
  })

  it('payload sai loại token thì chặn, dù chữ ký hợp lệ', async () => {
    const verify = jest.fn().mockResolvedValue({ userId: 7, typ: 'ACCESS' })
    const guard = makeGuard(verify)

    await expect(
      guard.canActivate(makeContext({ headers: { [STEP_UP_TOKEN_HEADER]: 've-la' }, user: { userId: 7 } })),
    ).rejects.toMatchObject({ response: 'Error.StepUpInvalid' })
  })

  it('vé đúng người, đúng loại thì cho qua (header lặp vẫn lấy phần tử đầu)', async () => {
    const verify = jest.fn().mockResolvedValue({ userId: 7, typ: 'STEP_UP' })
    const guard = makeGuard(verify)

    const result = await guard.canActivate(
      makeContext({ headers: { [STEP_UP_TOKEN_HEADER]: ['ve-dung', 've-thua'] }, user: { userId: 7 } }),
    )

    expect(result).toBe(true)
    expect(verify).toHaveBeenCalledWith('ve-dung')
  })

  it('không có request.user (guard chạy sai thứ tự) thì cũng chặn', async () => {
    const verify = jest.fn().mockResolvedValue({ userId: 7, typ: 'STEP_UP' })
    const guard = makeGuard(verify)

    await expect(
      guard.canActivate(makeContext({ headers: { [STEP_UP_TOKEN_HEADER]: 've-dung' } })),
    ).rejects.toMatchObject({ response: 'Error.StepUpInvalid' })
  })
})
