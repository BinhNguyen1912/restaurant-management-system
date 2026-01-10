import { Controller, Post, Body, Get, Param, ParseIntPipe, UseGuards } from '@nestjs/common'
import { MessageService } from './message.service'
import { SendGuestMessageDTO, MarkAsReadDTO, SendAdminToGuestMessageDTO } from './message.dtos'
import { ActiveUser } from '@/shared/decorators/active-user.decorator'
import { AccessTokenGuard } from '@/shared/guard/access-token.guard'

@Controller('messages')
export class MessageController {
  constructor(private readonly messageService: MessageService) {}

  @Post('guest')
  @UseGuards(AccessTokenGuard)
  async sendGuestMessage(@Body() body: SendGuestMessageDTO, @ActiveUser('userId') guestId: number) {
    return await this.messageService.sendGuestMessage({ ...body, fromGuestId: guestId })
  }

  @Get('guest-conversation')
  @UseGuards(AccessTokenGuard)
  async getGuestConversation(@ActiveUser('userId') guestId: number) {
    const adminId = 1
    return await this.messageService.getConversationWithGuest(guestId, adminId)
  }

  // @Post('user')
  // @UseGuards(AccessTokenGuard)
  // async sendUserMessage(@Body() body: SendUserMessageDTO, @ActiveUser('userId') userId: number) {
  //   return await this.messageService.sendUserMessage({ ...body, fromUserId: userId })
  // }

  @Get('guest/:guestId')
  async getGuestMessages(@Param('guestId', ParseIntPipe) guestId: number) {
    return await this.messageService.getGuestMessages(guestId)
  }

  @Get('admin/unread')
  async getUnreadMessagesForAdmin() {
    return await this.messageService.getUnreadMessagesForAdmin()
  }

  @Post('mark-read')
  async markAsRead(@Body() body: MarkAsReadDTO) {
    return await this.messageService.markAsRead(body)
  }

  @Get('conversation/:guestId')
  async getConversationWithGuest(
    @Param('guestId', ParseIntPipe) guestId: number,
    @ActiveUser('userId') userId: number,
  ) {
    return await this.messageService.getConversationWithGuest(guestId, userId)
  }

  @Get('received')
  async getMessagesReceivedByUser(@ActiveUser('userId') userId: number) {
    return await this.messageService.getMessagesReceivedByUser(userId)
  }

  @Get('active-guests')
  @UseGuards(AccessTokenGuard)
  async getActiveGuests() {
    return await this.messageService.getActiveGuests()
  }

  @Get('guests-with-messages')
  @UseGuards(AccessTokenGuard)
  async getGuestsWithMessages(@ActiveUser('userId') userId: number) {
    return await this.messageService.getGuestsWithMessages(userId)
  }

  @Post('admin-to-guest/:guestId')
  @UseGuards(AccessTokenGuard)
  async sendAdminToGuestMessage(
    @Param('guestId', ParseIntPipe) guestId: number,
    @Body() body: SendAdminToGuestMessageDTO,
    @ActiveUser('userId') adminId: number,
  ) {
    return await this.messageService.sendAdminToGuestMessage({ ...body, guestId, fromUserId: adminId })
  }
}
