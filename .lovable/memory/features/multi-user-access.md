---
name: Multi-user data access
description: Sub-users created by admin share the admin's data via user_owner table; role-based permissions (operador can write, visualizador read-only)
type: feature
---
- Table `user_owner` links sub-users (user_id) to admin (owner_id)
- Function `get_data_owner_id(uid)` returns owner_id or uid itself
- Function `can_write_data(uid)` checks if user is owner or has operador/admin role
- All data tables use RLS: SELECT for any linked user, INSERT/UPDATE/DELETE for owner+operador+admin
- All hooks use `dataOwnerId` from `useAuth()` for inserts
- All hooks removed `.eq("user_id", user.id)` from SELECTs; RLS handles filtering
- Edge function `admin-create-user` inserts into `user_owner` on user creation
- Edge function `admin-manage-user` deletes from `user_owner` on user deletion
