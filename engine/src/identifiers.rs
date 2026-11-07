//! identifiers.rs — offline validation of DOI and ISBN identifiers.
//!
//! Both are found by their label ("ISBN 978-0-13-468599-1", "doi:10.1000/xyz",
//! "https://doi.org/10.1000/xyz") rather than guessed from bare digits, so an
//! ordinary number is never mistaken for one.
//!
//! ISBN-10 and ISBN-13 both carry a check digit — one extra digit computed
//! from the others — so a mistyped ISBN can be caught exactly, the same way a
//! bank catches a mistyped account number. A DOI has no check digit; only a
//! fixed shape ("10." then a registrant code, a slash, then the publisher's
//! own suffix), so only that shape is checked.
//!
//! Neither check looks anything up online — that is a separate, unbuilt
//! feature (checking the identifier actually *exists*, against CrossRef or
//! similar). This only checks that the identifier is well-formed.

use crate::rules::{Issue, Repair, Span};
use crate::text::Line;

const MAX_ISSUES: usize = 40;

fn issue(id: String, title: &str, message: String, location: String, start: usize, end: usize, repairs: Vec<Repair>) -> Issue {
    Issue {
        id,
        kind: "citation".to_string(),
        title: title.to_string(),
        message,
        severity: "medium".to_string(),
        location,
        start,
        end,
        related: Vec::<Span>::new(),
        repairs,
        suggestion: None,
        outline: Vec::new(),
    }
}

/* ---------------------------------------------------------------------------
   ISBN — a 10 or 13 digit number (the last of which may be "X") with a check
   digit computed from the rest.
   ------------------------------------------------------------------------- */

/// The check digit ISBN-10 requires, given its first nine digits: weight them
/// 10 down to 2, and the check digit makes the total divisible by 11. 10
/// stands for the letter "X".
fn isbn10_check_digit(first_nine: &[u32]) -> u32 {
    let sum: u32 = first_nine.iter().enumerate().map(|(i, d)| d * (10 - i as u32)).sum();
    (11 - (sum % 11)) % 11
}

/// The check digit ISBN-13 requires, given its first twelve digits: weight
/// them 1, 3, 1, 3…, and the check digit makes the total divisible by 10.
fn isbn13_check_digit(first_twelve: &[u32]) -> u32 {
    let sum: u32 = first_twelve
        .iter()
        .enumerate()
        .map(|(i, d)| d * if i % 2 == 0 { 1 } else { 3 })
        .sum();
    (10 - (sum % 10)) % 10
}

const DIGIT_CHARS: [char; 11] = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'X'];

/// Reads the digits (and a possible trailing "X") of an ISBN starting at
/// `start`, along with each digit's own position — hyphens are skipped, but
/// nothing else is, so the scan stops cleanly at the end of the number.
fn read_isbn(chars: &[char], start: usize) -> Option<(Vec<(u32, usize)>, usize)> {
    let mut i = start;
    let mut digits: Vec<(u32, usize)> = Vec::new();
    while i < chars.len() && digits.len() < 13 {
        let c = chars[i];
        if c.is_ascii_digit() {
            digits.push((c.to_digit(10).unwrap(), i));
            i += 1;
        } else if c == '-' {
            i += 1;
        } else {
            break;
        }
    }
    if matches!(chars.get(i), Some('x') | Some('X')) && digits.len() == 9 {
        digits.push((10, i));
        i += 1;
    }
    if digits.is_empty() {
        None
    } else {
        Some((digits, i))
    }
}

/// Skips an optional "-10"/"-13" after the word "ISBN", then any of the
/// punctuation a writer puts between the label and the number itself.
fn skip_isbn_label(chars: &[char], mut i: usize) -> usize {
    if chars.get(i) == Some(&'-') && matches!(chars.get(i + 1), Some('1')) && matches!(chars.get(i + 2), Some('0') | Some('3')) {
        i += 3;
    }
    while matches!(chars.get(i), Some(':') | Some('-') | Some(' ')) {
        i += 1;
    }
    i
}

