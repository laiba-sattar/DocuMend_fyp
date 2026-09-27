//! numbers.rs — finding the facts a document can contradict itself about.
//!
//! "The budget is PKR 45,000" gives one fact: value 45000, unit PKR. Later
//! "we spent PKR 32,000 on the budget" gives another with the same unit. Two
//! different values with the same unit in two sentences about the same topic
//! is exactly the contradiction ODIE is meant to catch.

use crate::text::Sentence;

/// One number found in a sentence, with its unit and where it sits in the document.
#[derive(Debug, Clone, PartialEq)]
pub struct NumberFact {
    /// The number itself, already multiplied out (3.5 million → 3500000).
    pub value: f64,
    /// Exactly how it was written, e.g. "PKR 45,000" or "3.5 million".
    pub raw: String,
    /// What it measures: "PKR", "USD", "%", "student", "day"… empty if unknown.
    pub unit: String,
    /// Start in the document, in UTF-16 units.
    pub start: usize,
    /// End (exclusive) in the document, in UTF-16 units.
    pub end: usize,
}

const MULTIPLIERS: &[(&str, f64)] = &[
    ("hundred", 100.0),
    ("thousand", 1_000.0),
    ("k", 1_000.0),
    ("lakh", 100_000.0),
    ("million", 1_000_000.0),
    ("m", 1_000_000.0),
    ("mn", 1_000_000.0),
    ("crore", 10_000_000.0),
    ("billion", 1_000_000_000.0),
    ("bn", 1_000_000_000.0),
];

/// Words that are never a unit, even when they follow a number.
const NOT_UNITS: &[&str] = &[
    "and", "are", "but", "for", "in", "is", "of", "on", "or", "per", "than", "the", "to", "was",
    "were", "with",
];

fn currency_code(word: &str) -> Option<&'static str> {
    match word.trim_end_matches('.').to_lowercase().as_str() {
        "pkr" | "rs" | "rupees" | "rupee" | "₨" => Some("PKR"),
        "usd" | "$" | "dollars" | "dollar" => Some("USD"),
        "eur" | "€" | "euros" | "euro" => Some("EUR"),
        "gbp" | "£" | "pounds" | "pound" => Some("GBP"),
        _ => None,
    }
}

/// Turns "students" into "student" so the singular and plural match each other.
fn singular(word: &str) -> String {
    let lower = word.to_lowercase();
    if lower.ends_with("ies") && lower.len() > 4 {
        format!("{}y", &lower[..lower.len() - 3])
    } else if lower.ends_with('s') && !lower.ends_with("ss") && lower.len() > 3 {
        lower[..lower.len() - 1].to_string()
    } else {
        lower
    }
}

/// Every number in one sentence, with document-wide UTF-16 offsets.
pub fn numbers_in(sentence: &Sentence) -> Vec<NumberFact> {
    let chars: Vec<char> = sentence.text.chars().collect();
    // UTF-16 offset of each character, relative to the start of the document.
    let mut at: Vec<usize> = Vec::with_capacity(chars.len() + 1);
    let mut position = sentence.start;
    for c in &chars {
        at.push(position);
        position += c.len_utf16();
    }
    at.push(position);

    let mut facts = Vec::new();
    let mut i = 0usize;
    while i < chars.len() {
        if !chars[i].is_ascii_digit() {
            i += 1;
            continue;
        }
        // ---- the digits themselves, e.g. 45,000 or 3.5 ----
        let digits_start = i;
        let mut j = i;
        while j < chars.len() {
            let c = chars[j];
            let joins_digits = (c == ',' || c == '.')
                && chars.get(j + 1).map(|n| n.is_ascii_digit()).unwrap_or(false);
            if c.is_ascii_digit() || joins_digits {
                j += 1;
            } else {
                break;
            }
        }
        let digits: String = chars[digits_start..j].iter().collect();
        let mut value: f64 = match digits.replace(',', "").parse() {
            Ok(v) => v,
            Err(_) => {
                i = j;
                continue;
            }
        };

        // ---- what comes before: a currency symbol or code ----
        let mut span_start = digits_start;
        let mut unit = String::new();
        let (before_word, before_start) = word_before(&chars, digits_start);
        if let Some(code) = currency_code(&before_word) {
            unit = code.to_string();
            span_start = before_start;
        }

        // ---- what comes after: %, a multiplier, then maybe a unit word ----
        let mut span_end = j;
        // "45%" and "45 %" are the same thing; some house styles put a space before the sign.
        let mut sign = j;
        while chars.get(sign).map(|c| c.is_whitespace()).unwrap_or(false) {
            sign += 1;
        }
        if chars.get(sign) == Some(&'%') {
            unit = "%".to_string();
            span_end = sign + 1;
        } else {
            let (after_word, after_end) = word_after(&chars, j);
            let lower = after_word.to_lowercase();
            if lower == "percent" || lower == "percentage" {
                unit = "%".to_string();
                span_end = after_end;
            } else if let Some((_, factor)) =
                MULTIPLIERS.iter().find(|(name, _)| *name == lower.as_str())
            {
                value *= factor;
                span_end = after_end;
                if unit.is_empty() {
                    let (next_word, next_end) = word_after(&chars, span_end);
                    if let Some(code) = currency_code(&next_word) {
                        unit = code.to_string();
                        span_end = next_end;
                    } else if is_unit_word(&next_word) {
                        unit = singular(&next_word);
                        span_end = next_end;
                    }
                }
            } else if unit.is_empty() {
                if let Some(code) = currency_code(&after_word) {
                    unit = code.to_string();
                    span_end = after_end;
                } else if is_unit_word(&after_word) {
                    unit = singular(&after_word);
                    span_end = after_end;
                }
            }
        }

        let raw: String = chars[span_start..span_end].iter().collect();
        facts.push(NumberFact {
            value,
            raw: raw.trim().to_string(),
            unit,
            start: at[span_start],
            end: at[span_end],
        });
        i = span_end.max(j);
    }
    facts
}

