//! punctuation.rs — spacing and repetition mistakes in punctuation marks.
//!
//! Two checks, both purely mechanical (no dictionary, no meaning involved):
//!
//!   * a stray space before a mark, or a missing one after it
//!   * the same mark two or more times in a row, past what is ever correct
//!
//! A period is left out of "missing space after" on purpose: "example.com",
//! "3.5" and "e.g." all have a period with no space after it and are all
//! correct, and telling those apart from a real missing space needs more
//! than a character rule. A period before a letter with no space at all is
//! common enough in real writing (URLs, file names, abbreviations, version
//! numbers) that the risk of a wrong answer was not worth the rare catch.
//! Everything else — comma, semicolon, colon, "!", "?" — is safe: none of
//! them appear before a letter with no space in ordinary, correct writing.
//!
//! Every issue here carries a one-click repair — unlike a dictionary or
//! meaning question, there is exactly one mechanical fix for "two spaces"
//! or "no space after a comma", so there is nothing to choose between.

use crate::rules::{Issue, Repair, Span};
use crate::text::Line;

const MAX_ISSUES: usize = 40;

fn issue(id: String, title: &str, message: String, start: usize, end: usize) -> Issue {
    Issue {
        id,
        kind: "structure".to_string(),
        title: title.to_string(),
        message,
        severity: "low".to_string(),
        location: "".to_string(),
        start,
        end,
        related: Vec::<Span>::new(),
        repairs: Vec::new(),
        suggestion: None,
        outline: Vec::new(),
    }
}

const SPACED_MARKS: [char; 6] = ['.', ',', ';', ':', '!', '?'];
const AFTER_MARKS: [char; 5] = [',', ';', ':', '!', '?'];

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

fn spacing_issues(chars: &[char], at: &[usize], issues: &mut Vec<Issue>) {
    for i in 0..chars.len() {
        if issues.len() >= MAX_ISSUES {
            return;
        }
        let c = chars[i];

        // Two or more spaces in a row (the trimmed line never starts or ends
        // with one, so this is always a run stuck between two words).
        if c == ' ' && chars.get(i + 1) == Some(&' ') && (i == 0 || chars[i - 1] != ' ') {
            let mut j = i;
            while chars.get(j) == Some(&' ') {
                j += 1;
            }
            let mut found = issue(
                format!("punct-extra-space-{}", at[i]),
                "Extra space",
                format!("{} spaces in a row here; one is enough.", j - i),
                at[i],
                at[j],
            );
            found.repairs = vec![Repair { label: "Use one space".to_string(), start: at[i], end: at[j], text: " ".to_string() }];
            issues.push(found);
            continue;
        }

        // A single stray space right before a mark. (A run of spaces is
        // already reported above, so this only fires for exactly one.)
        if SPACED_MARKS.contains(&c) && i >= 1 && chars[i - 1] == ' ' && (i < 2 || chars[i - 2] != ' ') {
            let mut found = issue(
                format!("punct-space-before-{}", at[i - 1]),
                "Space before punctuation",
                format!("There is a space before the \u{201c}{}\u{201d} here — it usually reads better right after the word.", c),
                at[i - 1],
                at[i + 1],
            );
            found.repairs = vec![Repair { label: "Remove the space".to_string(), start: at[i - 1], end: at[i + 1], text: c.to_string() }];
            issues.push(found);
            continue;
        }

        // A mark with no space (and no other mark) right after it, then a letter.
        if AFTER_MARKS.contains(&c) && chars.get(i + 1).map(|n| n.is_alphabetic()).unwrap_or(false) {
            let mut found = issue(
                format!("punct-space-after-{}", at[i]),
                "Missing space after punctuation",
                format!("There is no space after the \u{201c}{}\u{201d} here, before \u{201c}{}\u{201d}.", c, chars[i + 1]),
                at[i],
                at[i + 2],
            );
            found.repairs = vec![Repair {
                label: "Add a space".to_string(),
                start: at[i],
                end: at[i + 2],
                text: format!("{} {}", c, chars[i + 1]),
            }];
            issues.push(found);
        }
    }
}

/// A run's length is fine unless it is a mark that is never doubled (comma,
/// semicolon, "!", "?") or a run of periods that is neither one period nor a
/// three- or four-dot ellipsis (a sentence-ending ellipsis is written with
/// four: "…." — three plus the sentence's own full stop).
fn run_is_suspicious(mark: char, length: usize) -> bool {
    if mark == '.' {
        !matches!(length, 1 | 3 | 4)
    } else {
        length >= 2
    }
}

fn repeated_mark_issues(chars: &[char], at: &[usize], issues: &mut Vec<Issue>) {
    let marks: [char; 5] = ['.', ',', ';', '!', '?'];
    let mut i = 0usize;
    while i < chars.len() {
        if issues.len() >= MAX_ISSUES {
            return;
        }
        let c = chars[i];
        if !marks.contains(&c) {
            i += 1;
            continue;
        }
        let mut j = i + 1;
        while j < chars.len() && chars[j] == c {
            j += 1;
        }
        let length = j - i;
        if run_is_suspicious(c, length) {
            let written: String = chars[i..j].iter().collect();
            let mut found = issue(
                format!("punct-repeat-{}", at[i]),
                "Repeated punctuation",
                format!("\u{201c}{}\u{201d} — {} is not how {} is normally used.", written, length, c),
                at[i],
                at[j],
            );
            found.repairs = vec![Repair {
                label: format!("Use a single \u{201c}{}\u{201d}", c),
                start: at[i],
                end: at[j],
                text: c.to_string(),
            }];
            issues.push(found);
        }
        i = j;
    }
}

