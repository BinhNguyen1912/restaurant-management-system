import { Inject, Injectable } from '@nestjs/common'
import { Permission } from '@prisma/client'
import { GetListPermissionQueryType, GetParamsPermissionType, PermissionBodyType } from './permission.model'
import { PermissionRepo } from './permission.repo'
import { PermissionAlreadyExitsException, PermissionNotFoundException } from './permission.error'
import { isNotFoundPrisma, isUniqueConstraintPrisma } from '@/shared/helper'
import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { Cache } from 'cache-manager'
import { CacheService } from '@/cache/services/cache.service'
import { CACHE_KEYS } from '@/cache/cache.constant'

@Injectable()
export class PermissionService {
  constructor(
    private readonly permissionRepo: PermissionRepo,
    private readonly cacheService: CacheService,
  ) {}
  async create(body: PermissionBodyType & { createdById: number | null }) {
    try {
      return await this.permissionRepo.create(body)
    } catch (error) {
      if (isUniqueConstraintPrisma(error)) {
        throw PermissionAlreadyExitsException
      }
      throw new Error()
    }
  }

  async findAll(query: GetListPermissionQueryType) {
    try {
      const { orderBy, orderDirection } = query
      const SortByOrderBy = orderBy && orderDirection ? { [orderBy]: orderDirection } : undefined

      return await this.permissionRepo.findManyPermission({ ...query, SortByOrderBy })
    } catch (error) {
      if (isNotFoundPrisma(error)) {
        throw PermissionNotFoundException
      }
      throw error
    }
  }

  async findOne(paramsId: GetParamsPermissionType) {
    try {
      const permission = await this.permissionRepo.findUniquePermissionDetail(paramsId)

      if (!permission) throw PermissionNotFoundException
      return permission
    } catch (error) {
      if (isNotFoundPrisma(error)) {
        throw PermissionNotFoundException
      }
      throw error
    }
  }
  async update({
    id,
    data,
    updatedById,
  }: {
    id: number
    data: Partial<PermissionBodyType>
    updatedById: number | null
  }) {
    try {
      const permission = await this.permissionRepo.update({ id, data, updatedById })
      const { roles } = permission

      await this.deleteCacheRole(roles.map((r) => r.id))
      return permission
    } catch (error) {
      if (isNotFoundPrisma(error)) {
        throw PermissionNotFoundException
      }
      throw error
    }
  }

  async remove({ id, userId }: { id: number; userId: number }) {
    try {
      const permission = await this.permissionRepo.remove({ id, isHard: true, deletedById: userId })
      const { roles } = permission
      await this.deleteCacheRole(roles.map((r) => r.id))
      return { message: 'Deleted successfully' }
    } catch (error) {
      if (isNotFoundPrisma(error)) {
        throw PermissionNotFoundException
      }
      throw error
    }
  }
  async deleteCacheRole(roleId: number[]) {
    return await Promise.all(
      roleId.map(async (id) => {
        await this.cacheService.del(CACHE_KEYS.ROLE(id))
      }),
    )
  }
}
