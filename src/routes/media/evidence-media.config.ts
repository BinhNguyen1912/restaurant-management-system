import { UnprocessableEntityException } from '@nestjs/common'
import { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface'
import { memoryStorage } from 'multer'

/**
 * Chứng từ tiền mặt (hoá đơn, biên nhận): ảnh HOẶC video.
 * - Ảnh: 5MB (ảnh chụp hoá đơn từ điện thoại thường 2–4MB)
 * - Video: 30MB cho clip ngắn quay biên nhận
 */
const IMAGE_MAX_BYTES = 5 * 1024 * 1024
const VIDEO_MAX_BYTES = 30 * 1024 * 1024

const IMAGE_MIME = /^image\/(jpg|jpeg|png|webp|heic)$/
const VIDEO_MIME = /^video\/(mp4|quicktime|webm)$/

export const CashEvidenceMulterOptions: MulterOptions = {
  storage: memoryStorage(),
  limits: { fileSize: VIDEO_MAX_BYTES },
  fileFilter: (_req, file, callback) => {
    const isImage = IMAGE_MIME.test(file.mimetype)
    const isVideo = VIDEO_MIME.test(file.mimetype)
    if (!isImage && !isVideo) {
      return callback(
        new UnprocessableEntityException({
          message: 'Error.InvalidMimeType',
          path: 'file',
        }),
        false,
      )
    }
    callback(null, true)
  },
}

/** Kiểm lại trần dung lượng theo từng loại file (fileFilter không biết size) */
export const assertEvidenceSize = (files: Express.Multer.File[]): void => {
  for (const file of files) {
    const isVideo = file.mimetype.startsWith('video/')
    const max = isVideo ? VIDEO_MAX_BYTES : IMAGE_MAX_BYTES
    if (file.size > max) {
      throw new UnprocessableEntityException(
        `File "${file.originalname}" quá lớn (tối đa ${Math.round(max / 1024 / 1024)}MB cho ${isVideo ? 'video' : 'ảnh'})`,
      )
    }
  }
}
