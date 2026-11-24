import { UploadApiErrorResponse, UploadApiResponse, v2 } from 'cloudinary'
import toStream from 'buffer-to-stream'

export type UploadResourceType = 'image' | 'video' | 'auto'

export class CloudinaryService {
  /** Video phải khai báo resource_type='video', nếu không Cloudinary từ chối file */
  uploadFile(
    file: Express.Multer.File,
    options: { resourceType?: UploadResourceType; folder?: string } = {},
  ): Promise<UploadApiResponse | UploadApiErrorResponse> {
    const resourceType = options.resourceType ?? (file.mimetype.startsWith('video/') ? 'video' : 'image')
    return new Promise((resolve, reject) => {
      const upload = v2.uploader.upload_stream(
        {
          folder: options.folder ?? 'Ecommers',
          public_id: file.filename,
          resource_type: resourceType,
        },
        (error, result) => {
          if (error) return reject(error)
          resolve(result as UploadApiResponse)
        },
      )

      toStream(file.buffer).pipe(upload)
    })
  }
}
