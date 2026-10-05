import inventory from "@/assets/guide/inventory.jpg";
import useUp from "@/assets/guide/use-up.jpg";
import shopping from "@/assets/guide/shopping.jpg";
import scan from "@/assets/guide/scan.jpg";
import add from "@/assets/guide/add.jpg";
import item from "@/assets/guide/item.jpg";
import correct from "@/assets/guide/correct.jpg";
import stockCheck from "@/assets/guide/stock-check.jpg";
import more from "@/assets/guide/more.jpg";

type Flow = {
  title: string;
  img: string;
  alt: string;
  steps: string[];
  tip?: string;
  commands?: { cmd: string; what: string }[];
};

const FLOWS: Flow[] = [
  {
    title: "1. Sign in and set up your home",
    img: more,
    alt: "Household and account page with home name, invite code and optional details switches",
    steps: [
      "Open HomeStock and sign in with a one-tap email link or Google. There are no passwords to remember.",
      "First time in? A short welcome tour shows the basics (skip it any time; restart it from More). Then create a home, or type the 6-letter invite code someone gave you and wait for the owner to approve you.",
      "Under More, owners can rename the home, copy the invite code, approve join requests and switch the expiry-date and location boxes off for everyone.",
      "Done inviting? Switch off “Open for join requests”. Tap “New code” and the old code stops working straight away — handy if it was shared too widely.",
    ],
    tip: "Tap your initials at the top right any time to reach your account.",
  },
  {
    title: "2. See what's at home",
    img: inventory,
    alt: "Inventory page with search, filter chips, attention cards and item rows with minus and plus buttons",
    steps: [
      "Inventory lists everything in your home. Search is forgiving — type part of a name.",
      "The three cards show items tracked, items that need attention (low or expiring within 3 days) and items expiring within a day. Tap ⚠ Low or ⏳ Expiring to filter.",
      "Tap − to use one up (with Undo) or + to add one. Tap the number to correct the count.",
      "Pick detailed list, compact list or cards, and sort by name, expiry, last updated or place. These only change your own view.",
    ],
    tip: "Items at zero with no minimum are tucked away — search to find them again.",
  },
  {
    title: "3. Add things you bought",
    img: scan,
    alt: "Scan page with camera area, Restock several switch, barcode box and Add without a barcode",
    steps: [
      "Tap the big scan button in the middle of the bottom bar and point the camera at a barcode — sideways or upside down works too — or type the number.",
      "Already at home? You'll see how many you have, where, and whether you need more. Set the amount and tap “Add 1 to stock” — it's added straight away with Undo, ready for the next scan.",
      "Switch on “Restock several” to keep scanning a whole bag, adjust amounts, then save once. Products HomeStock hasn't seen wait in the list until you give them a name.",
      "No barcode? Tap “Add without a barcode”.",
    ],
  },
  {
    title: "4. Fill in a new item (only the name is required)",
    img: add,
    alt: "Add an item form with name, quantity stepper, category, location, expiry and keep-at-least",
    steps: [
      "Give it a name, then optionally set how many, category, where it's kept and when it expires — type it as DD/MM/YYYY, pick from the calendar, or tap the quick 3, 5 and 14-day buttons.",
      "“Keep at least” is the amount your home likes to have. Drop below it and the item shows as running low — for everyone.",
      "Names you give unknown barcodes are remembered, so the next scan in any home fills in instantly.",
    ],
  },
  {
    title: "5. Use something up",
    img: useUp,
    alt: "Use something up page listing frequently used items each with a minus one button",
    steps: [
      "The Use up tab puts the things your home reaches for most at the top.",
      "One tap takes one away straight away. Made a mistake? Tap Undo in the message that appears.",
      "When there are several of the same item, the one expiring soonest is used first.",
    ],
  },
  {
    title: "6. Check an item and fix the count",
    img: item,
    alt: "Item page for Eggs showing 7 on hand with big minus and plus, correct the count and add to shopping list",
    steps: [
      "Tap any item to see where it's kept, when it expires and its details.",
      "Big − and + buttons change the amount. “Add to shopping list” asks someone to buy more.",
    ],
  },
  {
    title: "7. Correct a count without guessing",
    img: correct,
    alt: "Correct the count panel asking for the actual quantity with an optional note",
    steps: [
      "Tap “Correct the count”, enter the real number and, if you like, a short note such as “spilled”.",
      "The change is recorded, never silently overwritten, and you can undo it.",
    ],
  },
  {
    title: "8. Quick stock check",
    img: stockCheck,
    alt: "Quick stock check list with Still and Change buttons for each item",
    steps: [
      "From Inventory tap “Quick stock check”. HomeStock picks up to 8 items worth a glance.",
      "Tap “Still N” if it's right, or “Change” to enter the real amount, then save.",
    ],
  },
  {
    title: "9. The shopping list",
    img: shopping,
    alt: "Shopping list with quick add box, running low at home list and items to buy",
    steps: [
      "Type what's needed, use − / + for how many, and tap + to add. “Add details” lets you add notes and tags.",
      "“Running low at home” fills itself from items under their minimum — tap “+ List” to add one.",
      "Tick things off as you buy them. Ticking a tracked item adds it to the stock; unticking reverses it.",
    ],
  },
  {
    title: "10. HomeStock on Telegram (optional)",
    img: more,
    alt: "More page where the Telegram card appears",
    steps: [
      "Under More, tap “Connect Telegram”. The HomeStock bot opens — tap Start. The link works once and expires after 15 minutes.",
      "Type a command in the chat, or tap it from the bot’s menu (☰). It only works in a private chat with the bot.",
      "Turn on expiry reminders per home and choose how early. You get one heads-up and one on the day. Tap “Got it” to stop reminders for that item — you can also tap “Got it” on the item page in the app.",
      "Disconnect in the app, or send /stop to the bot.",
    ],
    commands: [
      {
        cmd: "/add <item>",
        what: "Puts one thing on Shopping. The words are kept exactly — “/add eggs 12” adds one request called “eggs 12”. Tap Undo if it was a mistake.",
      },
      { cmd: "/shopping", what: "Shows your shopping list." },
      { cmd: "/low", what: "Shows what's running low or out." },
      { cmd: "/expiring", what: "Shows what's expiring soon." },
      { cmd: "/home", what: "Picks which home Telegram uses — it doesn't change the app." },
      { cmd: "/help", what: "Lists the commands." },
      { cmd: "/stop", what: "Disconnects this chat." },
    ],
    tip: "The card only appears once your admin has switched Telegram on. Telegram can't change stock — that stays in the app.",
  },
];

