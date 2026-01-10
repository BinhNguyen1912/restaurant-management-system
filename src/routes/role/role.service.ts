import { HttpException, Inject, Injectable, UnauthorizedException } from '@nestjs/common'
import { RoleRepository } from './role.repo'
import { GetRoleQueryType, RoleBodyType, UpdateRoleBodyType } from './role.model'
import {
  CannotUpdateAdminRoleException,
  CreateRoleFailedException,
  RoleAlreadyExitsException,
  RoleNotFoundException,
  SystemRoleDeletionErrorException,
} from './role.error'
import { SharedRoleRepo } from '@/shared/shared-repository/shared-role.repo'
import { isNotFoundPrisma, isUniqueConstraintPrisma } from '@/shared/helper'
import { roleName } from '@/shared/constants/role.constant'
import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { Cache } from 'cache-manager'
import { CacheService } from '@/cache/services/cache.service'
import { CACHE_KEYS } from '@/cache/cache.constant'

@Injectable()
export class RoleService {
  constructor(
    private readonly roleRepository: RoleRepository,
    private readonly sharedRoleRepo: SharedRoleRepo,
    private readonly cacheService: CacheService,
  ) {}
  async create(body: RoleBodyType & { createdById: number | null }) {
    try {
      return await this.roleRepository.create(body)
    } catch (error) {
      if (isUniqueConstraintPrisma(error)) {
        throw RoleAlreadyExitsException
      }
      throw CreateRoleFailedException
    }
  }
  async getListRole(query: GetRoleQueryType) {
    try {
      return await this.roleRepository.getListRoleWithPermission(query)
    } catch (error) {
      throw error
    }
  }
  async findById(id: number) {
    try {
      return await this.roleRepository.findRoleByIdWithPermission(id)
    } catch (error) {
      if (isNotFoundPrisma(error)) {
        throw RoleNotFoundException
      }
      throw new UnauthorizedException()
    }
  }
  async update({ data, id, updatedById }: { id: number; data: UpdateRoleBodyType; updatedById: number }) {
    try {
      const role = await this.sharedRoleRepo.findRoleById({
        id,
        deletedAt: null,
      })

      if (!role) throw RoleNotFoundException
      if (role.name === roleName.ADMIN) throw CannotUpdateAdminRoleException

      const resuft = await this.roleRepository.update({ data, id, updatedById })
      await this.cacheService.del(CACHE_KEYS.ROLE(id))
      return resuft
    } catch (error) {
      if (isUniqueConstraintPrisma(error)) {
        throw RoleAlreadyExitsException
      }
      if (isNotFoundPrisma(error)) {
        throw RoleNotFoundException
      }
      if (error instanceof HttpException) throw error
      throw error
    }
  }
  async delete(id: number) {
    try {
      const role = await this.sharedRoleRepo.findRoleById({ id, deletedAt: null })
      if (!role) {
        throw RoleNotFoundException
      }
      //Kiểm tra xem nó có xóa 3 role cơ bản của chúng ra không ?
      if ([roleName.ADMIN, roleName.GUEST, roleName.STAFF, roleName.USER].includes(role.name as keyof typeof roleName))
        throw SystemRoleDeletionErrorException
      const resuft = await this.roleRepository.delete({
        id,
        isHard: true,
      })
      await this.cacheService.del(CACHE_KEYS.ROLE(id))
      return {
        message: 'Deleted successfully',
      }
    } catch (error) {
      if (isNotFoundPrisma(error)) {
        throw RoleNotFoundException
      }
      if (error instanceof HttpException) throw error
      throw new UnauthorizedException()
    }
  }
}
