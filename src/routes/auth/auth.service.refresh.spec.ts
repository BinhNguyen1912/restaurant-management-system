import { AuthService } from '@/routes/auth/auth.service'
import { RefreshTokenAlreadyUsedException, RefreshTokenNotFoundOrExpiredException } from '@/routes/auth/auth.error'
import { ClaimRefreshTokenResult } from '@/routes/auth/auth.repo'
import { hashRefreshToken } from '@/shared/service/token-hash'

/**
 * Xoay vòng refresh token nhân viên (prod-readiness 0.2 #3).
 *
 * Ba nhánh phải khoá cứng bằng test vì sai một nhánh là hoặc mất phiên của người dùng thật,
 * hoặc để kẻ có token cũ tiếp tục đổi được access token:
 * (a) token chưa dùng -> cấp cặp mới, cùng family;
 * (b) token đã dùng -> revoke cả family + 401;
 * (c) token không có trong DB -> 401.
 *
 * Repo/Prisma được giả lập, không cần DB.
 */
const OLD_TOKEN = 'old.refresh.token'
const NEW_TOKEN = 'new.refresh.token'
const FAMILY_ID = 'family-1'
const USER_ID = 7
const EXP_SECONDS = 1893456000

function makeService(claim: ClaimRefreshTokenResult) {
  const authRepo = {
    claimRefreshToken: jest.fn(async () => claim),
    unclaimRefreshToken: jest.fn(async () => ({ count: 1 })),
    createRefreshToken: jest.fn(async (data: any) => ({
      ...data,
      usedAt: null,
      revokedAt: null,
      createdAt: new Date(),
    })),
  }

  const tokenService = {
    // Token cũ đã được ký từ trước; token mới do service vừa tạo nên verify lần nữa để lấy `exp`.
    VerifyRefreshToken: jest.fn(async () => ({
      userId: USER_ID,
      roleId: 2,
      roleName: 'STAFF',
      iat: EXP_SECONDS - 3600,
      exp: EXP_SECONDS,
    })),
    createAcessToken: jest.fn(async () => 'new.access.token'),
    createRefreshToken: jest.fn(async () => NEW_TOKEN),
  }

  const sharedRefreshTokenRepo = { revokeUserRefreshTokens: jest.fn(async () => ({ count: 0 })) }

  const service = new AuthService(
    {} as any,
    {} as any,
    authRepo as any,
    tokenService as any,
    {} as any,
    {} as any,
    sharedRefreshTokenRepo as any,
  )

  return { service, authRepo, tokenService, sharedRefreshTokenRepo }
}

function claimedRecord() {
  return {
    userId: USER_ID,
    tokenHash: hashRefreshToken(OLD_TOKEN),
    familyId: FAMILY_ID,
    expiresAt: new Date(EXP_SECONDS * 1000),
    usedAt: new Date(),
    revokedAt: null,
    createdAt: new Date(),
    user: {
      id: USER_ID,
      roleId: 2,
      role: { id: 2, name: 'STAFF' },
    },
  } as any
}

describe('AuthService.provideAccessTokenByRefreshToken', () => {
  it('(a) token chua dung -> cap cap token moi trong CUNG family', async () => {
    const { service, authRepo } = makeService({ status: 'CLAIMED', record: claimedRecord() })

    const result = await service.provideAccessTokenByRefreshToken({ refreshToken: OLD_TOKEN })

    expect(result).toEqual({ accessToken: 'new.access.token', refreshToken: NEW_TOKEN })
    // Claim phai di bang hash, khong bao gio bang plaintext token.
    expect(authRepo.claimRefreshToken).toHaveBeenCalledWith(hashRefreshToken(OLD_TOKEN))
    expect(authRepo.createRefreshToken).toHaveBeenCalledTimes(1)
    expect(authRepo.createRefreshToken).toHaveBeenCalledWith({
      userId: USER_ID,
      tokenHash: hashRefreshToken(NEW_TOKEN),
      familyId: FAMILY_ID,
      expiresAt: new Date(EXP_SECONDS * 1000),
    })
    // Khong luu token dang plaintext.
    const stored: any = authRepo.createRefreshToken.mock.calls[0][0]
    expect(JSON.stringify(stored)).not.toContain(NEW_TOKEN)
  })

  it('(b) token da dung (usedAt da set) -> da revoke ca family va nem 401 AlreadyUsed', async () => {
    const { service, authRepo } = makeService({ status: 'REUSE', familyId: FAMILY_ID })

    await expect(service.provideAccessTokenByRefreshToken({ refreshToken: OLD_TOKEN })).rejects.toBe(
      RefreshTokenAlreadyUsedException,
    )
    // Khong duoc cap token moi nao trong family da bi thu hoi.
    expect(authRepo.createRefreshToken).not.toHaveBeenCalled()
  })

  it('(c) token khong co trong DB -> 401 NotFoundOrExpired, khong cap token moi', async () => {
    const { service, authRepo } = makeService({ status: 'NOT_FOUND' })

    await expect(service.provideAccessTokenByRefreshToken({ refreshToken: OLD_TOKEN })).rejects.toBe(
      RefreshTokenNotFoundOrExpiredException,
    )
    expect(authRepo.createRefreshToken).not.toHaveBeenCalled()
  })

  it('cap token moi that bai -> token vua trinh ra duoc tra ve chua dung va loi van nem ra', async () => {
    const { service, authRepo } = makeService({ status: 'CLAIMED', record: claimedRecord() })
    // Claim da commit nhung buoc mint (insert refresh token moi) loi: khong duoc de token o trang thai da dung.
    const mintError = new Error('insert refresh token failed')
    authRepo.createRefreshToken.mockRejectedValueOnce(mintError)

    await expect(service.provideAccessTokenByRefreshToken({ refreshToken: OLD_TOKEN })).rejects.toBe(mintError)
    expect(authRepo.unclaimRefreshToken).toHaveBeenCalledTimes(1)
    expect(authRepo.unclaimRefreshToken).toHaveBeenCalledWith(hashRefreshToken(OLD_TOKEN))
  })

  it('JWT het han/khong hop le -> 401, khong cham DB', async () => {
    const { service, authRepo, tokenService } = makeService({ status: 'NOT_FOUND' })
    tokenService.VerifyRefreshToken.mockRejectedValueOnce(new Error('jwt expired'))

    await expect(service.provideAccessTokenByRefreshToken({ refreshToken: OLD_TOKEN })).rejects.toThrow(/jwt expired/)
    expect(authRepo.claimRefreshToken).not.toHaveBeenCalled()
  })
})

describe('AuthService.logout', () => {
  it('thu hoi TOAN BO refresh token cua user, khong chi token gui len', async () => {
    const { service, sharedRefreshTokenRepo } = makeService({ status: 'NOT_FOUND' })

    await expect(service.logout({ refreshToken: OLD_TOKEN })).resolves.toEqual({
      message: 'Đằng xuất thành công',
    })
    expect(sharedRefreshTokenRepo.revokeUserRefreshTokens).toHaveBeenCalledWith(USER_ID)
  })

  it('token khong hop le -> 422, khong revoke gi', async () => {
    const { service, sharedRefreshTokenRepo, tokenService } = makeService({ status: 'NOT_FOUND' })
    tokenService.VerifyRefreshToken.mockRejectedValueOnce(new Error('invalid signature'))

    await expect(service.logout({ refreshToken: 'rac' })).rejects.toThrow()
    expect(sharedRefreshTokenRepo.revokeUserRefreshTokens).not.toHaveBeenCalled()
  })
})
