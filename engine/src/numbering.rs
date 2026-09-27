//! numbering.rs — numbers that skip, repeat, or run backwards.
//!
//! Two places a writer numbers things by hand:
//!
//!   * headings — "1. Introduction", "2. Methods", "4. Results" (where is 3?)
//!   * lists typed as text — "1. …", "2. …", "4. …", or "[1] …", "[3] …"
//!
//! Both raise the same issue, "Numbering has a gap", with a one-click repair
//! that renumbers the odd one out. Positions are UTF-16 offsets, as everywhere
//! else in the engine.

use crate::rules::{Issue, Repair, Span};
use crate::structure::Heading;
use crate::text::Line;

const TITLE: &str = "Numbering has a gap";
/// Safety limit so a badly numbered document cannot flood the review panel.
const MAX_ISSUES: usize = 40;

/// The number a heading starts with: "3." is `[3]`, "2.1 " is `[2, 1]`.
#[derive(Debug, Clone)]
pub struct HeadingNumber {
    pub path: Vec<u32>,
    /// How many characters the digits and dots take ("2.1" is 3).
    pub end: usize,
}

/// Reads "3. Results", "2.1 Background" or "4) Methods". At most three digits
/// per part, so a year at the start of a title ("1984 was…") is not a number.
pub fn heading_number(title: &str) -> Option<HeadingNumber> {
    let chars: Vec<char> = title.chars().collect();
    let mut path = Vec::new();
    let mut i = 0usize;
    loop {
        let begin = i;
        while i < chars.len() && chars[i].is_ascii_digit() {
            i += 1;
        }
        if i == begin || i - begin > 3 {
            return None;
        }
        path.push(chars[begin..i].iter().collect::<String>().parse::<u32>().ok()?);
        if i + 1 < chars.len() && chars[i] == '.' && chars[i + 1].is_ascii_digit() {
            i += 1;
            continue;
        }
        break;
    }
    let end = i;
    let mut j = i;
    if j < chars.len() && (chars[j] == '.' || chars[j] == ')') {
        j += 1;
    }
    if j >= chars.len() || !chars[j].is_whitespace() {
        return None;
    }
    if chars[j..].iter().all(|c| c.is_whitespace()) {
        return None;
    }
    Some(HeadingNumber { path, end })
}

/// The heading without its number: "3. Results" is "Results".
pub fn heading_text(title: &str) -> String {
    match heading_number(title) {
        Some(number) => {
            let chars: Vec<char> = title.chars().collect();
            let mut j = number.end;
            if j < chars.len() && (chars[j] == '.' || chars[j] == ')') {
                j += 1;
            }
            chars[j..].iter().collect::<String>().trim().to_string()
        }
        None => title.trim().to_string(),
    }
}

/// The number that starts a typed list item: "3. text", "3) text" or "[3] text".
#[derive(Debug, Clone)]
pub struct Marker {
    pub number: u32,
    /// Where the digits start and how many there are, in characters.
    pub digits_start: usize,
    pub digits_len: usize,
    /// One past the last character of the marker ("[3]" is 3).
    pub token_end: usize,
    /// ']', '.' or ')': a list only continues in the same style.
    pub style: char,
}

/// Reads the marker at the start of a (trimmed) line, or `None`. One to three
/// digits, so a line that starts with a year is not a list item.
pub fn marker(line: &str) -> Option<Marker> {
    let chars: Vec<char> = line.chars().collect();
    let bracket = chars.first() == Some(&'[');
    let digits_start = if bracket { 1 } else { 0 };
    let mut i = digits_start;
    while i < chars.len() && chars[i].is_ascii_digit() {
        i += 1;
    }
    let digits_len = i - digits_start;
    if digits_len == 0 || digits_len > 3 {
        return None;
    }
    let number: u32 = chars[digits_start..i].iter().collect::<String>().parse().ok()?;
    if number == 0 {
        return None;
    }
    let style = match chars.get(i) {
        Some(']') if bracket => ']',
        Some('.') if !bracket => '.',
        Some(')') if !bracket => ')',
        _ => return None,
    };
    let token_end = i + 1;
    match chars.get(token_end) {
        Some(c) if c.is_whitespace() => {}
        _ => return None,
    }
    Some(Marker { number, digits_start, digits_len, token_end, style })
}

