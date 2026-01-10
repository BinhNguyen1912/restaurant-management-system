import { UnprocessableEntityException } from '@nestjs/common'
import { createZodValidationPipe, ZodValidationPipe } from 'nestjs-zod'
import { ZodError } from 'zod'
const CustomZodValidationPipe: typeof ZodValidationPipe = createZodValidationPipe({
  createValidationException: (error: ZodError) => {
    const zodError = error as ZodError
    return new UnprocessableEntityException(
      zodError.issues.map((validationError) => {
        return {
          ...validationError,
          path: validationError.path.join('.'),
        }
      }),
    )
  },
})
export default CustomZodValidationPipe
