import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Res,
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common'
import { MediaService } from './media.service'
import { FilesInterceptor } from '@nestjs/platform-express'
import { ZodSerializerDto } from 'nestjs-zod'
import { MediaResDTO } from './media.dto'
import { assertEvidenceSize, CashEvidenceMulterOptions } from '@/routes/media/evidence-media.config'

@Controller('media')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post('image/upload')
  @ZodSerializerDto(MediaResDTO)
  @UseInterceptors(FilesInterceptor('files', 10))
  async uploadFile(@UploadedFiles() files: Express.Multer.File[]) {
    const resuft = await this.mediaService.uploadFiles(files)
    return resuft
  }

  /** Chứng từ thu/chi tiền mặt: ảnh hoặc video, tối đa 5 file / lần */
  @Post('upload')
  @ZodSerializerDto(MediaResDTO)
  @UseInterceptors(FilesInterceptor('files', 5, CashEvidenceMulterOptions))
  async uploadEvidence(@UploadedFiles() files: Express.Multer.File[]) {
    assertEvidenceSize(files)
    return await this.mediaService.uploadEvidenceFiles(files)
  }
}
