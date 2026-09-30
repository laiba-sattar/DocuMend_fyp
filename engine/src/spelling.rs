//! spelling.rs — a doubled word, a document that spells the same word two
//! different ways, and a word that plain does not look like English.
//!
//! The first two need no dictionary at all:
//!
//!   * "the the", "is is" — the same word typed twice in a row, almost
//!     always a typo, never a dictionary question
//!   * "colour" next to "color" in the same document — not a spelling
//!     mistake either, but an inconsistency a style guide would catch:
//!     British and American English spell some words differently, and a
//!     document should pick one and keep to it
//!
//! The consistency check only flags a pair when *both* spellings are
//! actually present in this document, which is what keeps it safe: the
//! "-ise"/"-ize" rule below computes an American spelling for every word
//! ending "-ise" by swapping the suffix, even for words like "wise" ("wize")
//! where that guess is nonsense — but nonsense words never appear on their
//! own, so nothing is ever flagged unless the writer's own document contains
//! both real words.
//!
//! The third check, "is this even a word", is different: it needs a real
//! word list, so it carries two. `wordlist.txt` (370k+ words) is what
//! decides whether a word is recognised at all — a list this size is what
//! it actually takes to not flag ordinary words like "comma" or "stray"
//! (an earlier version of this check used only the frequency list below for
//! that job, and did exactly that). `dictionary.txt` (the ten thousand most
//! common English words, ranked by how common) never decides whether a word
//! is real; it is the only place a *suggestion* is drawn from at all, and
//! ranks them by how common they are — "receive" over some far rarer word
//! that also happens to be one edit away. See `UNRANKED` for why the
//! suggestion search stays this small even though recognising a word does
//! not.
//! Even with the full list, a genuine but obscure technical term can still
//! get flagged, so this check deliberately skips anything written with a
//! capital letter: that is almost always a name, a place or a brand no
//! general word list was ever going to know, and flagging every one of
//! those would drown out the real typos. A lower-case word nobody
//! recognises, mid sentence, is a much safer bet.

use crate::rules::{Issue, Repair, Span};
use crate::text::Line;
use std::collections::HashMap;
use std::sync::OnceLock;

const MAX_ISSUES: usize = 40;

fn issue(id: String, title: &str, message: String, start: usize, end: usize, related: Vec<Span>) -> Issue {
    Issue {
        id,
        kind: "structure".to_string(),
        title: title.to_string(),
        message,
        severity: "low".to_string(),
        location: "".to_string(),
        start,
        end,
        related,
        repairs: Vec::new(),
        suggestion: None,
        outline: Vec::new(),
    }
}

/// Every run of letters in `chars`, lowercased, with its own position.
fn words_with_positions(chars: &[char]) -> Vec<(String, usize, usize)> {
    let mut out = Vec::new();
    let mut i = 0usize;
    while i < chars.len() {
        if !chars[i].is_alphabetic() {
            i += 1;
            continue;
        }
        let start = i;
        while i < chars.len() && chars[i].is_alphabetic() {
            i += 1;
        }
        let word: String = chars[start..i].iter().collect::<String>().to_lowercase();
        out.push((word, start, i));
    }
    out
}

fn offsets_of(line: &Line, chars: &[char]) -> Vec<usize> {
    let mut at = Vec::with_capacity(chars.len() + 1);
    let mut position = line.start;
    for c in chars {
        at.push(position);
        position += c.len_utf16();
    }
    at.push(position);
    at
}

/* ---------------------------------------------------------------------------
   Check 1 — the same word twice in a row.
   ------------------------------------------------------------------------- */

