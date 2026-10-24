# Admin Workflows

## First administrator

1. An operator creates and verifies the intended Google/Firebase identity.
2. The operator runs `npm run bootstrap:admin -w @vmotiv/api` with all documented one-time `BOOTSTRAP_*` values.
3. The command verifies the Firebase UID, verified email and Google provider.
4. A PostgreSQL advisory lock makes the check/create operation atomic.
5. If any Super Admin assignment already exists, bootstrap permanently refuses to run.
6. The created administrator must complete MFA before entering the Admin Portal.

## Employee invitation

1. An MFA-authenticated administrator with `employee.invite` chooses one approved role and one or more in-scope branches.
2. Privileged roles additionally require `role.assign.privileged`; routine Admin invitations cannot grant them.
3. The backend stores only the invitation token hash in the invitation record and queues a single delivery event.
4. The employee signs in with the exact verified Google email from the invitation.
5. Acceptance checks token, state, expiry, identity email, role and branch assignments in one transaction.
6. Replay is rejected. The employee receives exactly the role and branches stored in the invitation.

## Suspension and deactivation

1. An authorized administrator records a reason.
2. The API checks self-action, branch scope and last-Super-Admin recovery constraints.
3. Employee and user access state changes atomically and an audit event is appended.
4. Firebase refresh tokens are revoked for inactive states.
5. Every subsequent API request still checks local active state, so access is denied even before token revocation propagates.

## Privileged employee invitation approval

1. A user with routine invitation authority proposes a privileged role and supplies a business reason.
2. The proposal records its requester, branch scope, expiry, immutable proposed values and version; it does not send an invitation.
3. An eligible, MFA-authenticated independent approver reviews it. Self-approval is rejected before an execution attempt.
4. The API checks request version, expiry, branch scope, active role/branches and duplicate invitation state in the decision transaction.
5. Approval creates exactly one invitation and one outbox event; rejection does not create access. A repeated decision is rejected.

## MFA limitation

The API enforces a Firebase token containing `sign_in_second_factor` on every Admin route. Enrollment/recovery UI is not yet implemented. Firebase Identity Platform/TOTP enablement and a controlled recovery process are external prerequisites; this limitation is not represented as completed functionality.
