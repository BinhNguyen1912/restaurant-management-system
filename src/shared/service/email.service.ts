import envConfig from '@/shared/config'
import { Resend } from 'resend'
import * as React from 'react'
import OTPCode from '@/templates/otp'
import { Injectable } from '@nestjs/common'
import { ReservationType } from '../models/shared-reservation.model'
import ReservationConfirmationEmail from '@/templates/confirmReservationForm'
@Injectable()
export class EmailService {
  private readonly apiKey: string = envConfig.RESEND_API_KEY
  private resend: Resend
  constructor() {
    this.resend = new Resend(this.apiKey)
  }
  async sendEmail(payload: { email: string; code: string }) {
    const object = 'OTP CODE'
    return await this.resend.emails.send({
      from: 'Ecommerce <onboarding@resend.dev>',
      to: [`${payload.email}`],
      subject: object,
      react: React.createElement(OTPCode, { code: payload.code, title: object }),
    })
  }
  async sendConfirmReservation(payload: ReservationType, email: string) {
    const object = 'Confirm Your Reservation'
    return await this.resend.emails.send({
      from: 'Ecommerce <onboarding@resend.dev>',
      to: [`binhnguyen.hoctap1912@gmail.com`],
      subject: object,
      react: React.createElement(ReservationConfirmationEmail, payload),
    })
  }
}
