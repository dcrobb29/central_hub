export function getSafeRedirectTarget(candidate: string | null, origin: string): string {
  if (
    !candidate ||
    !candidate.startsWith("/") ||
    candidate.startsWith("//") ||
    /[\u0000-\u001f\u007f\\]/.test(candidate)
  ) {
    return "/";
  }

  try {
    const trustedOrigin = new URL(origin).origin;
    const target = new URL(candidate, trustedOrigin);
    if (target.origin !== trustedOrigin) return "/";

    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return "/";
  }
}
