/** One line for the staff: what happened to the customer's app account when the booking was made. */
export function describeCustomerAccount(account?: { created?: boolean; existing?: boolean; appInviteEmailed?: boolean; email?: string | null } | null): string {
  if (!account) return '';
  if (account.created && account.appInviteEmailed) return ` A V MOTIV account was created for the customer, and an email with the app download link was sent to ${account.email}.`;
  if (account.created) return ' An account was created for the customer.';
  if (account.appInviteEmailed) return ` The customer already had an account; the app download link was emailed to ${account.email}.`;
  return ' The customer already has an account, so this booking was added to it.';
}
