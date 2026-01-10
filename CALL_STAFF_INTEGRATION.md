# Call Staff Feature - Frontend Integration

## 📋 Tổng quan

Tính năng này cho phép guest gọi nhân viên hỗ trợ và gửi thông tin đến MANAGER room qua WebSocket.

## 🔧 Cách hoạt động

### 1. **API Endpoint**

```
POST /api/guest/call-staff
Authorization: Bearer <token>
Content-Type: application/json

{
  "reason": "Cần hỗ trợ đặt món",
  "note": "Khách hàng muốn tư vấn về món ăn",
  "priority": "MEDIUM"
}
```

### 2. **WebSocket Event**

```typescript
// Event được emit đến MANAGER room
{
  message: 'Khách hàng yêu cầu hỗ trợ',
  guestId: 123,
  guestName: 'Khách hàng #123',
  tableNode: {
    id: 5,
    name: 'Bàn 5'
  },
  reason: 'Cần hỗ trợ đặt món',
  note: 'Khách hàng muốn tư vấn về món ăn',
  priority: 'MEDIUM',
  timestamp: '2024-01-01T10:00:00.000Z'
}
```

## 🎯 Frontend Implementation

### **1. Guest Frontend - Gửi yêu cầu hỗ trợ**

```javascript
// React Component
import React, { useState } from 'react'

const CallStaffButton = ({ guestId }) => {
  const [isCalling, setIsCalling] = useState(false)
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const [priority, setPriority] = useState('MEDIUM')

  const handleCallStaff = async () => {
    setIsCalling(true)

    try {
      const response = await fetch('/api/guest/call-staff', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({
          reason: reason || 'Cần hỗ trợ',
          note: note,
          priority: priority,
        }),
      })

      const result = await response.json()

      if (response.ok) {
        alert(`✅ ${result.message}`)
        // Reset form
        setReason('')
        setNote('')
        setPriority('MEDIUM')
      } else {
        alert(`❌ ${result.message}`)
      }
    } catch (error) {
      alert(`❌ Có lỗi xảy ra: ${error.message}`)
    } finally {
      setIsCalling(false)
    }
  }

  return (
    <div className="call-staff-form">
      <h3>🔔 Gọi nhân viên hỗ trợ</h3>

      <div className="form-group">
        <label>Lý do:</label>
        <select value={reason} onChange={(e) => setReason(e.target.value)}>
          <option value="">Chọn lý do</option>
          <option value="Cần hỗ trợ đặt món">Cần hỗ trợ đặt món</option>
          <option value="Có vấn đề với đơn hàng">Có vấn đề với đơn hàng</option>
          <option value="Cần thanh toán">Cần thanh toán</option>
          <option value="Khác">Khác</option>
        </select>
      </div>

      <div className="form-group">
        <label>Ghi chú:</label>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Mô tả chi tiết..." rows={3} />
      </div>

      <div className="form-group">
        <label>Mức độ ưu tiên:</label>
        <select value={priority} onChange={(e) => setPriority(e.target.value)}>
          <option value="LOW">Thấp</option>
          <option value="MEDIUM">Trung bình</option>
          <option value="HIGH">Cao</option>
        </select>
      </div>

      <button onClick={handleCallStaff} disabled={isCalling} className={`call-staff-btn ${isCalling ? 'loading' : ''}`}>
        {isCalling ? '⏳ Đang gửi...' : '🔔 Gọi nhân viên'}
      </button>
    </div>
  )
}

export default CallStaffButton
```

### **2. Manager Dashboard - Lắng nghe yêu cầu hỗ trợ**

