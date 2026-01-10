import { UnprocessableEntityException } from '@nestjs/common'
import { Prisma, PrismaClient } from '@prisma/client'
import { randomInt } from 'crypto'
import z from 'zod'
import { v4 as uuidv4 } from 'uuid'
import path from 'path'
import { dayNames, OrderByType, prefixToOrderStatus } from '@/shared/constants/others.constant'
import { RepeatModeType } from '@/shared/constants/reminder.constant'
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library'
import { TypeToOrderStatus, TypeToOrderStatusType } from './constants/order.constant'
const prisma = new PrismaClient()
const isUniqueConstraintPrisma = (error: any): error is PrismaClientKnownRequestError => {
  return error instanceof PrismaClientKnownRequestError && error.code === 'P2002'
}
const isNotFoundPrisma = (error: any): error is PrismaClientKnownRequestError => {
  return error instanceof PrismaClientKnownRequestError && error.code === 'P2025'
}
export const isForeignKeyPrisma = (error: any): error is PrismaClientKnownRequestError => {
  return error instanceof PrismaClientKnownRequestError && error.code === 'P2003'
}

export const generateCode = () => {
  return String(randomInt(100000, 999999))
}

export const randomId = () => uuidv4().replace(/-/g, '')

export const generateFileName = (fileName: string): string => {
  const ext = path.extname(fileName)
  return `${uuidv4()}${ext}`
}

export const generrateCancelPaymentJobName = (paymentId: number): string => {
  return `cancel-paymentId-${paymentId}`
}
export const generateForVnp_TxnRef = ({ type, userId }: { type: TypeToOrderStatusType; userId: number }) => {
  switch (type) {
    case TypeToOrderStatus.AT_TABLE:
      return `${prefixToOrderStatus.AT_TABLE}_${userId}`
    case TypeToOrderStatus.RESERVATION:
      return `${prefixToOrderStatus.RESERVATION}_${userId}`
    default:
      return `${prefixToOrderStatus.ONLINE}_${userId}`
  }
}
export const getDaysOfWeekFromNumbers = (days: number[]): string[] => {
  return days.map((day) => dayNames[day])
}
export const getNumbersFromDaysOfWeek = (days: string[]): number[] => {
  return days.map((day) => dayNames.indexOf(day))
}

export const shouldTriggerToday = (reminder: any, currentDate: Date = new Date()): boolean => {
  const currentDay = currentDate.getDay() // 0-6 (Sunday-Saturday)

  switch (reminder.repeat_mode) {
    case RepeatModeType.DAILY:
      return true
    case RepeatModeType.WEEKLY:
      return reminder.repeat_days.includes(currentDay)
    case RepeatModeType.MONTHLY:
      return currentDate.getDate() === 1 // Trigger on 1st of every month
    case RepeatModeType.YEARLY:
      return currentDate.getDate() === 1 && currentDate.getMonth() === 0 // Jan 1st
    case RepeatModeType.ONCE:
      const reminderDate = new Date(reminder.createdAt)
      return currentDate.toDateString() === reminderDate.toDateString()
    case 'NONE':
    default:
      return false
  }
}

export const calculateNextSchedule = (reminder: any, fromDate: Date = new Date()): Date | null => {
  const nextDate = new Date(fromDate)

  switch (reminder.repeat_mode) {
    case RepeatModeType.DAILY:
      nextDate.setDate(nextDate.getDate() + 1)
      break
    case RepeatModeType.WEEKLY:
      const currentDay = nextDate.getDay()
      const nextDay = reminder.repeat_days.find((day) => day > currentDay) || reminder.repeat_days[0]
      const daysToAdd = nextDay > currentDay ? nextDay - currentDay : 7 - currentDay + nextDay
      nextDate.setDate(nextDate.getDate() + daysToAdd)
      break
    case RepeatModeType.MONTHLY:
      nextDate.setMonth(nextDate.getMonth() + 1)
      nextDate.setDate(1)
      break
    case RepeatModeType.YEARLY:
      nextDate.setFullYear(nextDate.getFullYear() + 1)
      nextDate.setMonth(0)
      nextDate.setDate(1)
      break
    case RepeatModeType.ONCE:
    case RepeatModeType.NONE:
    default:
      return null
  }

  return nextDate
}

export const checkHasNextSchedule = (reminder: any): boolean => {
  return ![RepeatModeType.NONE, RepeatModeType.ONCE].includes(reminder.repeat_mode)
}

export const getNextSchedule = (reminder: any, fromDate: Date = new Date()): Date | null => {
  if (!checkHasNextSchedule(reminder)) {
    return null
  }
  return calculateNextSchedule(reminder, fromDate)
}
export { isUniqueConstraintPrisma, isNotFoundPrisma }
