//! rules.rs — the checks ODIE runs over a document.
//!
//! Three checks today:
//!   1. number conflict — two sentences about the same topic give two different
//!      values for the same thing (PKR 45,000 vs PKR 32,000).
//!   2. claim conflict — two sentences say almost the same thing, but one of
//!      them is negated ("the data is shared" vs "the data is not shared").
//!   3. repetition — two sentences say the same thing twice.
//!
//! Every check returns Issues with UTF-16 offsets, so the editor can highlight
//! the exact words, and (where possible) Repairs the user can apply with one
//! click.

use crate::numbers::{numbers_in, NumberFact};
use crate::text::{content_words, negation, shared_words, similarity, Sentence};

/// A stretch of the document.
#[derive(Debug, Clone, PartialEq)]
pub struct Span {
    pub start: usize,
    pub end: usize,
}

/// A one-click fix: replace the text between `start` and `end` with `text`.
#[derive(Debug, Clone, PartialEq)]
pub struct Repair {
    pub label: String,
    pub start: usize,
    pub end: usize,
    pub text: String,
}

/// A heading the writer could add (used by the structure checks).
#[derive(Debug, Clone, PartialEq)]
pub struct Suggestion {
    pub title: String,
    pub level: u8,
}

/// Something the engine wants the writer to look at.
#[derive(Debug, Clone, PartialEq)]
pub struct Issue {
    pub id: String,
    /// "contradiction" | "redundancy" (structure and citation come in S8)
    pub kind: String,
    pub title: String,
    pub message: String,
    /// "high" | "medium" | "low"
    pub severity: String,
    /// Where to show it, e.g. "Sentence 2 · Sentence 7".
    pub location: String,
    /// The main place to highlight.
    pub start: usize,
    pub end: usize,
    /// The other places involved in the same issue.
    pub related: Vec<Span>,
    pub repairs: Vec<Repair>,
    /// A heading the editor can add with one click (structure issues only).
    pub suggestion: Option<Suggestion>,
    /// A whole outline the editor can add at once. Used by the one check that
    /// fires when a document has no headings at all, where offering the
    /// sections one at a time would mean eight rounds of the same click.
    pub outline: Vec<Suggestion>,
}

/// Sentences longer than this are ignored by the pair checks (tables, lists of numbers).
const MAX_SENTENCE_WORDS: usize = 120;
/// Safety limit so a very long document can never freeze the worker.
const MAX_SENTENCES: usize = 600;
const MAX_ISSUES: usize = 60;

/// How alike two sentences must be before a repeat is reported.
const REPEAT_SIMILARITY: f64 = 0.7;
/// …and before a negated sentence counts as a conflicting claim.
const CLAIM_SIMILARITY: f64 = 0.5;

struct Prepared<'a> {
    sentence: &'a Sentence,
    words: Vec<String>,
    numbers: Vec<NumberFact>,
    negation: Option<String>,
}

/// Runs every check over the document's sentences.
pub fn run(sentences: &[Sentence]) -> Vec<Issue> {
    let prepared: Vec<Prepared> = sentences
        .iter()
        .take(MAX_SENTENCES)
        .map(|sentence| Prepared {
            sentence,
            words: content_words(&sentence.text),
            numbers: numbers_in(sentence),
            negation: negation(&sentence.text),
        })
        .filter(|p| p.sentence.text.split_whitespace().count() <= MAX_SENTENCE_WORDS)
        .collect();

    let mut issues = Vec::new();
    for (a_index, a) in prepared.iter().enumerate() {
        for b in prepared.iter().skip(a_index + 1) {
            if issues.len() >= MAX_ISSUES {
                return issues;
            }
            let shared = shared_words(&a.words, &b.words);
            if shared.len() < 2 {
                continue;
            }
            let before = issues.len();
            number_conflicts(a, b, &shared, &mut issues);
            claim_conflict(a, b, &shared, &mut issues);
            // Two sentences that already conflict are not also "a repeat".
            if issues.len() == before {
                repetition(a, b, &mut issues);
            }
        }
    }
    issues
}

fn topic(shared: &[String]) -> String {
    shared
        .iter()
        .take(2)
        .cloned()
        .collect::<Vec<String>>()
        .join(" / ")
}

/// Check 1 — the same measurement with two different values.
fn number_conflicts(a: &Prepared, b: &Prepared, shared: &[String], issues: &mut Vec<Issue>) {
    for first in &a.numbers {
        for second in &b.numbers {
            let comparable = first.unit == second.unit
                && (!first.unit.is_empty() || shared.len() >= 3)
                && (first.value - second.value).abs() > f64::EPSILON;
            if !comparable {
                continue;
            }
            let unit_note = if first.unit.is_empty() {
                String::new()
            } else {
                format!(" ({})", first.unit)
            };
            issues.push(Issue {
                id: format!("number-{}-{}", first.start, second.start),
                kind: "contradiction".to_string(),
                title: "Numbers do not match".to_string(),
                message: format!(
                    "{} says {} but {} says {} about the same topic — {}{}.",
                    a.sentence.label(),
                    first.raw,
                    b.sentence.label().to_lowercase(),
                    second.raw,
                    topic(shared),
                    unit_note
                ),
                severity: if first.unit.is_empty() { "medium" } else { "high" }.to_string(),
                location: format!("{} · {}", a.sentence.label(), b.sentence.label()),
                start: first.start,
                end: first.end,
                related: vec![Span { start: second.start, end: second.end }],
                repairs: vec![
                    Repair {
                        label: format!("Use {} everywhere", first.raw),
                        start: second.start,
                        end: second.end,
                        text: first.raw.clone(),
                    },
                    Repair {
                        label: format!("Use {} everywhere", second.raw),
                        start: first.start,
                        end: first.end,
                        text: second.raw.clone(),
                    },
                ],
                suggestion: None,
                outline: Vec::new(),
            });
        }
    }
}