fn is_unit_word(word: &str) -> bool {
    !word.is_empty()
        && word.chars().all(|c| c.is_alphabetic())
        && word.chars().count() >= 2
        && !NOT_UNITS.contains(&word.to_lowercase().as_str())
}

/// The word immediately before `index`, plus where it starts.
fn word_before(chars: &[char], index: usize) -> (String, usize) {
    let mut end = index;
    while end > 0 && chars[end - 1] == ' ' {
        end -= 1;
    }
    if end == 0 {
        return (String::new(), index);
    }
    // A bare symbol such as $ counts as a whole word.
    let last = chars[end - 1];
    if !last.is_alphanumeric() && last != '.' {
        return (last.to_string(), end - 1);
    }
    let mut start = end;
    while start > 0 && (chars[start - 1].is_alphabetic() || chars[start - 1] == '.') {
        start -= 1;
    }
    (chars[start..end].iter().collect(), start)
}

/// The word immediately after `index`, plus where it ends.
fn word_after(chars: &[char], index: usize) -> (String, usize) {
    let mut start = index;
    while start < chars.len() && chars[start] == ' ' {
        start += 1;
    }
    let mut end = start;
    while end < chars.len() && chars[end].is_alphabetic() {
        end += 1;
    }
    if end == start {
        return (String::new(), index);
    }
    (chars[start..end].iter().collect(), end)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::text::split_sentences;

    fn facts(text: &str) -> Vec<NumberFact> {
        let sentences = split_sentences(text);
        numbers_in(&sentences[0])
    }

    #[test]
    fn reads_a_currency_amount() {
        let found = facts("The budget is PKR 45,000 for the lab.");
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].value, 45000.0);
        assert_eq!(found[0].unit, "PKR");
        assert_eq!(found[0].raw, "PKR 45,000");
    }

    #[test]
    fn a_space_before_the_percent_sign_still_counts_as_a_percentage() {
        let found = facts("Accuracy reached 92 % in testing.");
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].value, 92.0);
        assert_eq!(found[0].unit, "%");
        assert_eq!(found[0].raw, "92 %");
    }

    #[test]
    fn reads_a_percentage() {
        let found = facts("Accuracy reached 92% in testing.");
        assert_eq!(found[0].value, 92.0);
        assert_eq!(found[0].unit, "%");
        let words = facts("Accuracy reached 92 percent in testing.");
        assert_eq!(words[0].unit, "%");
    }

    #[test]
    fn multiplies_millions() {
        let found = facts("The market is 3.5 million users today.");
        assert_eq!(found[0].value, 3_500_000.0);
        assert_eq!(found[0].unit, "user");
    }

    #[test]
    fn singular_and_plural_share_a_unit() {
        let many = facts("We surveyed 40 students.");
        let one = facts("We surveyed 1 student.");
        assert_eq!(many[0].unit, one[0].unit);
    }

    #[test]
    fn offsets_point_at_the_number() {
        let text = "Cost is PKR 45,000 total.";
        let found = facts(text);
        let slice: String = text.chars().skip(found[0].start).take(found[0].end - found[0].start).collect();
        assert_eq!(slice, "PKR 45,000");
    }

    #[test]
    fn ignores_filler_words_as_units() {
        let found = facts("We interviewed 12 of the teachers.");
        assert_eq!(found[0].unit, "");
    }
}
