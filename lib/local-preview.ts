/** Development persona for the explicitly enabled, loopback-only local site. */
export function localPreviewUser(
  dev: boolean,
  enabled: boolean,
  authority: string | null,
) {
  if (!dev || !enabled || !authority) return null;
  try {
    const url = new URL(`http://${authority}`);
    if (
      url.username ||
      url.password ||
      !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    )
      return null;
    return {
      userId: "local_zakupai",
      displayName: "Организатор",
      email: "organizer@localhost",
      fullName: "Организатор",
    };
  } catch {
    return null;
  }
}
