import { Injectable } from '@nestjs/common'
import { UploadApiErrorResponse, UploadApiResponse, v2 } from 'cloudinary'
import { MediaResType } from './media.model'
import { CloudinaryService, resolveResourceType } from '@/shared/service/cloudinary.service'
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
          resourceType: resolveResourceType(file.mimetype),
          folder: 'cash-evidence',
        }),
      ),
    )
    return {
      data: uploaded.map((item) => ({
        // `secure_url` = https; `url` mặc định là http và bị chặn khi làm chứng từ
        url: (item.secure_url ?? item.url) as string,
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
            // https: ảnh sản phẩm cũng nên là https để next/image + CSP không chặn
            url: (item.secure_url ?? item.url) as string,
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
