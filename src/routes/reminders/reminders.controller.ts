import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common'
import { RemindersService } from './reminders.service'
import { CreateReminderDTO, UpdateReminderDTO } from '@/routes/reminders/reminders.dtos'
import { ActiveUser } from '@/shared/decorators/active-user.decorator'
import { ReminderNotFoundException, ReminderLogNotFoundException } from '@/routes/reminders/reminders.error'
import { ParseIntPipe } from '@nestjs/common'

@Controller('reminders')
export class RemindersController {
  constructor(private readonly remindersService: RemindersService) {}

  @Post()
  async createReminder(@Body() body: CreateReminderDTO, @ActiveUser('userId') userId: number) {
    return await this.remindersService.create({ data: body, createdById: userId })
  }

  @Get()
  async getAllActiveReminders() {
    return await this.remindersService.findAllActive()
  }

  @Get('role/:roleId')
  async getRemindersByRole(@Param('roleId', ParseIntPipe) roleId: number) {
    return await this.remindersService.findByRole(roleId)
  }

  @Get(':id/logs')
  async getReminderLogs(@Param('id', ParseIntPipe) id: number) {
    // Kiểm tra reminder tồn tại
    const existingReminder = await this.remindersService.findById(id)
    if (!existingReminder) {
      throw ReminderNotFoundException
    }

    return await this.remindersService.getReminderLogs(id)
  }

  /**
   * POST /reminders/:id/logs/:logId/complete
   * Đánh dấu reminder log đã hoàn thành
   */
  @Post(':id/logs/:logId/complete')
  async completeReminderLog(
    @Param('id', ParseIntPipe) id: number,
    @Param('logId', ParseIntPipe) logId: number,
    @ActiveUser('userId') userId: number,
  ) {
    const existingReminder = await this.remindersService.findById(id)
    if (!existingReminder) {
      throw ReminderNotFoundException
    }

    try {
      return await this.remindersService.completeReminderLog(logId, userId)
    } catch (error) {
      throw ReminderLogNotFoundException
    }
  }

  @Get(':id')
  async getReminderById(@Param('id', ParseIntPipe) id: number) {
    const reminder = await this.remindersService.findById(id)
    if (!reminder) {
      throw ReminderNotFoundException
    }
    return reminder
  }

  @Patch(':id')
  async updateReminder(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateReminderDTO,
    @ActiveUser('userId') userId: number,
  ) {
    const existingReminder = await this.remindersService.findById(id)
    if (!existingReminder) {
      throw ReminderNotFoundException
    }

    return await this.remindersService.update({
      reminderId: id,
      updateData: body,
      updatedById: userId,
    })
  }

  @Delete(':id')
  async deleteReminder(@Param('id', ParseIntPipe) id: number, @ActiveUser('userId') userId: number) {
    // Kiểm tra reminder tồn tại trước khi delete
    const existingReminder = await this.remindersService.findById(id)
    if (!existingReminder) {
      throw ReminderNotFoundException
    }

    return await this.remindersService.softDelete(id, userId)
  }
}