fn isbn_issues(chars: &[char], at: &[usize], issues: &mut Vec<Issue>) {
    for end in label_ends(chars, "isbn") {
        if issues.len() >= MAX_ISSUES {
            return;
        }
        let number_start = skip_isbn_label(chars, end);
        let Some((digits, number_end)) = read_isbn(chars, number_start) else {
            continue;
        };
        let written: String = chars[number_start..number_end].iter().collect();
        let location = format!("ISBN \u{201c}{}\u{201d}", written);
        let span = (at[number_start], at[number_end]);

        if digits.len() != 10 && digits.len() != 13 {
            issues.push(issue(
                format!("isbn-length-{}", span.0),
                "ISBN is not valid",
                format!("\u{201c}{}\u{201d} has {} digits; ISBN-10 has 10 and ISBN-13 has 13.", written, digits.len()),
                location,
                span.0,
                span.1,
                Vec::new(),
            ));
            continue;
        }

        let values: Vec<u32> = digits.iter().map(|(d, _)| *d).collect();
        let correct = if digits.len() == 10 { isbn10_check_digit(&values[..9]) } else { isbn13_check_digit(&values[..12]) };
        let given = values[digits.len() - 1];
        if given == correct {
            continue;
        }
        let check_position = digits[digits.len() - 1].1;
        let check_start = at[check_position];
        let check_end = at[check_position + 1];
        let correct_char = DIGIT_CHARS[correct as usize];
        issues.push(issue(
            format!("isbn-check-{}", span.0),
            "ISBN is not valid",
            format!(
                "\u{201c}{}\u{201d}'s last digit should be {} for the rest of the number to check out, not {}.",
                written, correct_char, DIGIT_CHARS[given as usize]
            ),
            location,
            span.0,
            span.1,
            vec![Repair {
                label: format!("Use {}", correct_char),
                start: check_start,
                end: check_end,
                text: correct_char.to_string(),
            }],
        ));
    }
}

/* ---------------------------------------------------------------------------
   DOI — "10." then a registrant code, a slash, then any suffix. No check
   digit exists for a DOI, so only the shape is checked.
   ------------------------------------------------------------------------- */

/// Reads a DOI candidate starting at `start`: everything up to the next
/// whitespace, minus any trailing punctuation that plainly belongs to the
/// sentence around it rather than the DOI itself.
fn read_doi(chars: &[char], start: usize) -> (String, usize) {
    let mut i = start;
    while i < chars.len() && !chars[i].is_whitespace() {
        i += 1;
    }
    let mut end = i;
    while end > start && matches!(chars[end - 1], '.' | ',' | ')' | ']' | ';' | ':') {
        end -= 1;
    }
    (chars[start..end].iter().collect(), end)
}

/// "10.1000/xyz123" — the standard DOI shape: "10.", a registrant code of
/// four to nine digits, a slash, then a non-empty suffix the publisher chose.
fn is_valid_doi(s: &str) -> bool {
    let Some(rest) = s.strip_prefix("10.") else { return false };
    let Some(slash) = rest.find('/') else { return false };
    let registrant = &rest[..slash];
    let suffix = &rest[slash + 1..];
    (4..=9).contains(&registrant.len()) && registrant.chars().all(|c| c.is_ascii_digit()) && !suffix.is_empty()
}

fn doi_issues(chars: &[char], at: &[usize], issues: &mut Vec<Issue>) {
    let mut ends = label_ends(chars, "doi:");
    ends.extend(label_ends(chars, "doi.org/"));
    ends.sort_unstable();
    ends.dedup();
    for end in ends {
        if issues.len() >= MAX_ISSUES {
            return;
        }
        let mut start = end;
        while chars.get(start) == Some(&' ') {
            start += 1;
        }
        let (written, doi_end) = read_doi(chars, start);
        if written.is_empty() || is_valid_doi(&written) {
            continue;
        }
        issues.push(issue(
            format!("doi-{}", at[start]),
            "DOI is not valid",
            format!(
                "\u{201c}{}\u{201d} doesn't match the shape a DOI should have: \u{201c}10.\u{201d}, a registrant code, a slash, then the publisher's own suffix — like 10.1000/xyz123.",
                written
            ),
            format!("DOI \u{201c}{}\u{201d}", written),
            at[start],
            at[doi_end],
            Vec::new(),
        ));
    }
}

/* ---------------------------------------------------------------------------
   Shared scanning
   ------------------------------------------------------------------------- */