fn repeated_word_issues(chars: &[char], at: &[usize], words: &[(String, usize, usize)], issues: &mut Vec<Issue>) {
    for pair in words.windows(2) {
        if issues.len() >= MAX_ISSUES {
            return;
        }
        let (first, _, first_end) = &pair[0];
        let (second, second_start, second_end) = &pair[1];
        if first != second {
            continue;
        }
        // Only when nothing but whitespace sits between the two — "word, word"
        // is a different, much less certain pattern than "word word".
        if !chars[*first_end..*second_start].iter().all(|c| c.is_whitespace()) {
            continue;
        }
        let mut found = issue(
            format!("spelling-repeat-{}", at[*second_start]),
            "Repeated word",
            format!("\u{201c}{}\u{201d} is written twice in a row here.", second),
            at[*second_start],
            at[*second_end],
            Vec::new(),
        );
        // Removes the gap and the repeat together ("the| the| fix" -> "the|
        // fix"), not just the second word on its own, which would leave the
        // space on either side of it behind as a new, doubled space.
        found.repairs = vec![Repair { label: "Remove the repeat".to_string(), start: at[*first_end], end: at[*second_end], text: String::new() }];
        issues.push(found);
    }
}

/* ---------------------------------------------------------------------------
   Check 2 — British and American spellings of the same word, both used.
   ------------------------------------------------------------------------- */

/// Pairs that are not a simple suffix swap: American, then British.
const VARIANT_PAIRS: &[(&str, &str)] = &[
    ("color", "colour"), ("colors", "colours"), ("colored", "coloured"), ("coloring", "colouring"),
    ("favor", "favour"), ("favors", "favours"), ("favorite", "favourite"), ("favorites", "favourites"),
    ("favorable", "favourable"), ("favorably", "favourably"),
    ("honor", "honour"), ("honors", "honours"), ("honorable", "honourable"), ("honorary", "honourary"),
    ("behavior", "behaviour"), ("behaviors", "behaviours"), ("behavioral", "behavioural"),
    ("neighbor", "neighbour"), ("neighbors", "neighbours"), ("neighborhood", "neighbourhood"), ("neighboring", "neighbouring"),
    ("labor", "labour"), ("labors", "labours"), ("labored", "laboured"), ("laboring", "labouring"),
    ("flavor", "flavour"), ("flavors", "flavours"), ("flavored", "flavoured"),
    ("humor", "humour"), ("humored", "humoured"), ("humorous", "humourous"),
    ("rumor", "rumour"), ("rumors", "rumours"), ("rumored", "rumoured"),
    ("vapor", "vapour"), ("armor", "armour"), ("armored", "armoured"),
    ("harbor", "harbour"), ("harbors", "harbours"),
    ("endeavor", "endeavour"), ("endeavors", "endeavours"), ("endeavored", "endeavoured"),
    ("splendor", "splendour"), ("valor", "valour"), ("savior", "saviour"), ("saviors", "saviours"),
    ("ardor", "ardour"), ("candor", "candour"), ("clamor", "clamour"),
    ("demeanor", "demeanour"), ("fervor", "fervour"), ("glamor", "glamour"),
    ("odor", "odour"), ("odors", "odours"), ("parlor", "parlour"), ("parlors", "parlours"),
    ("rigor", "rigour"), ("rigors", "rigours"), ("succor", "succour"),
    ("tumor", "tumour"), ("tumors", "tumours"), ("vigor", "vigour"),
    ("center", "centre"), ("centers", "centres"), ("centered", "centred"), ("centering", "centring"),
    ("theater", "theatre"), ("theaters", "theatres"),
    ("liter", "litre"), ("liters", "litres"),
    ("fiber", "fibre"), ("fibers", "fibres"),
    ("caliber", "calibre"), ("somber", "sombre"), ("luster", "lustre"),
    ("specter", "spectre"), ("specters", "spectres"),
    ("defense", "defence"), ("defenses", "defences"),
    ("offense", "offence"), ("offenses", "offences"),
    ("pretense", "pretence"), ("pretenses", "pretences"),
    ("license", "licence"), ("licenses", "licences"),
    ("practice", "practise"),
    ("traveled", "travelled"), ("traveling", "travelling"), ("traveler", "traveller"), ("travelers", "travellers"),
    ("canceled", "cancelled"), ("canceling", "cancelling"),
    ("modeled", "modelled"), ("modeling", "modelling"), ("modeler", "modeller"),
    ("labeled", "labelled"), ("labeling", "labelling"),
    ("fueled", "fuelled"), ("fueling", "fuelling"),
    ("signaled", "signalled"), ("signaling", "signalling"),
    ("leveled", "levelled"), ("leveling", "levelling"),
    ("marveled", "marvelled"), ("marveling", "marvelling"),
    ("counseled", "counselled"), ("counseling", "counselling"),
    ("fulfill", "fulfil"), ("fulfills", "fulfils"), ("fulfillment", "fulfilment"),
    ("enroll", "enrol"), ("enrolls", "enrols"), ("enrollment", "enrolment"), ("enrollments", "enrolments"),
    ("gray", "grey"), ("grays", "greys"), ("grayed", "greyed"),
    ("catalog", "catalogue"), ("catalogs", "catalogues"), ("cataloged", "catalogued"),
    ("dialog", "dialogue"), ("dialogs", "dialogues"),
    ("analog", "analogue"), ("analogs", "analogues"),
    ("mold", "mould"), ("molds", "moulds"), ("molded", "moulded"), ("molding", "moulding"),
    ("plow", "plough"), ("plows", "ploughs"), ("plowed", "ploughed"),
    ("skillful", "skilful"), ("skillfully", "skilfully"),
    ("aluminum", "aluminium"),
    ("judgment", "judgement"), ("judgments", "judgements"),
    ("artifact", "artefact"), ("artifacts", "artefacts"),
];

