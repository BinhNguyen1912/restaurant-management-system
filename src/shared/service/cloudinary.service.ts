import { UploadApiErrorResponse, UploadApiResponse, v2 } from 'cloudinary'
import toStream from 'buffer-to-stream'

export class CloudinaryService {
  uploadFile(file: Express.Multer.File): Promise<UploadApiResponse | UploadApiErrorResponse> {
    return new Promise((resolve, reject) => {
      const upload = v2.uploader.upload_stream(
        {
          folder: 'Ecommers',
          public_id: file.filename,
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
