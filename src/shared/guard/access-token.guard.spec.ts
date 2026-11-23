import { ForbiddenException } from '@nestjs/common'
import { AccessTokenGuard } from './access-token.guard'

/**
 * Regression cho lo hong phan quyen va cac loi hoi quy:
 * - `if (!canAccess) throw new ForbiddenException()` tung bi comment out
 *   => moi user da dang nhap goi duoc moi endpoint.
 * - cache-miss dung `role.permission` (sai ten) => permissions luon rong,
 *   neu chi bo comment thi TAT CA deu bi 403.
 * - cache-hit khong set REQUEST_ROLE_KEY => @ActiveRole tra undefined.
 * - HEAD khong co trong bang Permission => bi 403 oan.
 */
describe('AccessTokenGuard', () => {
  const makeRequest = (method: string, path: string) => ({
    method,
    route: { path },
    headers: { authorization: 'Bearer fake' },
  })

  const makeContext = (request: any) =>
    ({
      switchToHttp: () => ({ getRequest: () => request }),
    }) as any

  const makeGuard = (opts: { role?: any; cached?: any }) => {
    const tokenService = {
      VerifyAccessToken: jest.fn().mockResolvedValue({
        userId: 1,
        roleId: 4,
        roleName: 'GUEST',
        iat: 0,
        exp: 0,
      }),
    }
    const prismaService = {
      role: {
        findFirstOrThrow: opts.role
          ? jest.fn().mockResolvedValue(opts.role)
          : jest.fn().mockRejectedValue(new Error('not found')),
      },
    }
    const cacheService = {
      get: jest.fn().mockResolvedValue(opts.cached ?? null),
      set: jest.fn().mockResolvedValue(undefined),
    }
    return new AccessTokenGuard(tokenService as any, prismaService as any, cacheService as any)
  }

  it('cho phep khi role co dung method+path (cache-miss)', async () => {
    const guard = makeGuard({ role: { id: 4, name: 'GUEST', permissions: [{ method: 'GET', path: '/users' }] } })
    await expect(guard.canActivate(makeContext(makeRequest('GET', '/users')))).resolves.toBe(true)
  })

  it('chan 403 khi role KHONG co quyen do', async () => {
    const guard = makeGuard({
      role: { id: 4, name: 'GUEST', permissions: [{ method: 'POST', path: '/guest/new-order' }] },
    })
    await expect(guard.canActivate(makeContext(makeRequest('GET', '/users')))).rejects.toBeInstanceOf(
      ForbiddenException,
    )
  })

  it('chan 403 khi roleId khong ton tai hoac da bi xoa', async () => {
    const guard = makeGuard({})
    await expect(guard.canActivate(makeContext(makeRequest('GET', '/users')))).rejects.toBeInstanceOf(
      ForbiddenException,
    )
  })

  it('cache-hit: dung quyen trong cache va van set role cho @ActiveRole', async () => {
    const cached = {
      id: 2,
      name: 'STAFF',
      permissions: { 'GET:/orders': { method: 'GET', path: '/orders' } },
    }
    const request = makeRequest('GET', '/orders')
    const guard = makeGuard({ cached })

    await expect(guard.canActivate(makeContext(request))).resolves.toBe(true)
    expect((request as any).role).toEqual(cached)
  })

  it('cache-hit: chan 403 khi cache khong co quyen', async () => {
    const cached = { id: 2, name: 'STAFF', permissions: {} }
    const guard = makeGuard({ cached })
    await expect(guard.canActivate(makeContext(makeRequest('DELETE', '/users/1')))).rejects.toBeInstanceOf(
      ForbiddenException,
    )
  })

  it('HEAD dung chung quyen GET', async () => {
    const guard = makeGuard({ role: { id: 4, name: 'GUEST', permissions: [{ method: 'GET', path: '/users' }] } })
    await expect(guard.canActivate(makeContext(makeRequest('HEAD', '/users')))).resolves.toBe(true)
  })
})
