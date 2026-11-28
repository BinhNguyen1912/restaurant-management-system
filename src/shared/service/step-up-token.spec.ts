import { TokenService } from '@/shared/service/token.service'
import { deriveKey } from '@/shared/service/key-derivation'
import envConfig from '@/shared/config'
import { STEP_UP_TOKEN_TTL_MINUTES } from '@/shared/constants/auth.constant'
import { JwtService } from '@nestjs/jwt'

/**
 * Vé nhập-lại-mật-khẩu (step-up) — phần ký/kiểm.
 *
 * Bốn điều kiện khoá ở đây, vì sai một cái là lớp bảo vệ thành trang trí:
 *  (a) vé đúng người dùng được, và payload nói đúng loại token;
 *  (b) vé KHÔNG dùng được như access token (và ngược lại) — đây là lý do khoá ký tách riêng;
 *  (c) hết hạn thì chết, không có hạn "trượt";
 *  (d) chữ ký bằng khoá khác thì chết.
 */
const jwtService = new JwtService({})
const tokenService = new TokenService(jwtService)

/** cùng tham số dẫn xuất với `TokenService.stepUpSecret` — nếu code đổi tham số, test này đỏ */
const stepUpSecret = () =>
  deriveKey({ material: envConfig.ACCESS_TOKEN_SECRET, salt: 'res-mana-step-up', info: 'step-up-token-v1' }).toString(
    'hex',
  )

describe('StepUpToken', () => {
  it('ký rồi kiểm được, đúng người và đúng loại token', async () => {
    const token = await tokenService.createStepUpToken({ userId: 42 })

    const payload = await tokenService.VerifyStepUpToken(token)

    expect(payload.userId).toBe(42)
    expect(payload.typ).toBe('STEP_UP')
  })

  it('vé KHÔNG dùng được như access token', async () => {
    const token = await tokenService.createStepUpToken({ userId: 42 })

    await expect(tokenService.VerifyAccessToken(token)).rejects.toBeTruthy()
  })

  it('access token KHÔNG dùng được như vé step-up', async () => {
    const accessToken = await tokenService.createAcessToken({ userId: 42, roleId: 1, roleName: 'ADMIN' })

    await expect(tokenService.VerifyStepUpToken(accessToken)).rejects.toBeTruthy()
  })

  it('hết hạn thì chết', async () => {
    const expired = jwtService.sign(
      { userId: 42, typ: 'STEP_UP' },
      { secret: stepUpSecret(), expiresIn: '-1s', algorithm: 'HS256' },
    )

    await expect(tokenService.VerifyStepUpToken(expired)).rejects.toBeTruthy()
  })

  it('ký bằng khoá khác thì chết', async () => {
    const foreign = jwtService.sign(
      { userId: 42, typ: 'STEP_UP' },
      { secret: 'khoa-cua-ke-tan-cong-khong-lien-quan-gi', expiresIn: '5m', algorithm: 'HS256' },
    )

    await expect(tokenService.VerifyStepUpToken(foreign)).rejects.toBeTruthy()
  })

  it('không phải JWT hợp lệ thì chết', async () => {
    await expect(tokenService.VerifyStepUpToken('khong-phai-jwt')).rejects.toBeTruthy()
  })

  it('hạn của vé ngắn — không phải một phiên thứ hai', () => {
    // 5 phút: đủ để gõ lại mật khẩu cho một thao tác, không đủ để thành phiên làm việc thứ hai.
    expect(STEP_UP_TOKEN_TTL_MINUTES).toBeLessThanOrEqual(10)
  })
})
