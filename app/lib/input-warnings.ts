export function sameInputText(left: string | null | undefined, right: string | null | undefined): boolean {
  const normalize = (value: string | null | undefined) => value?.trim().replace(/\s+/g, " ").toLocaleLowerCase() ?? "";
  const text = normalize(left);
  return text !== "" && text === normalize(right);
}

type Contact = { firstName: string; lastName: string | null; companyName: string | null; email: string | null; phone: string | null };
export function similarCustomer(left: Contact, right: Contact): boolean {
  const name = (value: Contact) => value.companyName?.trim() || [value.firstName, value.lastName].filter(Boolean).join(" ");
  return sameInputText(name(left), name(right)) || sameInputText(left.email, right.email)
    || (!!left.phone && !!right.phone && left.phone.replace(/\D/g, "") === right.phone.replace(/\D/g, ""));
}
