/**
 * Format validation helpers for CIDR and IPv4 addresses.
 * Used by both schema-validator (Layer 1) and semantic rules (Layer 2).
 */

/**
 * Validate an IPv4 CIDR notation string (e.g., "10.0.0.0/24").
 * Checks octet ranges (0-255) and prefix length (0-32).
 */
export function isValidCidr(value: string): boolean {
  const parts = value.split("/");
  if (parts.length !== 2) return false;

  const ip = parts[0];
  const prefixStr = parts[1];

  // Validate prefix length
  if (!/^\d+$/.test(prefixStr)) return false;
  const prefix = Number.parseInt(prefixStr, 10);
  if (prefix < 0 || prefix > 32) return false;

  // Validate IP portion
  return isValidIpv4(ip);
}

/**
 * Validate an IPv4 address string (e.g., "192.168.1.1").
 * Checks for exactly 4 octets, each in range 0-255.
 */
export function isValidIpv4(value: string): boolean {
  const octets = value.split(".");
  if (octets.length !== 4) return false;

  for (const octet of octets) {
    if (!/^\d+$/.test(octet)) return false;
    const num = Number.parseInt(octet, 10);
    if (num < 0 || num > 255) return false;
  }

  return true;
}