/// British suffix, its American counterpart — covers the whole "-ise"/"-ize"
/// verb family (organise/organize, realise/realize, recognise/recognize…)
/// without listing every one by hand.
const SUFFIX_PAIRS: &[(&str, &str)] = &[
    ("isation", "ization"), ("isations", "izations"),
    ("ising", "izing"), ("ised", "ized"),
    ("iser", "izer"), ("isers", "izers"),
    ("ise", "ize"),
];

/// The American spelling this word would have if it is really a British
/// "-ise" word — just a suffix swap, so it can suggest a word that is not
/// real; that is harmless here, since it is only ever used to look the
/// result up, never shown on its own (see the module doc comment).
fn american_guess(word: &str) -> Option<String> {
    for (british, american) in SUFFIX_PAIRS {
        if let Some(stem) = word.strip_suffix(british) {
            if !stem.is_empty() {
                return Some(format!("{}{}", stem, american));
            }
        }
    }
    None
}

fn spelling_consistency_issues(index: &std::collections::HashMap<String, (usize, usize, String)>, issues: &mut Vec<Issue>) {
    let mut reported = std::collections::HashSet::new();

    let mut flag = |a: &str, b: &str, issues: &mut Vec<Issue>| {
        if issues.len() >= MAX_ISSUES || reported.contains(a) {
            return;
        }
        let (Some(first), Some(second)) = (index.get(a), index.get(b)) else { return };
        let (earlier, later) = if first.0 <= second.0 { (first, second) } else { (second, first) };
        reported.insert(a.to_string());
        let mut found = issue(
            format!("spelling-consistency-{}", later.0),
            "Spelling is inconsistent",
            format!(
                "This document uses both \u{201c}{}\u{201d} and \u{201c}{}\u{201d} — pick one spelling and use it throughout.",
                earlier.2, later.2
            ),
            later.0,
            later.1,
            vec![Span { start: earlier.0, end: earlier.1 }],
        );
        // Only fixes the occurrence flagged here, to match the one it was
        // compared against — not every occurrence of either spelling in the
        // document, which this check never counted in the first place (it
        // stops looking once one of each spelling has been found).
        found.repairs = vec![Repair {
            label: format!("Use \u{201c}{}\u{201d} here too", earlier.2),
            start: later.0,
            end: later.1,
            text: earlier.2.clone(),
        }];
        issues.push(found);
    };

    for (american, british) in VARIANT_PAIRS {
        flag(american, british, issues);
    }
    let mut words: Vec<&String> = index.keys().collect();
    words.sort();
    for word in words {
        if let Some(guess) = american_guess(word) {
            if index.contains_key(&guess) {
                flag(word, &guess, issues);
            }
        }
    }
}

