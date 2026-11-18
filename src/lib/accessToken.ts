let readAccessToken: () => Promise<string | null> = async () => null;

/** AuthContext registers the live session reader. API calls never accept a role from the caller. */
export function setAccessTokenReader(reader: () => Promise<string | null>): void {
  readAccessToken = reader;
}

export function readCurrentAccessToken(): Promise<string | null> {
  return readAccessToken();
}
