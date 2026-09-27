//! text.rs — turning a document into sentences and words.
//!
//! Every position this engine reports is a **UTF-16 offset**, because that is
//! how JavaScript counts characters (`"héllo".length`). Rust counts bytes, so
//! the splitter carries a UTF-16 counter alongside the byte iterator and only
//! ever reports the UTF-16 one. Without this, a document containing "é", "—"
//! or Urdu text would highlight the wrong words in the browser.

/// One sentence of the document.
#[derive(Debug, Clone)]
pub struct Sentence {
    /// Its position in the document, starting at 0.
    pub index: usize,
    /// The sentence itself, trimmed.
    pub text: String,
    /// Where it starts in the document, counted in UTF-16 units.
    pub start: usize,
    /// Where it ends (exclusive), counted in UTF-16 units.
    pub end: usize,
}

impl Sentence {
    /// A short label for the review panel, e.g. `Sentence 4`.
    pub fn label(&self) -> String {
        format!("Sentence {}", self.index + 1)
    }
}

fn is_terminator(c: char) -> bool {
    matches!(c, '.' | '!' | '?' | '\n' | '\u{06D4}' | '\u{061F}') // also Urdu ۔ and ؟
}

/// Splits `text` into sentences. A full stop between two digits (3.5) or
/// inside a short abbreviation (e.g.) does not end a sentence.
pub fn split_sentences(text: &str) -> Vec<Sentence> {
    let chars: Vec<char> = text.chars().collect();
    let mut sentences = Vec::new();
    let mut utf16 = 0usize; // position of chars[i] in UTF-16 units
    let mut starts: Vec<usize> = Vec::with_capacity(chars.len() + 1);
    for c in &chars {
        starts.push(utf16);
        utf16 += c.len_utf16();
    }
    starts.push(utf16); // one past the end

    let mut begin = 0usize; // index into `chars`
    let mut i = 0usize;
    while i < chars.len() {
        let c = chars[i];
        if is_terminator(c) {
            let next = chars.get(i + 1).copied();
            let decimal = c == '.'
                && next.map(|n| n.is_ascii_digit()).unwrap_or(false)
                && i > 0
                && chars[i - 1].is_ascii_digit();
            let abbreviation = c == '.' && i > 0 && chars[i - 1].is_alphabetic() && {
                // "e.g." / "i.e." / "Dr." — a single letter, or a known short word, before the dot
                let word_len = chars[..i].iter().rev().take_while(|ch| ch.is_alphabetic()).count();
                word_len <= 2 && next.map(|n| n != ' ' || word_len == 1).unwrap_or(false)
            };
            if !decimal && !abbreviation {
                push_sentence(&chars, &starts, begin, i + 1, &mut sentences);
                begin = i + 1;
            }
        }
        i += 1;
    }
    push_sentence(&chars, &starts, begin, chars.len(), &mut sentences);
    sentences
}

fn push_sentence(
    chars: &[char],
    starts: &[usize],
    begin: usize,
    end: usize,
    out: &mut Vec<Sentence>,
) {
    let mut first = begin;
    let mut last = end;
    while first < last && chars[first].is_whitespace() {
        first += 1;
    }
    while last > first && chars[last - 1].is_whitespace() {
        last -= 1;
    }
    let body: String = chars[first..last].iter().collect();
    if body.chars().any(|c| c.is_alphanumeric()) {
        out.push(Sentence {
            index: out.len(),
            text: body,
            start: starts[first],
            end: starts[last],
        });
    }
}

const STOPWORDS: &[&str] = &[
    "about", "after", "again", "against", "along", "also", "although", "always", "among", "another",
    "around", "because", "been", "before", "being", "below", "between", "both", "cannot", "could",
    "does", "doing", "down", "during", "each", "either", "else", "even", "ever", "every", "from",
    "further", "have", "having", "here", "however", "into", "just", "like", "made", "make", "many",
    "more", "most", "much", "must", "near", "need", "next", "once", "only", "other", "over", "part",
    "same", "shall", "should", "since", "some", "such", "than", "that", "their", "them", "then",
    "there", "these", "they", "this", "those", "through", "thus", "under", "until", "upon", "used",
    "using", "very", "were", "what", "when", "where", "which", "while", "will", "with", "within",
    "without", "would", "your",
];