/* ---------------------------------------------------------------------------
   Check 3 — a word that is not in the dictionary.
   ------------------------------------------------------------------------- */

/// The ten thousand most common English words, one per line, ranked by
/// frequency — see the module doc comment for what this decides and what it
/// does not.
const DICTIONARY_TEXT: &str = include_str!("dictionary.txt");

/// Everything else this check will recognise as a real word: no frequency
/// order, just coverage. See the module doc comment.
const WORDLIST_TEXT: &str = include_str!("wordlist.txt");

const MIN_WORD_LEN: usize = 3;
const MAX_SUGGESTIONS: usize = 3;
const MAX_EDIT_DISTANCE: usize = 2;

/// Anything ranked at or above this is not a real frequency rank — it was
/// added by `effective_dictionary` itself (from `wordlist.txt`, or a
/// generated spelling variant) and never had a frequency to go on.
/// `suggestions` uses this to keep its search to the ~10k words
/// `dictionary.txt` actually ranks, instead of every word `effective_dictionary`
/// recognises: scanning all 380k+ of those, running the full edit-distance
/// check against each, is the difference between a check that answers in
/// milliseconds and one that takes seconds per misspelling — a difference
/// this check found the hard way once already. The trade is the same one
/// the module doc comment already makes for recognising a word at all: a
/// correction that exists only among the rarer words goes unsuggested. For
/// how often anyone types a typo of an uncommon word, that trade is worth
/// keeping the check fast for every real one.
const UNRANKED: usize = 1_000_000;

/// The word list this check treats as "a real word" — the frequency list,
/// the full word list, plus every British/American spelling either half of
/// `VARIANT_PAIRS` or the "-ise"/"-ize" rule can reach from either. Without
/// the last of those, "colour" alone (never mixed with "color") would be
/// flagged here as unrecognised even though the consistency check above
/// already knows it is a real, valid spelling.
///
/// Each word maps to a rank: its line number in `dictionary.txt` when it has
/// one, which is itself ordered by how common the word actually is. A word
/// only `wordlist.txt` knows, or one this check had to add on its own (a
/// British spelling, a generated "-ise" form), has no real frequency to go
/// on, so it gets a rank of `UNRANKED` or higher — see `UNRANKED` for why
/// that value in particular, and why `suggestions` treats it as a cutoff
/// rather than just a tie-breaker.
///
/// Built once and kept: this merges `wordlist.txt`'s 370k+ entries into a
/// `HashMap`, which is not free, and `run` calls this once per analysis —
/// once per pause in typing, in the browser. Doing that work again on every
/// call was the other half of the slowdown fixed alongside `UNRANKED` (see
/// its doc comment); a `OnceLock` is the difference, since none of this ever
/// changes after the first call.
fn effective_dictionary() -> &'static HashMap<String, usize> {
    static DICTIONARY: OnceLock<HashMap<String, usize>> = OnceLock::new();
    DICTIONARY.get_or_init(|| {
        let mut words: HashMap<String, usize> = DICTIONARY_TEXT
            .lines()
            .map(|w| w.trim())
            .filter(|w| !w.is_empty())
            .enumerate()
            .map(|(rank, word)| (word.to_string(), rank))
            .collect();
        let low_priority = words.len() + UNRANKED;
        for word in WORDLIST_TEXT.lines().map(|w| w.trim()).filter(|w| !w.is_empty()) {
            words.entry(word.to_string()).or_insert(low_priority);
        }
        for (american, british) in VARIANT_PAIRS {
            words.entry(american.to_string()).or_insert(low_priority);
            words.entry(british.to_string()).or_insert(low_priority);
        }
        let base: Vec<String> = words.keys().cloned().collect();
        for word in &base {
            for (british_suffix, american_suffix) in SUFFIX_PAIRS {
                if let Some(stem) = word.strip_suffix(american_suffix) {
                    if !stem.is_empty() {
                        words.entry(format!("{}{}", stem, british_suffix)).or_insert(low_priority);
                    }
                }
            }
        }
        words
    })
}