```javascript
// Manager Dashboard
import { io } from 'socket.io-client'

const ManagerDashboard = () => {
  const [callRequests, setCallRequests] = useState([])

  useEffect(() => {
    const socket = io('ws://localhost:3000')

    // Join MANAGER room
    socket.emit('join', 'MANAGER_ROOM')

    // Lắng nghe call-staff event
    socket.on('call-staff', (data) => {
      console.log('🔔 Call Staff Request:', data)

      // Thêm vào danh sách
      setCallRequests((prev) => [
        ...prev,
        {
          ...data,
          id: Date.now(),
          status: 'pending',
        },
      ])

      // Hiển thị notification
      showCallStaffNotification(data)

      // Phát âm thanh thông báo
      playNotificationSound()
    })

    return () => {
      socket.disconnect()
    }
  }, [])

  const showCallStaffNotification = (data) => {
    const notification = document.createElement('div')
    notification.className = 'call-staff-notification'
    notification.innerHTML = `
      <div class="notification-header">
        <h3>🔔 ${data.message}</h3>
        <span class="priority ${data.priority.toLowerCase()}">${data.priority}</span>
        <span class="timestamp">${new Date(data.timestamp).toLocaleTimeString()}</span>
      </div>
      <div class="notification-body">
        <p><strong>Bàn:</strong> ${data.tableNode.name}</p>
        <p><strong>Khách hàng:</strong> ${data.guestName}</p>
        <p><strong>Lý do:</strong> ${data.reason}</p>
        ${data.note ? `<p><strong>Ghi chú:</strong> ${data.note}</p>` : ''}
      </div>
      <div class="notification-actions">
        <button onclick="handleCallRequest(${data.guestId}, 'accepted')" class="btn-success">
          ✅ Đã tiếp nhận
        </button>
        <button onclick="handleCallRequest(${data.guestId}, 'completed')" class="btn-primary">
          ✅ Hoàn thành
        </button>
      </div>
    `

    document.getElementById('notifications-container').appendChild(notification)

    // Auto remove after 60 seconds
    setTimeout(() => {
      notification.remove()
    }, 60000)
  }

  const playNotificationSound = () => {
    const audio = new Audio('/sounds/notification.mp3')
    audio.play().catch((e) => console.log('Cannot play sound:', e))
  }

  return (
    <div className="manager-dashboard">
      <h2>📊 Manager Dashboard</h2>

      <div className="call-requests-section">
        <h3>🔔 Yêu cầu hỗ trợ ({callRequests.length})</h3>

        <div className="requests-list">
          {callRequests.map((request) => (
            <div key={request.id} className={`request-item ${request.status}`}>
              <div className="request-header">
                <span className="table-name">Bàn {request.tableNode.name}</span>
                <span className={`priority ${request.priority.toLowerCase()}`}>{request.priority}</span>
                <span className="timestamp">{new Date(request.timestamp).toLocaleTimeString()}</span>
              </div>

              <div className="request-body">
                <p>
                  <strong>Khách:</strong> {request.guestName}
                </p>
                <p>
                  <strong>Lý do:</strong> {request.reason}
                </p>
                {request.note && (
                  <p>
                    <strong>Ghi chú:</strong> {request.note}
                  </p>
                )}
              </div>

              <div className="request-actions">
                <button onClick={() => handleCallRequest(request.guestId, 'accepted')} className="btn-accept">
                  ✅ Tiếp nhận
                </button>
                <button onClick={() => handleCallRequest(request.guestId, 'completed')} className="btn-complete">
                  ✅ Hoàn thành
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default ManagerDashboard
```

### **3. Vue.js Component**

