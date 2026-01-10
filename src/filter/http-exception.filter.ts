import { ArgumentsHost, Catch, HttpException, Logger } from '@nestjs/common'
import { BaseExceptionFilter } from '@nestjs/core'
import { ZodSerializationException } from 'nestjs-zod'
import { ZodError } from 'zod'
//Catch — decorator để đánh dấu class là một Exception Filter và chỉ định loại exception mà filter đó sẽ bắt.
@Catch(HttpException)
//Base class = lớp cơ sở, tức là lớp cha (superclass) mà các lớp khác kế thừa (extends).
export class HttpExceptionFilter extends BaseExceptionFilter {
  //BaseExceptionFilter — lớp base của Nest cung cấp hành vi xử lý exception mặc định; khi override, bạn có thể gọi super.catch(...) để dùng hành vi mặc định.
  private readonly logger = new Logger(HttpExceptionFilter.name)
  catch(exception: HttpException, host: ArgumentsHost) {
    //ArgumentsHost Là object “bao bọc” context của request
    //Dùng để truy xuất Request / Response trong context HTTP (cũng có thể switch sang WebSocket hoặc RPC)
    if (exception instanceof ZodSerializationException) {
      const zodError = exception.getZodError()
      if (zodError instanceof ZodError) {
        this.logger.error(`ZodSerializationException: ${zodError.message}`)
      }
    }
    super.catch(exception, host)
  }
}
/**
 * BaseExceptionFilter là một lớp cơ sở do NestJS cung cấp sẵn.

Nó đã có sẵn logic mặc định để:

Lấy status code từ exception.getStatus().

Lấy payload từ exception.getResponse().

Gửi response JSON về cho client qua response.status(...).json(...).

Log lỗi trong môi trường dev.
 */