export function UserGuide() {
  return (
    <div className="mt-10 grid gap-12">
      {FLOWS.map((f, i) => (
        <article
          key={f.title}
          className={`grid items-center gap-6 md:grid-cols-[minmax(0,1fr)_260px] md:gap-10 ${
            i % 2 ? "md:grid-cols-[260px_minmax(0,1fr)]" : ""
          }`}
        >
          <div className={i % 2 ? "md:order-2" : ""}>
            <h3 className="text-xl font-bold">{f.title}</h3>
            <ul className="mt-3 space-y-2 text-[15px] leading-relaxed text-muted-foreground">
              {f.steps.map((s) => (
                <li key={s} className="flex gap-2">
                  <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
                  <span>{s}</span>
                </li>
              ))}
            </ul>
            {f.commands && (
              <>
                <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Commands
                </p>
                <dl className="mt-2 overflow-hidden rounded-2xl border border-border text-sm">
                  {f.commands.map((c, idx) => (
                    <div
                      key={c.cmd}
                      className={`grid grid-cols-[minmax(0,6.5rem)_minmax(0,1fr)] gap-3 px-4 py-2.5 ${
                        idx % 2 ? "bg-muted/50" : ""
                      }`}
                    >
                      <dt className="font-mono text-[13px] font-semibold text-foreground">
                        {c.cmd}
                      </dt>
                      <dd className="min-w-0 text-muted-foreground">{c.what}</dd>
                    </div>
                  ))}
                </dl>
              </>
            )}
            {f.tip && (
              <p className="mt-3 rounded-2xl bg-brand-soft px-4 py-3 text-sm">Tip: {f.tip}</p>
            )}
          </div>
          <img
            src={f.img}
            alt={f.alt}
            loading="lazy"
            width={390}
            height={844}
            className={`mx-auto w-full max-w-[240px] rounded-3xl border border-border shadow-lg ${
              i % 2 ? "md:order-1" : ""
            }`}
          />
        </article>
      ))}
      <p className="text-center text-xs text-muted-foreground">
        Screenshots use a sample home with made-up items.
      </p>
    </div>
  );
}
