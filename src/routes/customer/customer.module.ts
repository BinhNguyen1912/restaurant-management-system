import { Module } from '@nestjs/common'
import { CustomerController } from '@/routes/customer/customer.controller'
import { CustomerService } from '@/routes/customer/customer.service'
import { AccessLogInterceptor } from '@/interceptor/access-log.interceptor'

/**
 * `CustomerRepo` nằm trong `SharedModule` (global) vì luồng đặt bàn/đơn hàng cũng phải gắn hồ sơ
 * khách trong chính transaction của nó.
 */
@Module({
  controllers: [CustomerController],
  providers: [CustomerService, AccessLogInterceptor],
})
export class CustomerModule {}
