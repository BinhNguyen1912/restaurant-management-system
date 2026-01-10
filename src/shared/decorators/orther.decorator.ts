import { SetMetadata } from '@nestjs/common'

export const responeMessage = 'Respone_Message'
export const MessageResData = (message: string) => SetMetadata(responeMessage, message)
