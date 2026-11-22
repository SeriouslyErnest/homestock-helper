/** What happens when `userId` leaves a home, given members oldest-first. */
export type LeavePlan =
  | { kind: "member" }
  | { kind: "transfer"; successorName: string }
  | { kind: "delete" };

export type LeaveMember = { user_id: string; role: string; display_name: string | null; created_at: string };

export function planLeave(members: LeaveMember[], userId: string): LeavePlan {
  const others = members.filter((m) => m.user_id !== userId);
  if (others.length === 0) return { kind: "delete" };
  const me = members.find((m) => m.user_id === userId);
  const otherOwner = others.some((m) => m.role === "owner");
  if (me?.role !== "owner" || otherOwner) return { kind: "member" };
  const next = [...others].sort((a, b) => a.created_at.localeCompare(b.created_at))[0]!;
  return { kind: "transfer", successorName: next.display_name ?? "the next member" };
}

/** Seconds a user must wait before each leave confirmation unlocks. */
export const LEAVE_COUNTDOWN_SECONDS = 5;
