import { Injectable, UnprocessableEntityException } from '@nestjs/common'
import { MulterModuleOptions, MulterOptionsFactory } from '@nestjs/platform-express'
import multer, { memoryStorage } from 'multer'

@Injectable()
export class MediaConfigService implements MulterOptionsFactory {
  createMulterOptions(): MulterModuleOptions {
    return {
      storage: memoryStorage(),
      limits: {
        // Form thêm món ghi "mỗi ảnh < 5MB": ảnh chụp điện thoại thường 2–4MB
        fileSize: 5 * 1024 * 1024,
      },
      fileFilter(req, file, callback) {
        const allowedMimeTypes = /\/(jpg|jpeg|png)$/

        if (allowedMimeTypes.test(file.mimetype)) {
          callback(null, true)
        } else
          callback(
            new UnprocessableEntityException({
              message: 'Error.InvalidMimeType',
              path: 'file',
            }),
            false,
          )
      },
    }
  }
}
