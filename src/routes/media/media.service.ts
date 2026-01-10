import { Injectable } from '@nestjs/common'
import { UploadApiErrorResponse, UploadApiResponse, v2 } from 'cloudinary'
import { MediaResType } from './media.model'
import { CloudinaryService } from '@/shared/service/cloudinary.service'
@Injectable()
export class MediaService {
  constructor(private readonly cloudinaryService: CloudinaryService) {}
  async uploadFiles(files: Express.Multer.File[]): Promise<MediaResType> {
    try {
      const resuft = await Promise.all(files.map((file) => this.cloudinaryService.uploadFile(file)))
      return {
        data: resuft.map((item) => {
          return {
            url: item.url as string,
            mimeType: `${item.resource_type}/${item.format}`,
            fileName: `${item.display_name}.${item.format}`,
          }
        }),
      }
    } catch (e) {
      throw e
    }
  }
}
