import { Injectable } from '@nestjs/common'
import { hash, compare } from 'bcrypt'
@Injectable()
export class HashingService {
  private saltRounds: number = 10
  hashPassword(password: string): Promise<string> {
    if (!password) throw new Error('Password is required')

    return hash(password, this.saltRounds)
  }
  comparePassword(password: string, hash: string): Promise<boolean> {
    return compare(password, hash)
  }
}