/// Damerau-Levenshtein distance: how many single-letter edits — insert,
/// delete, substitute, or swap two neighbouring letters — turn `a` into `b`.
/// The last one is what plain Levenshtein distance does not have, and it is
/// the difference that matters here: "recieve" is one swap from "receive"
/// (distance 1) but two substitutions from "believe" or "recipe" (distance
/// 2) — without counting a swap as one move, all three tie, and the real
/// correction is no more likely to be suggested than either of the others.
/// This is the standard fix real spell-checkers (Hunspell among them) use
/// for exactly this reason: a transposed pair is the most common single
/// typo there is.
fn edit_distance(a: &str, b: &str) -> usize {
    let a: Vec<char> = a.chars().collect();
    let b: Vec<char> = b.chars().collect();
    let mut d = vec![vec![0usize; b.len() + 1]; a.len() + 1];
    for (i, row) in d.iter_mut().enumerate() {
        row[0] = i;
    }
    for j in 0..=b.len() {
        d[0][j] = j;
    }
    for i in 1..=a.len() {
        for j in 1..=b.len() {
            let cost = if a[i - 1] == b[j - 1] { 0 } else { 1 };
            let mut best = (d[i - 1][j] + 1).min(d[i][j - 1] + 1).min(d[i - 1][j - 1] + cost);
            if i > 1 && j > 1 && a[i - 1] == b[j - 2] && a[i - 2] == b[j - 1] {
                best = best.min(d[i - 2][j - 2] + 1);
            }
            d[i][j] = best;
        }
    }
    d[a.len()][b.len()]
}

/// The closest real words to `word`, nearest first — what the editor offers
/// as one-click fixes. Ties in distance go to whichever candidate is the
/// more common word, then alphabetically, so the result is always the same
/// for the same input.
fn suggestions(word: &str, dictionary: &HashMap<String, usize>) -> Vec<String> {
    // Characters, not bytes — "café" is 4 letters but 5 UTF-8 bytes, and the
    // prefilter has to agree with edit_distance's own char-by-char count or
    // it silently excludes candidates edit_distance would have accepted.
    let word_len = word.chars().count();
    let mut scored: Vec<(usize, usize, &str)> = dictionary
        .iter()
        .filter(|(_, &rank)| rank < UNRANKED)
        .filter(|(w, _)| w.chars().count().abs_diff(word_len) <= MAX_EDIT_DISTANCE)
        .map(|(w, &rank)| (edit_distance(word, w), rank, w.as_str()))
        .filter(|(distance, _, _)| (1..=MAX_EDIT_DISTANCE).contains(distance))
        .collect();
    scored.sort_by(|a, b| a.0.cmp(&b.0).then(a.1.cmp(&b.1)).then(a.2.cmp(b.2)));
    scored.into_iter().take(MAX_SUGGESTIONS).map(|(_, _, w)| w.to_string()).collect()
}

fn misspelling_issues(chars: &[char], at: &[usize], words: &[(String, usize, usize)], dictionary: &HashMap<String, usize>, issues: &mut Vec<Issue>) {
    for (word, start, end) in words {
        if issues.len() >= MAX_ISSUES {
            return;
        }
        if word.chars().count() < MIN_WORD_LEN || chars[*start].is_uppercase() || dictionary.contains_key(word) {
            continue;
        }
        let fixes = suggestions(word, dictionary);
        let message = if fixes.is_empty() {
            format!("\u{201c}{}\u{201d} is not a word this checker recognises.", word)
        } else {
            format!(
                "\u{201c}{}\u{201d} is not a word this checker recognises — did you mean {}?",
                word,
                fixes.iter().map(|f| format!("\u{201c}{}\u{201d}", f)).collect::<Vec<_>>().join(" or ")
            )
        };
        let mut found = issue(
            format!("spelling-unknown-{}", at[*start]),
            "Misspelled word",
            message,
            at[*start],
            at[*end],
            Vec::new(),
        );
        found.repairs = fixes
            .into_iter()
            .map(|fix| Repair { label: format!("Use \u{201c}{}\u{201d}", fix), start: at[*start], end: at[*end], text: fix })
            .collect();
        issues.push(found);
    }
}

