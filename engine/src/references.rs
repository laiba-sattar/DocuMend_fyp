//! references.rs — checks on the reference list and the citations that point at it.
//!
//! The reference list is the section headed "References", "Bibliography",
//! "Works Cited" and so on; each line in it is one reference. Three checks:
//!
//!   * a reference with no year in it
//!   * a numbered citation ("[5]", "[2, 4]", "[3-6]") in the text that has no
//!     reference with that number
//!   * a numbered reference that nothing in the text cites
//!
//! Everything here is rule-based; nothing is looked up online, so it works with
//! no connection. Positions are UTF-16 offsets, as everywhere in the engine.

use crate::numbering::{heading_text, marker, Marker};
use crate::rules::{Issue, Span};
use crate::structure::Heading;
use crate::text::Line;

const MAX_ISSUES: usize = 40;

/// Headings that mean "the reference list".
const HEADING_NAMES: &[&str] = &[
    "references",
    "reference",
    "reference list",
    "bibliography",
    "works cited",
    "citations",
    "sources",
];

pub(crate) fn is_references(title: &str) -> bool {
    let name = heading_text(title).to_lowercase();
    HEADING_NAMES.contains(&name.trim_end_matches(':').trim())
}

/// Does this reference give a year (1500-2099), or say "n.d." (no date)?
pub(crate) fn has_year(text: &str) -> bool {
    if text.to_lowercase().contains("n.d.") {
        return true;
    }
    let chars: Vec<char> = text.chars().collect();
    let mut i = 0usize;
    while i < chars.len() {
        if !chars[i].is_ascii_digit() {
            i += 1;
            continue;
        }
        let start = i;
        while i < chars.len() && chars[i].is_ascii_digit() {
            i += 1;
        }
        if i - start == 4 && (start == 0 || !chars[start - 1].is_alphanumeric()) {
            let value: u32 = chars[start..i].iter().collect::<String>().parse().unwrap_or(0);
            if (1500..=2099).contains(&value) {
                return true;
            }
        }
    }
    false
}

pub(crate) struct Citation {
    pub number: u32,
    pub start: usize,
    pub end: usize,
}

/// "2, 4" is 2 and 4; "3-6" is 3, 4, 5 and 6. Anything else is ignored.
fn expand(inner: &str) -> Vec<u32> {
    let mut out = Vec::new();
    for part in inner.split(',') {
        let pieces: Vec<&str> = part.trim().split(|c| c == '-' || c == '\u{2013}').map(|s| s.trim()).collect();
        match pieces.as_slice() {
            [one] => {
                if let Ok(n) = one.parse::<u32>() {
                    if (1..=999).contains(&n) {
                        out.push(n);
                    }
                }
            }
            [from, to] => {
                if let (Ok(a), Ok(b)) = (from.parse::<u32>(), to.parse::<u32>()) {
                    if a >= 1 && b >= a && b <= 999 && b - a <= 100 {
                        out.extend(a..=b);
                    }
                }
            }
            _ => {}
        }
    }
    out
}

/// Every "[5]"-style citation on one line.
pub(crate) fn citations_in(line: &Line) -> Vec<Citation> {
    let chars: Vec<char> = line.text.chars().collect();
    let mut at: Vec<usize> = Vec::with_capacity(chars.len() + 1);
    let mut position = line.start;
    for c in &chars {
        at.push(position);
        position += c.len_utf16();
    }
    at.push(position);

    let mut found = Vec::new();
    let mut i = 0usize;
    while i < chars.len() {
        if chars[i] != '[' {
            i += 1;
            continue;
        }
        let mut j = i + 1;
        while j < chars.len()
            && j - i <= 40
            && (chars[j].is_ascii_digit() || matches!(chars[j], ' ' | ',' | '-' | '\u{2013}'))
        {
            j += 1;
        }
        if j < chars.len() && chars[j] == ']' && j > i + 1 {
            let inner: String = chars[i + 1..j].iter().collect();
            if inner.chars().any(|c| c.is_ascii_digit()) {
                for number in expand(&inner) {
                    found.push(Citation { number, start: at[i], end: at[j + 1] });
                }
                i = j + 1;
                continue;
            }
        }
        i += 1;
    }
    found
}

pub(crate) fn issue(id: String, title: &str, message: String, severity: &str, location: String, start: usize, end: usize) -> Issue {
    Issue {
        id,
        kind: "citation".to_string(),
        title: title.to_string(),
        message,
        severity: severity.to_string(),
        location,
        start,
        end,
        related: Vec::<Span>::new(),
        repairs: Vec::new(),
        suggestion: None,
        outline: Vec::new(),
    }
}

/// The reference list: its heading, where it starts and ends, and one entry per line.
pub(crate) struct ReferenceList<'a> {
    pub heading: &'a Heading,
    start: usize,
    end: usize,
    pub entries: Vec<(&'a Line, Option<Marker>)>,
}

impl ReferenceList<'_> {
    pub fn contains(&self, line: &Line) -> bool {
        line.start >= self.start && line.start < self.end
    }
}

/// Finds the reference list, or `None` when the document has no such heading.
pub(crate) fn find_list<'a>(document_len: usize, headings: &'a [Heading], lines: &'a [Line]) -> Option<ReferenceList<'a>> {
    let position = headings.iter().position(|h| is_references(&h.title))?;
    let start = headings[position].end;
    let end = headings.get(position + 1).map(|h| h.start).unwrap_or(document_len);
    let entries = lines
        .iter()
        .filter(|line| line.start >= start && line.start < end && !headings.iter().any(|h| h.start == line.start))
        .map(|line| (line, marker(&line.text)))
        .collect();
    Some(ReferenceList { heading: &headings[position], start, end, entries })
}