/// Check 2 — the same claim, once plain and once negated.
fn claim_conflict(a: &Prepared, b: &Prepared, shared: &[String], issues: &mut Vec<Issue>) {
    let one_is_negated = a.negation.is_some() != b.negation.is_some();
    if !one_is_negated || shared.len() < 3 {
        return;
    }
    if similarity(&a.words, &b.words) < CLAIM_SIMILARITY {
        return;
    }
    let word = a
        .negation
        .clone()
        .or_else(|| b.negation.clone())
        .unwrap_or_default();
    issues.push(Issue {
        id: format!("claim-{}-{}", a.sentence.start, b.sentence.start),
        kind: "contradiction".to_string(),
        title: "Claims disagree".to_string(),
        message: format!(
            "These two sentences make the same claim about {}, but one of them says \"{}\". Keep one version.",
            topic(shared), word
        ),
        severity: "medium".to_string(),
        location: format!("{} · {}", a.sentence.label(), b.sentence.label()),
        start: a.sentence.start,
        end: a.sentence.end,
        related: vec![Span { start: b.sentence.start, end: b.sentence.end }],
        repairs: Vec::new(), // a human has to decide which version is true
        suggestion: None,
        outline: Vec::new(),
    });
}

/// Check 3 — the same sentence written twice.
fn repetition(a: &Prepared, b: &Prepared, issues: &mut Vec<Issue>) {
    if a.words.len() < 5 || b.words.len() < 5 {
        return;
    }
    if a.negation.is_some() != b.negation.is_some() {
        return; // that is a claim conflict, not a repeat
    }
    let score = similarity(&a.words, &b.words);
    if score < REPEAT_SIMILARITY {
        return;
    }
    issues.push(Issue {
        id: format!("repeat-{}-{}", a.sentence.start, b.sentence.start),
        kind: "redundancy".to_string(),
        title: "Repeated sentence".to_string(),
        message: format!(
            "{} repeats {} almost word for word ({}% the same).",
            b.sentence.label(),
            a.sentence.label().to_lowercase(),
            (score * 100.0).round() as i64
        ),
        severity: "low".to_string(),
        location: format!("{} · {}", a.sentence.label(), b.sentence.label()),
        start: b.sentence.start,
        end: b.sentence.end,
        related: vec![Span { start: a.sentence.start, end: a.sentence.end }],
        repairs: vec![Repair {
            label: "Delete the repeat".to_string(),
            start: b.sentence.start,
            end: b.sentence.end,
            text: String::new(),
        }],
        suggestion: None,
        outline: Vec::new(),
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::text::split_sentences;

    fn issues_of(text: &str) -> Vec<Issue> {
        run(&split_sentences(text))
    }

    #[test]
    fn catches_a_budget_conflict() {
        let found = issues_of(
            "The project budget is PKR 45,000 for the lab equipment. \
             Later the same lab equipment budget is PKR 32,000.",
        );
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].kind, "contradiction");
        assert_eq!(found[0].severity, "high");
        assert_eq!(found[0].repairs.len(), 2);
    }

    #[test]
    fn repair_points_at_the_second_number() {
        let text = "The project budget is PKR 45,000 for lab equipment. \
                    The lab equipment budget is PKR 32,000.";
        let found = issues_of(text);
        let repair = &found[0].repairs[0];
        let slice: String = text
            .chars()
            .skip(repair.start)
            .take(repair.end - repair.start)
            .collect();
        assert_eq!(slice, "PKR 32,000");
        assert_eq!(repair.text, "PKR 45,000");
    }

    #[test]
    fn same_number_is_not_an_issue() {
        let found = issues_of(
            "The project budget is PKR 45,000 for lab equipment. \
             The lab equipment budget stays PKR 45,000.",
        );
        assert!(found.is_empty());
    }

    #[test]
    fn different_units_are_not_compared() {
        let found = issues_of(
            "The survey covered 45 students from three campus programmes. \
             The campus survey programmes lasted 30 days.",
        );
        assert!(found.is_empty());
    }

    #[test]
    fn catches_a_negated_claim() {
        let found = issues_of(
            "Documents are encrypted before they leave the device. \
             Documents are not encrypted before they leave the device.",
        );
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].title, "Claims disagree");
        assert!(found[0].repairs.is_empty());
    }

    #[test]
    fn catches_a_repeated_sentence() {
        let found = issues_of(
            "The engine analyses every paragraph locally inside the browser. \
             The engine analyses every paragraph locally inside the browser.",
        );
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].kind, "redundancy");
        assert_eq!(found[0].repairs[0].text, "");
    }

    #[test]
    fn plain_writing_reports_nothing() {
        let found = issues_of(
            "DocuMend keeps documents on the writer's own device. \
             The editor highlights problems while the writer types. \
             Version history keeps a copy every ten minutes.",
        );
        assert!(found.is_empty());
    }
}
