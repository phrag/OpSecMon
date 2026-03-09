export function getCorsHeaders(
  req: { headers: { get(name: string): string | null } },
  methods?: string
): Record<string, string>;

export function isDisallowedOrigin(
  req: { headers: { get(name: string): string | null } }
): boolean;