/// Every numbered citation in the text outside the reference list, in reading order.
pub(crate) fn body_citations(list: &ReferenceList, headings: &[Heading], lines: &[Line]) -> Vec<Citation> {
    lines
        .iter()
        .filter(|line| !list.contains(line) && !headings.iter().any(|h| h.start == line.start))
        .flat_map(citations_in)
        .collect()
}

/// Runs the three checks. `document_len` is the text's length in UTF-16 units.
pub fn run(document_len: usize, headings: &[Heading], lines: &[Line]) -> Vec<Issue> {
    let mut issues = Vec::new();
    let Some(list) = find_list(document_len, headings, lines) else {
        return issues;
    };
    let entries = &list.entries;

    // 1. a reference with no year
    for (line, mark) in entries {
        if issues.len() >= MAX_ISSUES {
            return issues;
        }
        if line.text.split_whitespace().count() < 3 || has_year(&line.text) {
            continue;
        }
        let location = match mark {
            Some(m) => format!("Reference {}", m.number),
            None => "Reference list".to_string(),
        };
        issues.push(issue(
            format!("reference-year-{}", line.start),
            "Reference has no year",
            "This reference does not give a year, so a reader cannot tell which edition or date it means.".to_string(),
            "medium",
            location,
            line.start,
            line.end,
        ));
    }

    // Numbered references, and the citations in the body that should point at them.
    let listed: Vec<(u32, &Line, &Marker)> = entries
        .iter()
        .filter_map(|(line, mark)| mark.as_ref().map(|m| (m.number, *line, m)))
        .collect();
    if listed.is_empty() {
        return issues;
    }
    let cited = body_citations(&list, headings, lines);

    // 2. a citation with no matching reference
    let mut reported: Vec<u32> = Vec::new();
    for citation in &cited {
        if issues.len() >= MAX_ISSUES {
            return issues;
        }
        if listed.iter().any(|(n, _, _)| *n == citation.number) || reported.contains(&citation.number) {
            continue;
        }
        reported.push(citation.number);
        issues.push(issue(
            format!("citation-missing-{}", citation.start),
            "Citation has no matching reference",
            format!("Citation [{}] points at a reference that is not in the list.", citation.number),
            "medium",
            format!("Citation [{}]", citation.number),
            citation.start,
            citation.end,
        ));
    }

    // 3. a numbered reference that nothing cites (only when the text cites by number at all)
    if !cited.is_empty() {
        for (number, line, mark) in &listed {
            if issues.len() >= MAX_ISSUES {
                return issues;
            }
            if cited.iter().any(|c| c.number == *number) {
                continue;
            }
            issues.push(issue(
                format!("reference-uncited-{}", line.start),
                "Reference is never cited",
                format!("Reference [{}] is not cited anywhere in the text.", number),
                "low",
                format!("Reference {}", number),
                line.start,
                line.start + mark.token_end,
            ));
        }
    }
    issues
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::text::lines;

    fn run_on(text: &str, headings: &[Heading]) -> Vec<Issue> {
        let len = text.chars().map(|c| c.len_utf16()).sum();
        run(len, headings, &lines(text))
    }

    fn references_heading(text: &str) -> Heading {
        let start = text.find("References").unwrap();
        Heading { level: 1, title: "References".to_string(), start, end: start + "References".len() }
    }

    #[test]
    fn recognises_the_reference_list_heading() {
        assert!(is_references("References"));
        assert!(is_references("6. Bibliography:"));
        assert!(is_references("Works Cited"));
        assert!(!is_references("Results"));
    }

    #[test]
    fn finds_years() {
        assert!(has_year("Smith, J. (2020). A title. Journal."));
        assert!(has_year("Smith, J. (n.d.). A page."));
        assert!(has_year("Doe, A., 2019a. Notes."));
        assert!(!has_year("Smith, J. A title. Journal, pp. 185-200."));
        assert!(!has_year("Order 1234567 filed"));
    }

    #[test]
    fn expands_citation_groups() {
        assert_eq!(expand("2, 4"), vec![2, 4]);
        assert_eq!(expand("3-5"), vec![3, 4, 5]);
        assert_eq!(expand("3\u{2013}4"), vec![3, 4]);
        assert!(expand("a").is_empty());
    }

    #[test]
    fn flags_a_reference_with_no_year() {
        let text = "Body.\nReferences\n[1] Smith, J. A study of things. Journal of Stuff.";
        let issues = run_on(text, &[references_heading(text)]);
        assert!(issues.iter().any(|i| i.title == "Reference has no year"));
    }

    #[test]
    fn flags_a_citation_with_no_reference_and_an_uncited_reference() {
        let text = "As shown [1] and [4].\nReferences\n[1] A. Author, Title, 2020.\n[2] B. Writer, Other, 2019.";
        let issues = run_on(text, &[references_heading(text)]);
        let titles: Vec<&str> = issues.iter().map(|i| i.title.as_str()).collect();
        assert!(titles.contains(&"Citation has no matching reference"));
        assert!(titles.contains(&"Reference is never cited"));
        let missing = issues.iter().find(|i| i.title == "Citation has no matching reference").unwrap();
        assert!(missing.message.contains("[4]"));
        assert_eq!(&text[missing.start..missing.end], "[4]");
    }

    #[test]
    fn a_complete_list_is_quiet() {
        let text = "See [1, 2].\nReferences\n[1] A. Author, Title, 2020.\n[2] B. Writer, Other, 2019.";
        assert!(run_on(text, &[references_heading(text)]).is_empty());
    }

    #[test]
    fn no_reference_heading_means_no_checks() {
        assert!(run_on("Cited [9] here.", &[]).is_empty());
    }
}