const NEGATIONS: &[&str] = &[
    "not", "never", "no", "none", "cannot", "cant", "dont", "doesnt", "didnt", "wont", "isnt",
    "arent", "wasnt", "werent", "without", "neither", "nor", "fails", "failed", "unable",
];

/// Every word of `text`, lowercased, with punctuation removed.
pub fn words(text: &str) -> Vec<String> {
    text.split(|c: char| !c.is_alphanumeric() && c != '\'')
        .filter(|w| !w.is_empty())
        .map(|w| w.replace('\'', "").to_lowercase())
        .filter(|w| !w.is_empty())
        .collect()
}

/// The words worth comparing: at least four letters, no numbers, no stopwords.
/// Two sentences that share several of these are probably about the same thing.
pub fn content_words(text: &str) -> Vec<String> {
    let mut list: Vec<String> = words(text)
        .into_iter()
        .filter(|w| w.chars().count() >= 4 && w.chars().all(|c| c.is_alphabetic()))
        .filter(|w| !STOPWORDS.contains(&w.as_str()))
        .collect();
    list.sort();
    list.dedup();
    list
}

/// How many content words two sentences share.
pub fn shared_words(a: &[String], b: &[String]) -> Vec<String> {
    a.iter().filter(|w| b.contains(w)).cloned().collect()
}

/// 0.0 – 1.0. 1.0 means the two sentences use exactly the same words.
pub fn similarity(a: &[String], b: &[String]) -> f64 {
    if a.is_empty() || b.is_empty() {
        return 0.0;
    }
    let shared = shared_words(a, b).len() as f64;
    let union = (a.len() + b.len()) as f64 - shared;
    if union == 0.0 {
        0.0
    } else {
        shared / union
    }
}

/// The negation word a sentence uses ("not", "never", …), if any.
pub fn negation(text: &str) -> Option<String> {
    words(text)
        .into_iter()
        .find(|w| NEGATIONS.contains(&w.as_str()))
}

/// One non-empty line of the document. The editor starts a new line for every
/// block (paragraph, list item, heading), so a line is one of those.
#[derive(Debug, Clone)]
pub struct Line {
    /// Where the trimmed text starts, in UTF-16 units.
    pub start: usize,
    /// Where it ends (exclusive), in UTF-16 units.
    pub end: usize,
    pub text: String,
}

/// The document's lines, trimmed, with UTF-16 offsets. Blank lines are skipped.
pub fn lines(text: &str) -> Vec<Line> {
    let units = |s: &str| s.chars().map(|c| c.len_utf16()).sum::<usize>();
    let mut out = Vec::new();
    let mut position = 0usize; // UTF-16 offset where the current raw line begins
    for raw in text.split('\n') {
        let trimmed = raw.trim();
        if !trimmed.is_empty() {
            let lead = units(raw) - units(raw.trim_start());
            out.push(Line {
                start: position + lead,
                end: position + lead + units(trimmed),
                text: trimmed.to_string(),
            });
        }
        position += units(raw) + 1; // the newline
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn splits_on_full_stops() {
        let list = split_sentences("First one. Second one! Third?");
        assert_eq!(list.len(), 3);
        assert_eq!(list[1].text, "Second one!");
    }

    #[test]
    fn keeps_decimals_together() {
        let list = split_sentences("The budget is 3.5 million rupees.");
        assert_eq!(list.len(), 1);
    }

    #[test]
    fn offsets_are_utf16() {
        let text = "Héllo wörld. Next line.";
        let list = split_sentences(text);
        // JavaScript would report the same numbers for text.indexOf('Next').
        let js_index = text.chars().take_while(|_| true).count(); // all chars are 1 UTF-16 unit here
        assert_eq!(list[1].start, 13);
        assert!(js_index > 0);
    }

    #[test]
    fn emoji_counts_as_two_units() {
        let list = split_sentences("👍 ok. Second.");
        assert_eq!(list[1].start, 7); // 👍=2, space=1, "ok."=3, space=1
    }

    #[test]
    fn content_words_drop_stopwords() {
        let list = content_words("The project budget should cover the servers.");
        assert_eq!(list, vec!["budget", "cover", "project", "servers"]);
    }

    #[test]
    fn finds_negation() {
        assert_eq!(negation("The data is not shared."), Some("not".to_string()));
        assert_eq!(negation("The data is shared."), None);
    }
}
