export function staffPasswordResetActionSettings(origin: string, baseUrl: string) {
  const actionUrl = new URL(baseUrl, origin);
  const basePath = actionUrl.pathname.endsWith("/") ? actionUrl.pathname : `${actionUrl.pathname}/`;
  actionUrl.pathname = `${basePath}auth`;
  actionUrl.searchParams.set("passwordReset", "complete");
  return { url: actionUrl.toString() };
}

export function staffAuthErrorMessage(error: unknown, hostname: string) {
  const code =
    error && typeof error === "object" && "code" in error && typeof error.code === "string"
      ? error.code
      : "";
  if (code === "auth/invalid-credential" || code === "auth/user-not-found") {
    return "Firebase could not sign in with this email and password. Legacy Supabase passwords do not work in Firebase. Ask an administrator to create your Firebase staff account or send a password-reset link.";
  }
  if (code === "auth/operation-not-allowed") {
    return "Email/password sign-in is disabled. Enable it in Firebase Authentication settings.";
  }
  if (code === "auth/unauthorized-domain" || code === "auth/unauthorized-continue-uri") {
    return `Firebase rejected this site's reset link. Add ${hostname} to Firebase Console → Authentication → Settings → Authorized domains.`;
  }
  if (code === "auth/too-many-requests") {
    return "Too many attempts. Wait a few minutes, then try again.";
  }
  if (code === "auth/network-request-failed") {
    return "Firebase could not be reached. Check your internet connection, disable VPN/ad-blocking temporarily, and try again. If it continues, allow vaasal-villa.firebaseapp.com and identitytoolkit.googleapis.com on this network.";
  }
  if (code === "auth/email-already-in-use") {
    return "This email already has a Firebase login. Use Grant access for the existing account, or send it a password-reset link.";
  }
  if (code === "auth/weak-password") {
    return "Choose a password with at least 6 characters.";
  }
  if (code === "auth/invalid-email") {
    return "Enter a valid email address.";
  }
  return error instanceof Error ? error.message : "Could not complete authentication.";
}
