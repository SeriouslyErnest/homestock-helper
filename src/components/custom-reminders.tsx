import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { MAX_CUSTOM_REMINDERS, MAX_REMINDER_TEXT, ordinal } from "@/lib/custom-reminders";

type Reminder = { id: string; day_of_month: number; message: string };

export function CustomReminders() {
  const qc = useQueryClient();
  const key = ["custom-reminders"];
  const q = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("custom_reminders")
        .select("id, day_of_month, message")
        .order("day_of_month")
        .order("created_at");
      if (error) throw error;
      return data as Reminder[];
    },
  });
  const [day, setDay] = useState(1);
  const [text, setText] = useState("");
  const refresh = () => qc.invalidateQueries({ queryKey: key });

  const add = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Please sign in again.");
      const { error } = await supabase
        .from("custom_reminders")
        .insert({ user_id: u.user.id, day_of_month: day, message: text.trim() });
      if (error) throw new Error(error.message.includes("10") ? "You can have up to 10 custom reminders." : "Couldn't save. Try again.");
    },
    onSuccess: () => {
      setText("");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("custom_reminders").delete().eq("id", id);
      if (error) throw new Error("Couldn't remove. Try again.");
    },
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });

  const list = q.data ?? [];
  const full = list.length >= MAX_CUSTOM_REMINDERS;

  return (
    <div className="mt-4 border-t border-border pt-3">
      <h3 className="text-sm font-semibold">Monthly custom reminders</h3>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Sent to your Telegram on that day each month, with your expiry reminders. Days 29–31 go
        out on the last day of shorter months. {list.length}/{MAX_CUSTOM_REMINDERS} used.
      </p>
      {list.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {list.map((r) => (
            <li key={r.id} className="flex items-center gap-2 rounded-xl bg-muted px-3 py-2 text-sm">
              <span className="shrink-0 font-semibold">{ordinal(r.day_of_month)}</span>
              <span className="min-w-0 flex-1 break-words">{r.message}</span>
              <button
                type="button"
                aria-label={`Remove reminder: ${r.message}`}
                onClick={() => remove.mutate(r.id)}
                disabled={remove.isPending}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted-foreground"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {!full ? (
        <form
          className="mt-2 flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim()) add.mutate();
          }}
        >
          <select
            aria-label="Day of month"
            value={day}
            onChange={(e) => setDay(Number(e.target.value))}
            className="h-11 rounded-xl border border-border bg-background px-2 text-sm"
          >
            {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d}>
                {ordinal(d)}
              </option>
            ))}
          </select>
          <input
            aria-label="Reminder text"
            value={text}
            maxLength={MAX_REMINDER_TEXT}
            onChange={(e) => setText(e.target.value)}
            placeholder="e.g. Check the supermarket sale"
            className="h-11 min-w-0 flex-1 rounded-xl border border-border bg-background px-3 text-sm"
          />
          <button
            type="submit"
            disabled={add.isPending || !text.trim()}
            className="h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            Add
          </button>
        </form>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">
          Limit reached — remove one to add another.
        </p>
      )}
    </div>
  );
}
