# 💬 Guest Messaging Module

Module cho phép Guest gửi tin nhắn đến Admin qua WebSocket và HTTP API.

## 📂 Cấu trúc

```
messages/
├── message.model.ts      # Schema validation (Zod)
├── message.dtos.ts      # DTO classes
├── message.repo.ts      # Database operations
├── message.service.ts   # Business logic
├── message.controller.ts # REST API endpoints
├── message.module.ts    # Module config
└── message.error.ts     # Error definitions
```

## 🚀 Sử dụng

### 1. Guest gửi tin nhắn qua WebSocket

```javascript
// Frontend
socket.emit('guest-send-message', {
  guestId: 123,
  content: 'Xin chào, tôi cần hỗ trợ',
  tableName: 'Table 1', // optional
})

// Lắng nghe confirm
socket.on('message-sent', (data) => {
  console.log('Message sent:', data)
})
```

### 2. Admin nhận tin nhắn

```javascript
// Frontend - Admin
socket.emit('join-manager-room')

socket.on('guest-message-to-admin', (data) => {
  // data = { message, guestName, tableName, guestId, timestamp }
  console.log('New message:', data)
})
```

### 3. API Endpoints

**POST** `/messages/guest`

```json
{
  "content": "Tôi cần hỗ trợ",
  "guestId": 123
}
```

- Auth: Guest token

**GET** `/messages/admin/unread`

- Auth: Admin token
- Return: Danh sách tin nhắn chưa đọc từ guest

**POST** `/messages/mark-read`

```json
{
  "messageIds": [1, 2, 3]
}
```

- Đánh dấu đã đọc

## 🔌 WebSocket Events

### Client → Server

- `guest-send-message`: Guest gửi tin
- `join-manager-room`: Admin join phòng

### Server → Client

- `guest-message-to-admin`: Event đến admin khi có tin mới
- `message-sent`: Xác nhận guest đã gửi tin
- `message-error`: Lỗi khi gửi tin

## 🗄️ Database

Schema trong `prisma/schema.prisma`:

```prisma
model Message {
  id          Int       @id @default(autoincrement())
  fromUserId  Int?     // User-to-User
  toUserId    Int?     // User-to-User
  fromGuestId Int?     // Guest-to-Admin
  content     String
  readAt      DateTime?
  createdAt   DateTime @default(now())

  fromGuest   Guest?   @relation(...)
  fromUser    User?    @relation(...)
  toUser      User?     @relation(...)
}
```

## ⚙️ Module Integration

Module đã được import trong `src/app.module.ts`:

```typescript
imports: [...MessageModule]
```

WebSocket đã được cập nhật trong `src/webSockets/app.gateway.ts`
