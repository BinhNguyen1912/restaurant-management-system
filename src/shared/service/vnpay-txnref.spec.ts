import { VnPayService } from './vnpay.service'

/**
 * Regression (audit trước prod): `createUrlVnpay` từng tự ghép thêm `_<timestamp>` vào mã nhận
 * được, nên `vnp_TxnRef` gửi VNPay KHÁC `PaymentIntent.reference` đã lưu. Webhook tra intent
 * theo `vnp_TxnRef` ⇒ luôn `null` ⇒ mất chốt số tiền + danh sách đơn, rơi về đối chiếu
 * `Σ grandTotal` (đơn đặt cọc bị coi là `amount_mismatch` dù khách đã bị trừ tiền).
 */
describe('createUrlVnpay — mã giao dịch phải trùng PaymentIntent.reference', () => {
  const build = () => new VnPayService({} as any, {} as any, {} as any, {} as any, {} as any, {} as any)

  const paramsOf = (url: string) => new URLSearchParams(url.split('?')[1] ?? '')

  it('giữ nguyên reference được truyền vào, không ghép thêm timestamp', async () => {
    const service = build()
    const reference = 'AT_TABLE_7_1764000000000123'

    const url = await service.createUrlVnpay({
      amount: 250_000,
      req: { headers: {}, connection: {}, socket: {} } as any,
      processedOrderId: reference,
    })

    const params = paramsOf(url)
    expect(params.get('vnp_TxnRef')).toBe(reference)
    // VNPay nhận số tiền nhân 100, dạng chuỗi không thập phân
    expect(params.get('vnp_Amount')).toBe('25000000')
  })

  it('mã đặt cọc cũng giữ nguyên — đây là mã webhook dùng để tìm intent', async () => {
    const service = build()
    const reference = 'RESERVATION_12_1764000000000999'

    const url = await service.createUrlVnpay({
      amount: 300_000,
      req: { headers: {}, connection: {}, socket: {} } as any,
      processedOrderId: reference,
    })

    expect(paramsOf(url).get('vnp_TxnRef')).toBe(reference)
  })
})
