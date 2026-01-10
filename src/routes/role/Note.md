Để hệ thống hoạt động ổn đinh , chúng ta nên :

- Không cho phép xóa 3 role cơ bản : ADMIN, USER , STAFF, GUEST kể cả user với quyền là Admin
  -> Vì 4 role này chúng ta dùng trong code rất nhiều
- Không cho phép ai cập nhật Role Admin , kể cả user Role (Vì mặc định thì Admin nó sẽ có tất cả quyền có trong hệ thống) . Tránh Admin thay đổi các quyền Permission tùm bậy bạ làm mất quyền kiểm soát hệ thống của Role
