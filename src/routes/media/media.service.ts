import { Injectable } from '@nestjs/common'
import { UploadApiErrorResponse, UploadApiResponse, v2 } from 'cloudinary'
import { MediaResType } from './media.model'
import { CloudinaryService } from '@/shared/service/cloudinary.service'
@Injectable()
export class MediaService {
  constructor(private readonly cloudinaryService: CloudinaryService) {}
  /**
   * Chứng từ tiền mặt: chấp nhận cả ảnh và video, lưu ở folder riêng.
   * `resource_type` phải khớp loại file, nếu không Cloudinary từ chối video.
   */
  async uploadEvidenceFiles(files: Express.Multer.File[]): Promise<MediaResType> {
    const uploaded = await Promise.all(
      files.map((file) =>
        this.cloudinaryService.uploadFile(file, {
          resourceType: file.mimetype.startsWith('video/') ? 'video' : 'image',
          folder: 'cash-evidence',
        }),
      ),
    )
    return {
      data: uploaded.map((item) => ({
        url: item.url as string,
        mimeType: `${item.resource_type}/${item.format}`,
        fileName: `${item.display_name ?? item.public_id}.${item.format}`,
      })),
    }
  }

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