fn path_string(path: &[u32]) -> String {
    path.iter().map(|n| n.to_string()).collect::<Vec<String>>().join(".")
}

fn build(
    start: usize,
    end: usize,
    message: String,
    location: String,
    related: Span,
    repair: Repair,
) -> Issue {
    Issue {
        id: format!("numbering-{}", start),
        kind: "structure".to_string(),
        title: TITLE.to_string(),
        message,
        severity: "low".to_string(),
        location,
        start,
        end,
        related: vec![related],
        repairs: vec![repair],
        suggestion: None,
        outline: Vec::new(),
    }
}

/// Runs both checks. `lines` are the document's lines (see `text::lines`).
pub fn run(headings: &[Heading], lines: &[Line]) -> Vec<Issue> {
    let mut issues = Vec::new();

    // ---- numbered headings: compare each with the one before it at its level ----
    let numbered: Vec<(usize, HeadingNumber)> = headings
        .iter()
        .enumerate()
        .filter_map(|(index, heading)| heading_number(&heading.title).map(|n| (index, n)))
        .collect();
    for k in 0..numbered.len() {
        if issues.len() >= MAX_ISSUES {
            return issues;
        }
        let (index, current) = &numbered[k];
        let depth = current.path.len();
        let before = numbered[..k]
            .iter()
            .rev()
            .find(|(_, other)| other.path.len() == depth && other.path[..depth - 1] == current.path[..depth - 1]);
        let Some((before_index, previous)) = before else { continue };
        let a = previous.path[depth - 1];
        let b = current.path[depth - 1];
        if b == a + 1 || (depth == 1 && b == 1) {
            continue;
        }
        let heading = &headings[*index];
        let mut expected = current.path.clone();
        expected[depth - 1] = a + 1;
        let (cur, prev) = (path_string(&current.path), path_string(&previous.path));
        let message = if b == a {
            format!("Two sections are both numbered {}.", cur)
        } else if b < a {
            format!(
                "\u{201c}{}\u{201d} is numbered {}, which comes before the section above it, {}.",
                heading.title, cur, prev
            )
        } else {
            let mut first = current.path.clone();
            first[depth - 1] = a + 1;
            let mut last = current.path.clone();
            last[depth - 1] = b - 1;
            let missing = if a + 1 == b - 1 {
                format!("Section {} is missing.", path_string(&first))
            } else {
                format!("Sections {} to {} are missing.", path_string(&first), path_string(&last))
            };
            format!(
                "\u{201c}{}\u{201d} is numbered {}, but the section before it is {}. {}",
                heading.title, cur, prev, missing
            )
        };
        let earlier = &headings[*before_index];
        issues.push(build(
            heading.start,
            heading.start + current.end,
            message,
            format!("Heading \u{201c}{}\u{201d}", heading.title),
            Span { start: earlier.start, end: earlier.start + previous.end },
            Repair {
                label: format!("Number it {}", path_string(&expected)),
                start: heading.start,
                end: heading.start + current.end,
                text: path_string(&expected),
            },
        ));
    }

    // ---- typed lists: consecutive lines that start with 1. 2. 3. ----
    let mut before: Option<(Marker, usize)> = None; // the previous item and where its line starts
    for line in lines {
        if headings.iter().any(|h| h.start == line.start) {
            before = None;
            continue;
        }
        let Some(now) = marker(&line.text) else {
            before = None;
            continue;
        };
        if let Some((earlier, earlier_start)) = &before {
            if earlier.style == now.style {
                let (a, b) = (earlier.number, now.number);
                if b != a + 1 && b != 1 {
                    if issues.len() >= MAX_ISSUES {
                        return issues;
                    }
                    let message = if b == a {
                        format!("Two items in a row are both numbered {}.", b)
                    } else if b < a {
                        format!("The numbering goes back from {} to {}.", a, b)
                    } else if a + 1 == b - 1 {
                        format!("The list goes from {} to {}. Item {} is missing.", a, b, a + 1)
                    } else {
                        format!("The list goes from {} to {}. Items {} to {} are missing.", a, b, a + 1, b - 1)
                    };
                    let digits = line.start + now.digits_start;
                    issues.push(build(
                        digits,
                        line.start + now.token_end,
                        message,
                        format!("Items {} and {}", a, b),
                        Span {
                            start: earlier_start + earlier.digits_start,
                            end: earlier_start + earlier.token_end,
                        },
                        Repair {
                            label: format!("Number it {}", a + 1),
                            start: digits,
                            end: digits + now.digits_len,
                            text: (a + 1).to_string(),
                        },
                    ));
                }
            }
        }
        before = Some((now, line.start));
    }
    issues
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::text::lines;

    fn heading(title: &str, start: usize) -> Heading {
        Heading { level: 1, title: title.to_string(), start, end: start + title.chars().count() }
    }

    #[test]
    fn reads_heading_numbers() {
        assert_eq!(heading_number("3. Results").unwrap().path, vec![3]);
        assert_eq!(heading_number("2.1 Background").unwrap().path, vec![2, 1]);
        assert_eq!(heading_number("4) Methods").unwrap().path, vec![4]);
        assert!(heading_number("Results").is_none());
        assert!(heading_number("1984 was a year").is_none());
        assert!(heading_number("3.").is_none());
    }

    #[test]
    fn strips_the_number_from_a_heading() {
        assert_eq!(heading_text("3. Results"), "Results");
        assert_eq!(heading_text("Results"), "Results");
    }

    #[test]
    fn reads_list_markers() {
        assert_eq!(marker("4. Fourth").unwrap().number, 4);
        assert_eq!(marker("[12] Ref").unwrap().number, 12);
        assert!(marker("2023. A year").is_none());
        assert!(marker("3.5 million").is_none());
        assert!(marker("plain").is_none());
    }

    #[test]
    fn finds_a_skipped_heading_number() {
        let h = vec![heading("1. Introduction", 0), heading("3. Results", 20)];
        let issues = run(&h, &[]);
        assert_eq!(issues.len(), 1);
        assert!(issues[0].message.contains("Section 2 is missing"));
        assert_eq!(issues[0].repairs[0].text, "2");
    }

    #[test]
    fn subsections_are_compared_within_their_parent() {
        let h = vec![
            heading("1. A", 0),
            heading("1.1 B", 10),
            heading("2. C", 20),
            heading("2.1 D", 30),
            heading("2.3 E", 40),
        ];
        let issues = run(&h, &[]);
        assert_eq!(issues.len(), 1);
        assert!(issues[0].message.contains("Section 2.2 is missing"));
    }

    #[test]
    fn a_fresh_start_at_one_is_not_a_gap() {
        let h = vec![heading("1. A", 0), heading("2. B", 10), heading("1. Appendix", 20)];
        assert!(run(&h, &[]).is_empty());
    }

    #[test]
    fn finds_a_gap_in_a_typed_list() {
        let text = "1. First\n2. Second\n4. Fourth\n5. Fifth";
        let issues = run(&[], &lines(text));
        assert_eq!(issues.len(), 1);
        assert!(issues[0].message.contains("Item 3 is missing"));
        assert_eq!(&text[issues[0].start..issues[0].end], "4.");
    }

    #[test]
    fn a_repeated_and_a_backwards_number() {
        let repeated = run(&[], &lines("1. A\n2. B\n2. C"));
        assert!(repeated[0].message.contains("both numbered 2"));
        let backwards = run(&[], &lines("1. A\n2. B\n3. C\n2. D"));
        assert!(backwards[0].message.contains("goes back from 3 to 2"));
    }

    #[test]
    fn a_line_between_items_ends_the_list() {
        assert!(run(&[], &lines("1. A\nSome other text.\n3. C")).is_empty());
    }
}
