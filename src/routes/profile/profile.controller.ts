import { Body, Controller, Get, Patch, Put } from '@nestjs/common'
import { ProfileService } from './profile.service'
import { ZodSerializerDto } from 'nestjs-zod'
import { ActiveUser } from '@/shared/decorators/active-user.decorator'
import { GetProfileDetailResDTO, UpdateProfileResDTO } from '@/shared/dtos/shared-users.dto'
import { ChangePassWordBodyDTO, updateMeBodyDTO } from '@/routes/profile/profile.dto'
import { MessageResDto } from '@/shared/dtos/respone.dto'

@Controller('profile')
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get()
  @ZodSerializerDto(GetProfileDetailResDTO)
  async getProfile(@ActiveUser('userId') userId: number) {
    const user = await this.profileService.getProfile(userId)
    return user
  }

  @Put('update-profile')
  @ZodSerializerDto(UpdateProfileResDTO)
  async update(@Body() body: updateMeBodyDTO, @ActiveUser('userId') userId: number) {
    const resuft = await this.profileService.updateProfile({
      data: body,
      userId,
    })
    return resuft
  }

  @Put('ChangePassword')
  @ZodSerializerDto(UpdateProfileResDTO)
  async ChangePassword(@Body() body: ChangePassWordBodyDTO, @ActiveUser('userId') userId: number) {
    const resuft = await this.profileService.ChangePassword({ body, id: userId })
    return resuft
  }
}
