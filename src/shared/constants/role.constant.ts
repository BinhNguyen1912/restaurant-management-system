export const REQUEST_ROLE_KEY = 'role'
export const roleName = {
  ADMIN: 'ADMIN',
  STAFF: 'STAFF',
  GUEST: 'GUEST',
  USER: 'USER',
} as const

export const HTTPMethod = {
  GET: 'GET',
  POST: 'POST',
  PUT: 'PUT',
  PATCH: 'PATCH',
  DELETE: 'DELETE',
  OPTIONS: 'OPTIONS',
  HEAD: 'HEAD',
} as const

export type roleNameType = (typeof roleName)[keyof typeof roleName]
