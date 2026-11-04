# Inspector two-factor enrolment and employee access editing

Status: implemented; API typecheck clean and 237+ API tests pass (new: `inspector-mfa`, `employee-access`); mobile and Admin portal typecheck clean; mobile unit tests pass. The enrolment flow itself needs a real device with a Firebase-enabled build and was NOT run here.

## Inspector 2FA on first login
- There is no separate inspector app in this repo: inspectors use the customer app's inspector mode. The other portals only *challenge* a factor that an admin enrolled out-of-band (`npm run mfa:enroll`); they do not enrol it.
- App: after sign-in, an inspector with **zero enrolled second factors** is held on `InspectorMfaEnrollmentScreen` (add a mobile number, enter the SMS code, factor enrolled) before anything else. Afterwards the app signs them out so the next sign-in goes through the SMS challenge that is already supported (`AuthProvider`). If the factor count cannot be read it never blocks (no lock-outs on a read error). Pure rules are unit-tested (`auth/mfa-enrollment.test.ts`).
- API: `inspectorMfaGuard` (`services/api/src/inspector-mfa.ts`) rejects every `/inspector/*` endpoint except `/me` with `INSPECTOR_MFA_REQUIRED` when the session has no second factor. It is **off until `ENFORCE_INSPECTOR_MFA=true`** is set (same pattern as `ENFORCE_ADMIN_MFA`). Turn it on only after the new app version is in inspectors' hands, otherwise existing inspectors are locked out.
- Firebase prerequisites: SMS multi-factor must be enabled in the Firebase project (Identity Platform), and the inspector's Google account email must be verified.
- Not covered: TOTP/authenticator-app factors; resetting a lost phone (an admin would remove the factor in Firebase).

## Admin: edit an employee's role, branches and designation
- Admin portal > Employees > **Edit access** (needs `employee.update`; changing the role also needs `role.assign`). Fields: designation, role (non-privileged), branch checkboxes, and a mandatory reason that is written to the audit log.
- API: `PATCH /admin/employees/:id/access` (`updateEmployeeAccess`). Rules: nobody can edit their own access; non-super admins can only edit employees whose branches are all inside their own scope and can only grant branches inside it; at least one branch; privileged roles can neither be granted nor edited here (they stay in the approval workflow); role and branch changes replace the previous assignments in one transaction; audit event `EMPLOYEE_ACCESS_UPDATED` stores before/after.
- The former "Manage access" button is now "Suspend / reactivate".
