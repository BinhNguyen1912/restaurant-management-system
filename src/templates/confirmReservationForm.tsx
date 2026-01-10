import { Body, Container, Head, Heading, Html, Img, Link, Section, Text, Column, Row } from '@react-email/components'
import * as React from 'react'

interface ReservationConfirmationEmailProps {
  reservation: {
    id: number
    customerName: string
    customerPhone: string
    guestCount: number
    reservationTime: Date
    tableNodeId: number
    status: 'PENDING' | 'CONFIRMED' | 'CHECKED_IN' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW' | 'DEPOSITED'
    hasPreOrder: boolean | null
    note: string | null
  }
  restaurantName?: string
  restaurantAddress?: string
  restaurantPhone?: string
}

const ReservationConfirmationEmail: React.FC<ReservationConfirmationEmailProps> = ({
  reservation,
  restaurantName = 'Nhà Hàng ABC',
  restaurantAddress = '123 Đường ABC, Quận 1, TP.HCM',
  restaurantPhone = '028 1234 5678',
}) => {
  const formatDate = (date: Date) => {
    return new Date(date).toLocaleString('vi-VN', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const getStatusText = (status: string) => {
    const statusMap: { [key: string]: string } = {
      PENDING: 'Đang chờ xác nhận',
      CONFIRMED: 'Đã xác nhận',
      DEPOSITED: 'Đã đặt cọc',
      CHECKED_IN: 'Đã check-in',
      COMPLETED: 'Đã hoàn thành',
      CANCELLED: 'Đã hủy',
      NO_SHOW: 'Không đến',
    }
    return statusMap[status] || status
  }

  return (
    <Html>
      <Head />
      <Body style={main}>
        <Container style={container}>
          {/* Header */}
          <Img
            src={'https://i.pinimg.com/736x/5a/f5/a4/5af5a423a621b084739390868f2b8060.jpg'}
            style={logo}
            alt={restaurantName}
          />
          <Heading style={header}>ĐẶT BÀN THÀNH CÔNG!</Heading>

          {/* Status Badge */}
          <Section style={statusContainer}>
            <Text style={statusText}>
              Trạng thái: <strong>{getStatusText(reservation.status)}</strong>
            </Text>
          </Section>

          {/* Reservation Details */}
          <Section style={detailsContainer}>
            <Text style={sectionTitle}>Thông tin đặt bàn</Text>

            <Row>
              <Column style={detailColumn}>
                <Text style={detailLabel}>Mã đặt bàn</Text>
                <Text style={detailValue}>#{reservation.id.toString().padStart(6, '0')}</Text>
              </Column>
              <Column style={detailColumn}>
                <Text style={detailLabel}>Số khách</Text>
                <Text style={detailValue}>{reservation.guestCount} người</Text>
              </Column>
            </Row>

            <Row>
              <Column style={detailColumn}>
                <Text style={detailLabel}>Tên khách hàng</Text>
                <Text style={detailValue}>{reservation.customerName}</Text>
              </Column>
              <Column style={detailColumn}>
                <Text style={detailLabel}>Số điện thoại</Text>
                <Text style={detailValue}>{reservation.customerPhone}</Text>
              </Column>
            </Row>

            <Row>
              <Column style={fullColumn}>
                <Text style={detailLabel}>Thời gian đặt bàn</Text>
                <Text style={detailValue}>{formatDate(reservation.reservationTime)}</Text>
              </Column>
            </Row>

            <Row>
              <Column style={fullColumn}>
                <Text style={detailLabel}>Bàn đã đặt</Text>
                <Text style={detailValue}>Bàn số {reservation.tableNodeId}</Text>
              </Column>
            </Row>

            {reservation.hasPreOrder && (
              <Row>
                <Column style={fullColumn}>
                  <Text style={detailLabel}>Đặt món trước</Text>
                  <Text style={detailValue}>✅ Có</Text>
                </Column>
              </Row>
            )}

            {reservation.note && (
              <Row>
                <Column style={fullColumn}>
                  <Text style={detailLabel}>Ghi chú</Text>
                  <Text style={detailValue}>{reservation.note}</Text>
                </Column>
              </Row>
            )}
          </Section>

          {/* Restaurant Info */}
          <Section style={restaurantContainer}>
            <Text style={sectionTitle}>Thông tin nhà hàng</Text>
            <Text style={restaurantInfo}>{restaurantName}</Text>
            <Text style={restaurantInfo}>{restaurantAddress}</Text>
            <Text style={restaurantInfo}>📞 {restaurantPhone}</Text>
          </Section>

          {/* Instructions */}
          <Section style={instructionsContainer}>
            <Text style={paragraph}>
              <strong>Lưu ý quan trọng:</strong>
            </Text>
            <Text style={listItem}>• Vui lòng đến đúng giờ đã đặt</Text>
            <Text style={listItem}>• Thông báo cho nhà hàng nếu có thay đổi</Text>
            <Text style={listItem}>• Mang theo mã đặt bàn này khi đến nhà hàng</Text>
          </Section>

          {/* Contact */}
          <Text style={contactText}>
            Cần hỗ trợ? Liên hệ{' '}
            <Link href={`tel:${restaurantPhone}`} style={link}>
              {restaurantPhone}
            </Link>
          </Text>
        </Container>

        <Text style={footer}>Cảm ơn bạn đã lựa chọn {restaurantName}!</Text>
      </Body>
    </Html>
  )
}

ReservationConfirmationEmail.PreviewProps = {
  reservation: {
    id: 123456,
    customerName: 'Nguyễn Văn A',
    customerPhone: '0901234567',
    guestCount: 4,
    reservationTime: new Date('2024-11-25T19:00:00'),
    tableNodeId: 5,
    status: 'CONFIRMED',
    hasPreOrder: true,
    note: 'Yêu cầu chỗ ngồi gần cửa sổ',
  },
  restaurantName: 'Nhà Hàng ABC',
  restaurantAddress: '123 Đường ABC, Quận 1, TP.HCM',
  restaurantPhone: '028 1234 5678',
} as ReservationConfirmationEmailProps

export default ReservationConfirmationEmail

const main = {
  backgroundColor: '#f6f9fc',
  fontFamily: 'HelveticaNeue,Helvetica,Arial,sans-serif',
  padding: '20px 0',
}

const container = {
  backgroundColor: '#ffffff',
  border: '1px solid #e6e6e6',
  borderRadius: '10px',
  boxShadow: '0 5px 15px rgba(0,0,0,0.1)',
  margin: '0 auto',
  maxWidth: '500px',
  padding: '40px 30px',
}

const logo = {
  margin: '0 auto 20px',
  borderRadius: '100%',
  width: '80px',
  height: '80px',
  display: 'block',
}

const header = {
  color: '#2d3748',
  fontSize: '24px',
  fontWeight: 'bold',
  textAlign: 'center' as const,
  margin: '0 0 20px 0',
}

const statusContainer = {
  backgroundColor: '#e6fffa',
  border: '1px solid #81e6d9',
  borderRadius: '8px',
  padding: '15px',
  margin: '20px 0',
  textAlign: 'center' as const,
}

const statusText = {
  color: '#234e52',
  fontSize: '16px',
  margin: '0',
}

const detailsContainer = {
  margin: '25px 0',
}

const sectionTitle = {
  color: '#2d3748',
  fontSize: '18px',
  fontWeight: 'bold',
  margin: '0 0 15px 0',
  borderBottom: '2px solid #e2e8f0',
  paddingBottom: '8px',
}

const detailColumn = {
  width: '48%',
  display: 'inline-block',
  verticalAlign: 'top' as const,
}

const fullColumn = {
  width: '100%',
  display: 'block',
}

const detailLabel = {
  color: '#718096',
  fontSize: '14px',
  fontWeight: '600',
  margin: '10px 0 5px 0',
}

const detailValue = {
  color: '#2d3748',
  fontSize: '16px',
  margin: '0 0 15px 0',
}

const restaurantContainer = {
  backgroundColor: '#f7fafc',
  border: '1px solid #e2e8f0',
  borderRadius: '8px',
  padding: '20px',
  margin: '20px 0',
}

const restaurantInfo = {
  color: '#4a5568',
  fontSize: '14px',
  margin: '5px 0',
  textAlign: 'center' as const,
}

const instructionsContainer = {
  backgroundColor: '#fffaf0',
  border: '1px solid #fbd38d',
  borderRadius: '8px',
  padding: '20px',
  margin: '20px 0',
}

const paragraph = {
  color: '#4a5568',
  fontSize: '14px',
  lineHeight: '1.5',
  margin: '10px 0',
}

const listItem = {
  color: '#4a5568',
  fontSize: '14px',
  lineHeight: '1.5',
  margin: '5px 0 5px 15px',
}

const contactText = {
  color: '#4a5568',
  fontSize: '14px',
  textAlign: 'center' as const,
  margin: '20px 0 0 0',
}

const link = {
  color: '#3182ce',
  textDecoration: 'underline',
}

const footer = {
  color: '#718096',
  fontSize: '12px',
  textAlign: 'center' as const,
  margin: '20px 0 0 0',
}
