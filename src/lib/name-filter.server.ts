// Server-only word filter for names entering the shared product catalogue.
// Deterministic and free: a small blocklist checked against a normalised
// copy of the name (lower-case, common look-alike characters folded, no
// spaces or punctuation). It only decides whether a name is *shared*; the
// household's own item always saves as typed.

const BLOCKED = [
  "fuck", "fuk", "fck", "shit", "bitch", "cunt", "dick", "cock", "pussy", "asshole",
  "bastard", "whore", "slut", "wank", "twat", "nigger", "nigga", "faggot", "fag",
  "retard", "rape", "porn", "penis", "vagina", "boob", "tits", "cum", "jizz", "dildo",
  "nazi", "hitler", "kike", "chink", "spic", "paki", "tranny",
  "puki", "pukimak", "lanjiao", "kanina", "cibai", "chibai", "knn", "ccb", "babi",
];

// Blocked only as whole words, to avoid false positives (e.g. "cumin", "scunthorpe").
const WHOLE_WORD_ONLY = new Set(["cum", "fag", "tits", "knn", "ccb", "babi", "paki", "spic", "dick", "cock"]);

function fold(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[@4]/g, "a")
    .replace(/[3]/g, "e")
    .replace(/[1!|]/g, "i")
    .replace(/[0]/g, "o")
    .replace(/[$5]/g, "s")
    .replace(/[7]/g, "t");
}

export function isNameAllowed(name: string): boolean {
  const folded = fold(name);
  const squashed = folded.replace(/[^a-z]/g, "");
  const words = new Set(folded.split(/[^a-z]+/).filter(Boolean));
  for (const w of BLOCKED) {
    if (WHOLE_WORD_ONLY.has(w)) {
      if (words.has(w)) return false;
    } else if (squashed.includes(w)) {
      return false;
    }
  }
  return true;
}
