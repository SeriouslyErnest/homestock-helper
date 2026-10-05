import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  createTelegramLink,
  setExpiryPref,
  telegramStatus,
  unlinkTelegram,
} from "@/lib/telegram.functions";

export function TelegramCard({
  householdId,
  householdName,
}: {
  householdId: string;
  householdName: string;
}) {
  const qc = useQueryClient();
  const statusFn = useServerFn(telegramStatus);
  const linkFn = useServerFn(createTelegramLink);
  const unlinkFn = useServerFn(unlinkTelegram);
  const prefFn = useServerFn(setExpiryPref);
  const q = useQuery({ queryKey: ["telegram-status"], queryFn: () => statusFn() });
  const refresh = () => qc.invalidateQueries({ queryKey: ["telegram-status"] });

  const connect = useMutation({
    mutationFn: () => linkFn(),
    onSuccess: ({ url }) => {
      window.open(url, "_blank", "noopener");
      toast("Tap Start in Telegram, then come back here.");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const disconnect = useMutation({
    mutationFn: () => unlinkFn(),
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });
  const save = useMutation({
    mutationFn: (v: { enabled: boolean; noticeDays: number }) =>
      prefFn({ data: { householdId, ...v } }),
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });

  const d = q.data;
  if (!d || !d.featureEnabled || !d.botUsername) return null;
  const pref = d.prefs.find((p) => p.householdId === householdId);
  const enabled = pref?.enabled ?? false;
  const days = pref?.noticeDays ?? 3;

  return (
    <section className="mb-6 rounded-2xl border border-border bg-card p-4">
      <h2 className="mb-1 text-sm font-bold">Telegram</h2>
      {!d.linked ? (
        <>
          <p className="text-xs text-muted-foreground">
            {d.stopped
              ? "Telegram stopped accepting our messages (the bot may have been blocked). Connect again to resume."
              : "Add to Shopping with /add milk, check /shopping, /low or /expiring, and get expiry reminders you can silence with Got it."}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Connecting sends item names, amounts and expiry dates from your homes to your private
            Telegram chat. Nothing else.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => connect.mutate()}
              disabled={connect.isPending}
              className="h-11 rounded-2xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              Connect Telegram
            </button>
            <button
              type="button"
              onClick={() => void q.refetch()}
              className="h-11 rounded-2xl border border-border px-4 text-sm"
            >
              I've tapped Start
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="mb-3 text-xs text-muted-foreground">
            Connected. In Telegram: /add milk · /shopping · /low · /expiring · /home · /help
          </p>
          <label className="flex items-center justify-between gap-3 text-sm">
            <span className="min-w-0">Send my expiry reminders for {householdName} to Telegram</span>
            <input
              type="checkbox"
              className="h-5 w-5"
              checked={enabled}
              disabled={save.isPending}
              onChange={(e) => save.mutate({ enabled: e.target.checked, noticeDays: days })}
            />
          </label>
          {enabled && (
            <label className="mt-3 flex items-center justify-between gap-3 text-sm">
              <span>How early</span>
              <select
                value={days}
                disabled={save.isPending}
                onChange={(e) => save.mutate({ enabled, noticeDays: Number(e.target.value) })}
                className="h-10 rounded-xl border border-border bg-background px-3 text-sm"
              >
                <option value={0}>On the day</option>
                <option value={1}>1 day before</option>
                <option value={3}>3 days before</option>
                <option value={7}>A week before</option>
              </select>
            </label>
          )}
          <button
            type="button"
            onClick={() => disconnect.mutate()}
            disabled={disconnect.isPending}
            className="mt-3 text-xs text-muted-foreground underline"
          >
            Disconnect Telegram
          </button>
        </>
      )}
    </section>
  );
}