/// Checks every line for a doubled word and an unrecognised one, then the
/// whole document for a word spelled two different ways.
pub fn run(lines: &[Line]) -> Vec<Issue> {
    let mut issues = Vec::new();
    let mut index: std::collections::HashMap<String, (usize, usize, String)> = std::collections::HashMap::new();
    let dictionary = effective_dictionary();

    for line in lines {
        if issues.len() >= MAX_ISSUES {
            return issues;
        }
        let chars: Vec<char> = line.text.chars().collect();
        let at = offsets_of(line, &chars);
        let words = words_with_positions(&chars);
        repeated_word_issues(&chars, &at, &words, &mut issues);
        misspelling_issues(&chars, &at, &words, dictionary, &mut issues);
        for (word, start, end) in &words {
            index.entry(word.clone()).or_insert_with(|| {
                (at[*start], at[*end], chars[*start..*end].iter().collect())
            });
        }
    }

    spelling_consistency_issues(&index, &mut issues);
    issues
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::text::lines;

    fn issues_of(text: &str) -> Vec<Issue> {
        run(&lines(text))
    }

    #[test]
    fn plain_writing_is_quiet() {
        assert!(issues_of("This is a normal document with no problems or issues.").is_empty());
    }

    #[test]
    fn a_doubled_word_is_caught() {
        let found = issues_of("We need to the the fix this soon.");
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].title, "Repeated word");
    }

    /// Applying `text` in place of `start..end` (both UTF-16 offsets) is what
    /// the editor actually does with a one-click fix — see punctuation.rs's
    /// copy of this helper for why the real test is the resulting string.
    fn apply(original: &str, repair: &Repair) -> String {
        let chars: Vec<u16> = original.encode_utf16().collect();
        let before: String = String::from_utf16(&chars[..repair.start]).unwrap();
        let after: String = String::from_utf16(&chars[repair.end..]).unwrap();
        format!("{}{}{}", before, repair.text, after)
    }

    #[test]
    fn the_repeated_word_repair_removes_the_repeat_and_its_gap() {
        let text = "We need to the the fix this soon.";
        let found = issues_of(text);
        assert_eq!(found[0].repairs.len(), 1);
        assert_eq!(apply(text, &found[0].repairs[0]), "We need to the fix this soon.");
    }

    #[test]
    fn an_unrecognised_word_is_caught_with_a_suggestion() {
        let found = issues_of("I want to recieve the package soon.");
        let spelling: Vec<&Issue> = found.iter().filter(|i| i.title == "Misspelled word").collect();
        assert_eq!(spelling.len(), 1);
        assert!(spelling[0].message.contains("recieve"));
        assert!(spelling[0].repairs.iter().any(|r| r.text == "receive"));
    }

    #[test]
    fn a_transposed_typo_suggests_the_transposition_first() {
        // "recieve" is one letter-swap from "receive" (distance 1) but two
        // substitutions from "believe" or "recipe" (distance 2 for both) —
        // the real correction has to come first, not lose a three-way tie
        // the way it would under plain Levenshtein distance.
        let found = issues_of("I want to recieve the package soon.");
        let spelling = found.iter().find(|i| i.title == "Misspelled word").unwrap();
        assert_eq!(spelling.repairs[0].text, "receive");
    }

    #[test]
    fn edit_distance_counts_a_transposition_as_one_move() {
        assert_eq!(edit_distance("recieve", "receive"), 1);
        assert_eq!(edit_distance("recieve", "believe"), 2);
        assert_eq!(edit_distance("teh", "the"), 1);
    }

    #[test]
    fn suggestions_prefer_the_more_common_word_when_distance_ties() {
        // "their" and "tier" are both exactly one edit from "thier" — "their"
        // is by far the more common word (rank 57 vs. 7858), so it has to
        // come first even though the raw edit distance cannot tell them
        // apart.
        let dictionary = effective_dictionary();
        let fixes = suggestions("thier", dictionary);
        assert_eq!(fixes.first().map(String::as_str), Some("their"));
        assert!(fixes.contains(&"tier".to_string()));
    }

    #[test]
    fn a_capitalized_unknown_word_is_left_alone() {
        // Almost certainly a name — flagging it would bury real typos in noise.
        assert!(issues_of("Zephyrine walked to the market.").is_empty());
    }

    #[test]
    fn a_very_short_unknown_word_is_left_alone() {
        assert!(issues_of("He said ab to me.").is_empty());
    }

    #[test]
    fn a_lone_british_spelling_is_not_flagged_as_misspelled() {
        // Only the pair (colour AND color together) is worth a card, not one alone.
        assert!(issues_of("The colour scheme stayed the same throughout the report.").is_empty());
    }

    #[test]
    fn a_lone_ise_verb_is_not_flagged_as_misspelled() {
        assert!(issues_of("We will organise the meeting for next week.").is_empty());
    }

    #[test]
    fn an_accented_word_counts_its_letters_not_its_bytes() {
        // "café" is 4 letters but 5 UTF-8 bytes; the suggestion prefilter has
        // to use the same count edit_distance does, or it silently misses
        // candidates a byte-length comparison would have excluded.
        let found = issues_of("We went to the café yesterday.");
        let spelling: Vec<&Issue> = found.iter().filter(|i| i.title == "Misspelled word").collect();
        assert_eq!(spelling.len(), 1);
        assert!(spelling[0].repairs.iter().any(|r| r.text == "cafe"));
    }

    #[test]
    fn a_word_separated_by_a_comma_is_not_a_repeat() {
        assert!(issues_of("Yes, yes, that is right.").is_empty());
    }

    #[test]
    fn mixed_our_or_spelling_is_caught() {
        let found = issues_of("The colour scheme is nice. We chose this color for the logo.");
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].title, "Spelling is inconsistent");
        assert!(found[0].message.contains("colour") && found[0].message.contains("color"));
    }

    #[test]
    fn the_spelling_consistency_repair_matches_the_earlier_spelling() {
        // "colour" comes first, so the fix brings the later "color" in line
        // with it — not the other way around, and not a guess at which
        // spelling the whole document should standardise on.
        let text = "The colour scheme is nice. We chose this color for the logo.";
        let found = issues_of(text);
        assert_eq!(found[0].repairs.len(), 1);
        assert_eq!(apply(text, &found[0].repairs[0]), "The colour scheme is nice. We chose this colour for the logo.");
    }

    #[test]
    fn one_spelling_used_throughout_is_quiet() {
        assert!(issues_of("The colour scheme is nice. We kept the same colour for the logo.").is_empty());
    }

    #[test]
    fn mixed_ise_ize_spelling_is_caught_without_a_word_list() {
        let found = issues_of("We should organise the files. Yesterday we organize the archive too.");
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].title, "Spelling is inconsistent");
    }

    #[test]
    fn mixed_ised_ized_spelling_is_also_caught() {
        let found = issues_of("The files were organised last week. The archive was organized too.");
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].title, "Spelling is inconsistent");
    }

    #[test]
    fn ise_words_with_no_real_ize_counterpart_are_quiet() {
        // "wise" and "rise" would guess "wize"/"rize", which never appear.
        assert!(issues_of("A wise decision. Prices rise and fall.").is_empty());
    }

    #[test]
    fn each_pair_is_reported_once_even_if_repeated() {
        let found = issues_of("Colour, colour, colour. But also color, color.");
        assert_eq!(found.iter().filter(|i| i.title == "Spelling is inconsistent").count(), 1);
    }
}