/// Every position right after a whole-word, case-insensitive match of
/// `label` in `chars` — "isbn" matches "ISBN" but not "isbnfoo", and never
/// matches inside a longer word.
fn label_ends(chars: &[char], label: &str) -> Vec<usize> {
    let label_chars: Vec<char> = label.chars().collect();
    let n = label_chars.len();
    let mut out = Vec::new();
    if n == 0 || chars.len() < n {
        return out;
    }
    for i in 0..=chars.len() - n {
        let before_ok = i == 0 || !chars[i - 1].is_alphanumeric();
        if before_ok && (0..n).all(|k| chars[i + k].to_ascii_lowercase() == label_chars[k]) {
            out.push(i + n);
        }
    }
    out
}

/// UTF-16 offset of each character of `chars` (which starts at `line.start`
/// in the document), plus one entry for the position right after the last.
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

/// Checks every DOI and ISBN mentioned anywhere in the document.
pub fn run(lines: &[Line]) -> Vec<Issue> {
    let mut issues = Vec::new();
    for line in lines {
        if issues.len() >= MAX_ISSUES {
            return issues;
        }
        let chars: Vec<char> = line.text.chars().collect();
        let at = offsets_of(line, &chars);
        isbn_issues(&chars, &at, &mut issues);
        doi_issues(&chars, &at, &mut issues);
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
    fn a_correct_isbn_10_is_quiet() {
        assert!(issues_of("See ISBN 0-13-468599-7 for details.").is_empty());
    }

    #[test]
    fn a_correct_isbn_10_ending_in_x_is_quiet() {
        assert!(issues_of("ISBN 0-8044-2957-X").is_empty());
    }

    #[test]
    fn a_correct_isbn_13_is_quiet() {
        assert!(issues_of("ISBN 978-0-13-468599-1 covers this.").is_empty());
    }

    #[test]
    fn a_mistyped_isbn_check_digit_is_caught() {
        let found = issues_of("ISBN 978-0-13-468599-2 covers this.");
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].title, "ISBN is not valid");
        assert!(found[0].message.contains('1'));
        let repair = &found[0].repairs[0];
        assert_eq!(repair.text, "1");
    }

    #[test]
    fn an_isbn_with_the_wrong_number_of_digits_is_flagged() {
        // 9 digits: neither an ISBN-10 (10) nor an ISBN-13 (13).
        let found = issues_of("ISBN 978-0-13-468 is incomplete.");
        assert_eq!(found.len(), 1);
        assert!(found[0].message.contains("digits"));
        assert!(found[0].repairs.is_empty());
    }

    #[test]
    fn a_correct_doi_is_quiet() {
        assert!(issues_of("See doi:10.1000/xyz123 for the paper.").is_empty());
        assert!(issues_of("Available at https://doi.org/10.1038/nphys1170.").is_empty());
    }

    #[test]
    fn a_doi_with_no_slash_is_caught() {
        let found = issues_of("See doi:10.1000xyz123 for the paper.");
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].title, "DOI is not valid");
    }

    #[test]
    fn a_doi_missing_its_10_prefix_is_caught() {
        let found = issues_of("See doi:1000/xyz123 for the paper.");
        assert_eq!(found.len(), 1);
    }

    #[test]
    fn trailing_sentence_punctuation_is_not_part_of_the_doi() {
        let found = issues_of("See doi:10.1000/xyz123, and also the appendix.");
        assert!(found.is_empty());
    }

    #[test]
    fn a_bare_number_is_never_mistaken_for_an_identifier() {
        assert!(issues_of("The population reached 9780134685991 last year.").is_empty());
        assert!(issues_of("She said isbnormal readings were high.").is_empty());
    }

    #[test]
    fn isbn_10_check_digit_formula() {
        assert_eq!(isbn10_check_digit(&[0, 1, 3, 4, 6, 8, 5, 9, 9]), 7);
        // the example from the ISBN standard itself
        assert_eq!(isbn10_check_digit(&[0, 3, 0, 6, 4, 0, 6, 1, 5]), 2);
    }

    #[test]
    fn isbn_13_check_digit_formula() {
        assert_eq!(isbn13_check_digit(&[9, 7, 8, 0, 1, 3, 4, 6, 8, 5, 9, 9]), 1);
        assert_eq!(isbn13_check_digit(&[9, 7, 8, 0, 3, 0, 6, 4, 0, 6, 1, 5]), 7);
    }
}
