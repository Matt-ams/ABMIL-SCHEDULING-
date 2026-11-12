/** Revocation compares the signed session generation with the database row. */
export function currentWorkerSession(
  signedVersion:number, storedVersion:number, enabled:boolean, hasPin:boolean
):boolean {
  return Number.isSafeInteger(signedVersion) && signedVersion >= 1 &&
    signedVersion === storedVersion && enabled && hasPin;
}
