/** Presentation only: a live payment request may reveal its heading once, without
 * pulling a reader away from earlier messages. No transcript flag grants authority. */
export const createApprovalRevealPolicy = () => {
  let following = true
  const requests = new Map<string, { eligible: boolean; revealed: boolean }>()
  return {
    setFollowing(value: boolean) { following = value },
    register(key: string, live: boolean) {
      if (live && !requests.has(key)) requests.set(key, { eligible: following, revealed: false })
    },
    reveal(key: string) {
      const request = requests.get(key)
      if (!request || request.revealed) return false
      request.revealed = true
      return request.eligible && following
    }
  }
}