/// Checks every line for punctuation spacing and repetition mistakes.
pub fn run(lines: &[Line]) -> Vec<Issue> {
    let mut issues = Vec::new();
    for line in lines {
        if issues.len() >= MAX_ISSUES {
            return issues;
        }
        let chars: Vec<char> = line.text.chars().collect();
        let at = offsets_of(line, &chars);
        spacing_issues(&chars, &at, &mut issues);
        repeated_mark_issues(&chars, &at, &mut issues);
    }
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
        assert!(issues_of("This is a normal sentence, written well. It has no problems!").is_empty());
    }

    #[test]
    fn a_three_dot_ellipsis_is_fine() {
        assert!(issues_of("And then… it happened.").is_empty());
        assert!(issues_of("And then... it happened.").is_empty());
    }

    #[test]
    fn a_four_dot_sentence_ending_ellipsis_is_fine() {
        assert!(issues_of("And then it happened....").is_empty());
    }

    #[test]
    fn a_period_with_no_space_is_not_flagged() {
        // URLs, decimals and abbreviations all look like this and are correct.
        assert!(issues_of("See example.com or version 3.5 or e.g.this.").is_empty());
    }

    #[test]
    fn a_space_before_a_comma_is_caught() {
        let found = issues_of("This is wrong , very wrong.");
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].title, "Space before punctuation");
    }

    #[test]
    fn a_comma_with_no_space_after_is_caught() {
        let found = issues_of("This has apples,oranges and pears.");
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].title, "Missing space after punctuation");
    }

    #[test]
    fn a_colon_before_a_digit_is_not_flagged() {
        assert!(issues_of("The meeting is at 3:30 today.").is_empty());
    }

    #[test]
    fn a_thousands_comma_is_not_flagged() {
        assert!(issues_of("The total came to 1,234 units.").is_empty());
    }

    #[test]
    fn a_url_colon_is_not_flagged() {
        assert!(issues_of("Visit https://example.com for details.").is_empty());
    }

    #[test]
    fn doubled_exclamation_marks_are_caught() {
        let found = issues_of("This is great!!");
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].title, "Repeated punctuation");
    }

    #[test]
    fn doubled_commas_are_caught() {
        let found = issues_of("Apples,, oranges and pears.");
        assert_eq!(found.len(), 1);
    }

    #[test]
    fn a_two_dot_run_is_caught() {
        let found = issues_of("Wait.. what happened?");
        assert_eq!(found.len(), 1);
    }

    #[test]
    fn a_five_dot_run_is_caught() {
        let found = issues_of("Wait..... what happened?");
        assert_eq!(found.len(), 1);
    }

    #[test]
    fn double_spaces_are_caught() {
        let found = issues_of("This  has extra spaces.");
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].title, "Extra space");
    }

    #[test]
    fn a_run_of_spaces_before_a_mark_is_reported_once() {
        // The space run is the real problem; a second card for the same spot
        // (as if it were a single stray space) would just be noise.
        let found = issues_of("This is wrong  , very wrong.");
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].title, "Extra space");
    }

    /// Applying `text` in place of `start..end` (both UTF-16 offsets, as
    /// `Repair` and `Issue` both use) reproduces what the editor actually
    /// does with a one-click fix — the real test of a repair is the string
    /// it leaves behind, not the values inside it.
    fn apply(original: &str, repair: &Repair) -> String {
        let chars: Vec<u16> = original.encode_utf16().collect();
        let before: String = String::from_utf16(&chars[..repair.start]).unwrap();
        let after: String = String::from_utf16(&chars[repair.end..]).unwrap();
        format!("{}{}{}", before, repair.text, after)
    }

    #[test]
    fn every_punctuation_issue_carries_a_one_click_repair() {
        for text in [
            "This  has extra spaces.",
            "This is wrong , very wrong.",
            "This has apples,oranges and pears.",
            "This is great!!",
        ] {
            let found = issues_of(text);
            assert_eq!(found.len(), 1, "{text}");
            assert_eq!(found[0].repairs.len(), 1, "{text}");
        }
    }

    #[test]
    fn the_extra_space_repair_collapses_to_one_space() {
        let found = issues_of("This  has extra spaces.");
        assert_eq!(apply("This  has extra spaces.", &found[0].repairs[0]), "This has extra spaces.");
    }

    #[test]
    fn the_space_before_punctuation_repair_removes_the_space() {
        let found = issues_of("This is wrong , very wrong.");
        assert_eq!(apply("This is wrong , very wrong.", &found[0].repairs[0]), "This is wrong, very wrong.");
    }

    #[test]
    fn the_missing_space_repair_adds_one() {
        let found = issues_of("This has apples,oranges and pears.");
        assert_eq!(apply("This has apples,oranges and pears.", &found[0].repairs[0]), "This has apples, oranges and pears.");
    }

    #[test]
    fn the_repeated_punctuation_repair_keeps_a_single_mark() {
        let found = issues_of("This is great!!");
        assert_eq!(apply("This is great!!", &found[0].repairs[0]), "This is great!");
    }
}