```vue
<template>
  <div class="call-staff-component">
    <div class="call-staff-form">
      <h3>🔔 Gọi nhân viên hỗ trợ</h3>

      <div class="form-group">
        <label>Lý do:</label>
        <select v-model="reason">
          <option value="">Chọn lý do</option>
          <option value="Cần hỗ trợ đặt món">Cần hỗ trợ đặt món</option>
          <option value="Có vấn đề với đơn hàng">Có vấn đề với đơn hàng</option>
          <option value="Cần thanh toán">Cần thanh toán</option>
          <option value="Khác">Khác</option>
        </select>
      </div>

      <div class="form-group">
        <label>Ghi chú:</label>
        <textarea v-model="note" placeholder="Mô tả chi tiết..." rows="3" />
      </div>

      <div class="form-group">
        <label>Mức độ ưu tiên:</label>
        <select v-model="priority">
          <option value="LOW">Thấp</option>
          <option value="MEDIUM">Trung bình</option>
          <option value="HIGH">Cao</option>
        </select>
      </div>

      <button @click="callStaff" :disabled="isCalling" :class="['call-staff-btn', { loading: isCalling }]">
        {{ isCalling ? '⏳ Đang gửi...' : '🔔 Gọi nhân viên' }}
      </button>
    </div>
  </div>
</template>

<script>
export default {
  data() {
    return {
      reason: '',
      note: '',
      priority: 'MEDIUM',
      isCalling: false,
    }
  },
  methods: {
    async callStaff() {
      this.isCalling = true

      try {
        const response = await this.$http.post('/api/guest/call-staff', {
          reason: this.reason || 'Cần hỗ trợ',
          note: this.note,
          priority: this.priority,
        })

        this.$toast.success(response.data.message)

        // Reset form
        this.reason = ''
        this.note = ''
        this.priority = 'MEDIUM'
      } catch (error) {
        this.$toast.error(error.response?.data?.message || 'Có lỗi xảy ra')
      } finally {
        this.isCalling = false
      }
    },
  },
}
</script>
```

### **4. CSS Styles**

```css
.call-staff-form {
  background: #fff;
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 20px;
  margin: 20px 0;
}

.form-group {
  margin-bottom: 15px;
}

.form-group label {
  display: block;
  margin-bottom: 5px;
  font-weight: bold;
}

.form-group select,
.form-group textarea {
  width: 100%;
  padding: 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 14px;
}

.call-staff-btn {
  background: #007bff;
  color: white;
  border: none;
  padding: 12px 24px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 16px;
  width: 100%;
}

.call-staff-btn:hover {
  background: #0056b3;
}

.call-staff-btn:disabled {
  background: #6c757d;
  cursor: not-allowed;
}

.call-staff-notification {
  background: #fff;
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 16px;
  margin: 8px 0;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.notification-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.priority {
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: bold;
}

.priority.low {
  background: #d4edda;
  color: #155724;
}

.priority.medium {
  background: #fff3cd;
  color: #856404;
}

.priority.high {
  background: #f8d7da;
  color: #721c24;
}

.request-item {
  background: #fff;
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 16px;
  margin: 8px 0;
}

.request-item.pending {
  border-left: 4px solid #ffc107;
}

.request-item.accepted {
  border-left: 4px solid #28a745;
}

.request-item.completed {
  border-left: 4px solid #6c757d;
}

.btn-accept {
  background: #28a745;
  color: white;
  border: none;
  padding: 6px 12px;
  border-radius: 4px;
  cursor: pointer;
  margin-right: 8px;
}

.btn-complete {
  background: #007bff;
  color: white;
  border: none;
  padding: 6px 12px;
  border-radius: 4px;
  cursor: pointer;
}
```

## 🚀 Cách test

### **1. Test API**

```bash
# Gọi nhân viên hỗ trợ
curl -X POST http://localhost:3000/api/guest/call-staff \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "reason": "Cần hỗ trợ đặt món",
    "note": "Khách hàng muốn tư vấn về món ăn",
    "priority": "HIGH"
  }'
```

### **2. Test WebSocket**

```javascript
// Test WebSocket connection
const socket = io('ws://localhost:3000')

socket.emit('join', 'MANAGER_ROOM')

socket.on('call-staff', (data) => {
  console.log('Received call-staff event:', data)
})
```

## 📝 Lưu ý quan trọng

1. **Authentication:** Endpoint yêu cầu JWT token của guest
2. **Validation:** Kiểm tra guest có bàn và bàn có tồn tại
3. **WebSocket:** Event được gửi đến MANAGER room
4. **Priority:** Có 3 mức độ: LOW, MEDIUM, HIGH
5. **Error Handling:** Xử lý các trường hợp lỗi phù hợp
