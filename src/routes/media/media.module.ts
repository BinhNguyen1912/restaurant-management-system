import { Module } from '@nestjs/common'
import { MediaController } from './media.controller'
import { MediaService } from './media.service'
import { MulterModule } from '@nestjs/platform-express'
import { MediaConfigService } from './media.config'
import fs from 'fs'
import { v2 } from 'cloudinary'
import envConfig from '@/shared/config'
export const CLOUDINARY = 'Cloudinary'
@Module({
  imports: [
    MulterModule.registerAsync({
      useClass: MediaConfigService,
    }),
  ],
  controllers: [MediaController],
  providers: [
    MediaService,
    {
      provide: CLOUDINARY,
      useFactory: () => {
        return v2.config({
          api_key: envConfig.CLOUDINARY_KEY,
          cloud_name: envConfig.CLOUDINARY_NAME,
          api_secret: envConfig.CLOUDINARY_SECRET,
        })
      },
    },
  ],
})
export class MediaModule {}
