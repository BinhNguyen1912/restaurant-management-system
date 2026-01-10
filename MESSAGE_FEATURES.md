# 📨 Message Features - Tổng quan

## ✅ Đã hoàn thành:

### 1. **Lấy danh sách Guest đang hoạt động**

**Endpoint:** `GET /messages/active-guests`

```bash
GET /messages/active-guests
Authorization: Bearer {admin_token}
```

**Response:**

```json
[
  {
    "id": 34,
    "name": "Lana Del",
    "tableNodeId": 16,
    "createdAt": "2025-10-27T04:44:17.117Z",
    "updatedAt": "2025-10-27T04:44:17.149Z",
    "tableNode": {
      "name": "Lầu 2 - Bàn 16",
      "seats": 8,
      ...
    },
    "unreadCount": 2,
    "lastMessage": {
      "content": "Món ăn xong chưa shop",
      "createdAt": "2025-10-27T07:03:43.292Z"
    }
  }
]
```

**Logic:**

- Lấy tất cả socket của guest (có socket active = đang online)
- Group by guestId (mỗi guest chỉ 1 lần)
- Đếm `unreadCount` - tin nhắn chưa đọc
- Lấy `lastMessage` - tin nhắn mới nhất

---

### 2. **Lấy danh sách Guest có tin nhắn với User**

**Endpoint:** `GET /messages/guests-with-messages`

```bash
GET /messages/guests-with-messages
Authorization: Bearer {admin_token}
```

**Response:** Tương tự như trên, nhưng chỉ lấy guest có tin nhắn với user.

**Logic:**

- Tìm tất cả guest có tin nhắn với user này
- Sắp xếp theo tin nhắn mới nhất
- Bao gồm `unreadCount` và `lastMessage`

---

### 3. **Lấy cuộc hội thoại với Guest**

**Endpoint:** `GET /messages/conversation/:guestId`

```bash
GET /messages/conversation/34
Authorization: Bearer {admin_token}
```

**Response:**

```json
[
  {
    "id": 17,
    "fromUserId": null,
    "toUserId": 1,
    "content": "Món ăn xong chưa shop",
    "readAt": null,
    "updatedAt": "2025-10-27T07:03:43.292Z",
    "createdAt": "2025-10-27T07:03:43.292Z",
    "fromGuestId": 34,
    "fromGuest": {
      "id": 34,
      "name": "Lana Del",
      ...
      "tableNode": {
        "name": "Lầu 2 - Bàn 16",
        ...
      }
    },
    "fromUser": null,
    "toUser": null
  },
  {
    "id": 18,
    "fromUserId": 1,
    "toUserId": null,
    "content": "Sắp xong rồi bạn",
    "fromGuest": null,
    "fromUser": { "id": 1, "name": "Admin", ... },
    "toUser": null
  }
]
```

---

## 🎯 Flow sử dụng:

### Bước 1: Admin lấy danh sách guest

```javascript
// GET /messages/guests-with-messages
const guests = await fetch('/messages/guests-with-messages', {
  headers: { Authorization: `Bearer ${adminToken}` },
})
// Result: [{ id: 34, name: "Lana Del", unreadCount: 2, lastMessage, ... }]
```

### Bước 2: Admin click vào guest

```javascript
const selectedGuest = { id: 34, name: 'Lana Del' }
```

### Bước 3: Lấy cuộc hội thoại với guest đó

```javascript
// GET /messages/conversation/34
const messages = await fetch('/messages/conversation/34', {
  headers: { Authorization: `Bearer ${adminToken}` },
})
// Result: Array of messages (guest ↔ admin)
```

### Bước 4: Hiển thị danh sách tin nhắn

```javascript
messages.forEach((msg) => {
  if (msg.fromGuestId) {
    // Tin nhắn từ guest
    console.log(`Guest: ${msg.content}`)
  } else if (msg.fromUserId) {
    // Tin nhắn từ admin
    console.log(`Admin: ${msg.content}`)
  }
})
```

---

## 📊 So sánh 2 endpoints guest:

| Endpoint                             | Mô tả                      | Dữ liệu                                                                                           |
| ------------------------------------ | -------------------------- | ------------------------------------------------------------------------------------------------- |
| `GET /messages/active-guests`        | Guest có socket active     | - Guest info<br>- tableNode<br>- unreadCount<br>- lastMessage                                     |
| `GET /messages/guests-with-messages` | Guest có tin nhắn với user | - Guest info<br>- tableNode<br>- unreadCount<br>- lastMessage<br>- Sắp xếp theo tin nhắn mới nhất |

**Recommendation:**

- Dùng `active-guests` cho real-time (guest đang online)
- Dùng `guests-with-messages` cho lịch sử chat

---

## 🔍 Features:

✅ **Unread count** - Đếm tin nhắn chưa đọc
✅ **Last message** - Tin nhắn mới nhất
✅ **Table info** - Thông tin bàn của guest
✅ **Two-way conversation** - Tin nhắn 2 chiều
✅ **User info** - Thông tin người gửi (admin/user)
