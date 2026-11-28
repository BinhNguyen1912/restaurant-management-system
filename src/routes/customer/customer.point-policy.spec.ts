import {
  checkRedeemable,
  earnedPointsForOrder,
  maxRedeemablePoints,
  MIN_REDEEM_POINTS,
  pointsToVnd,
  redeemableBalance,
  totalEarnedPoints,
} from '@/routes/customer/customer.point-policy'

describe('earnedPointsForOrder', () => {
  it('làm tròn XUỐNG theo từng đơn, không phải trên tổng', () => {
    // 39k + 39k = 78k: nếu tính trên tổng thì được 3 điểm...
    expect(totalEarnedPoints(['39000', '39000'])).toBe(2)
    // ...nhưng từng đơn 39k chỉ được 1 điểm, nên tổng đúng là 2.
    expect(earnedPointsForOrder('39999')).toBe(1)
  })

  it('đúng mốc chia hết và dưới mốc', () => {
    expect(earnedPointsForOrder('20000')).toBe(1)
    expect(earnedPointsForOrder('19999')).toBe(0)
    expect(earnedPointsForOrder('250000')).toBe(12)
  })

  it('đơn 0 đồng hoặc âm không sinh điểm', () => {
    expect(earnedPointsForOrder(0)).toBe(0)
    expect(earnedPointsForOrder('-50000')).toBe(0)
  })

  it('nhận Decimal như nhận số, không sai số ở mốc 20.000', () => {
    // 20000.0000001 do làm tròn float sẽ thành 1 điểm; Decimal thì vẫn là 1 (>= mốc).
    expect(earnedPointsForOrder('60000')).toBe(3)
    expect(earnedPointsForOrder('60000.00')).toBe(3)
  })
})

describe('pointsToVnd', () => {
  it('1 điểm = 1.000đ', () => {
    expect(pointsToVnd(1)).toBe(1_000)
    expect(pointsToVnd(120)).toBe(120_000)
  })

  it('không sinh giá trị âm', () => {
    expect(pointsToVnd(-5)).toBe(0)
  })
})

describe('redeemableBalance', () => {
  it('trừ đã dùng khỏi tích luỹ', () => {
    expect(redeemableBalance(120, 30)).toBe(90)
  })

  it('không âm khi dữ liệu lệch (đã dùng nhiều hơn tích luỹ)', () => {
    expect(redeemableBalance(10, 30)).toBe(0)
  })
})

describe('checkRedeemable', () => {
  it('đổi hợp lệ trả về số tiền voucher', () => {
    expect(checkRedeemable({ balance: 100, points: 10 })).toEqual({ ok: true, valueVnd: 10_000 })
    expect(checkRedeemable({ balance: 100, points: 45 })).toEqual({ ok: true, valueVnd: 45_000 })
  })

  it('chặn dưới mức tối thiểu', () => {
    const result = checkRedeemable({ balance: 100, points: MIN_REDEEM_POINTS - 1 })
    expect(result).toEqual({ ok: false, message: 'Error.MinRedeemPoints', params: { min: MIN_REDEEM_POINTS } })
  })

  it('chặn khi vượt số dư', () => {
    expect(checkRedeemable({ balance: 20, points: 21 })).toEqual({
      ok: false,
      message: 'Error.NotEnoughPoints',
      params: { balance: 20, points: 21 },
    })
  })

  it('chặn số điểm không nguyên hoặc <= 0', () => {
    expect(checkRedeemable({ balance: 100, points: 10.5 })).toEqual({ ok: false, message: 'Error.InvalidPoints' })
    expect(checkRedeemable({ balance: 100, points: 0 })).toEqual({ ok: false, message: 'Error.InvalidPoints' })
    expect(checkRedeemable({ balance: 100, points: -10 })).toEqual({ ok: false, message: 'Error.InvalidPoints' })
  })

  it('đổi đúng bằng số dư thì được', () => {
    expect(checkRedeemable({ balance: 25, points: 25 })).toEqual({ ok: true, valueVnd: 25_000 })
  })
})

describe('maxRedeemablePoints', () => {
  it('trần = số tiền còn phải trả chia giá trị một điểm, làm tròn xuống', () => {
    expect(maxRedeemablePoints(200_000)).toBe(200)
    expect(maxRedeemablePoints('199999')).toBe(199)
  })

  it('hoá đơn đã giảm hết (payable <= 0) thì không đổi được điểm nào', () => {
    expect(maxRedeemablePoints(0)).toBe(0)
    expect(maxRedeemablePoints(-50_000)).toBe(0)
  })
})
