---
name: User approval system
description: Per-admin approval for new public signups via invite links; pending users see waiting screen
type: feature
---
- Tables: `user_approvals` (user_id, owner_id, status pending/approved/rejected), `invite_codes` (code, owner_id, active, expires_at, max_uses, uses_count); column `account_settings.require_approval`
- Function `is_user_pending(uid)`; realtime enabled on `user_approvals`
- Flow: admin toggles `require_approval` and generates invite links at `/cadastro?invite=CODE`. On signup, if require_approval=true creates pending entry; else auto-links as visualizador sub-user
- Pending users: `ProtectedRoute` in App.tsx renders `PendingApprovalScreen` when approval status is pending/rejected
- Admin UI: `ApprovalRequestsButton` bell with realtime pending count badge in header (admin only); approve dialog lets admin pick role + allowed tabs (same ALL_TABS as UserManagement)
- Approval applies: inserts `user_owner`, sets `user_roles`, upserts `user_tab_permissions`, sets status='approved'
- Invite validation via `validateInviteCode(code)` in `useInviteCodes.ts` checks active/expires_at/max_uses and returns owner_id + require_approval flag
