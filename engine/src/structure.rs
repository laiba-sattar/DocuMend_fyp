//! structure.rs — checks about the shape of a document, not its sentences.
//!
//! The editor sends the document's headings along with the text (one heading
//! per line: `level<TAB>start<TAB>end<TAB>title`), plus the document's type
//! ("Thesis", "Report"…). From those this module answers three questions:
//!
//!   * Does this kind of document usually have a section that is missing here?
//!   * Is there a heading with nothing written under it?
//!   * Does the outline jump a level (a sub-sub-heading straight after a title)?
//!
//! Positions are UTF-16 offsets, the same as everywhere else in the engine.

use crate::rules::{Issue, Repair, Span, Suggestion};

/// One heading of the document.
#[derive(Debug, Clone, PartialEq)]
pub struct Heading {
    pub level: u8,
    pub title: String,
    pub start: usize,
    pub end: usize,
}

/// A section a template expects, with the words that count as "this section".
struct Section {
    name: &'static str,
    keywords: &'static [&'static str],
}

const fn section(name: &'static str, keywords: &'static [&'static str]) -> Section {
    Section { name, keywords }
}

const THESIS: &[Section] = &[
    section("Abstract", &["abstract", "summary"]),
    section("Introduction", &["introduction", "overview"]),
    section("Literature Review", &["literature", "related work", "background"]),
    section("Methodology", &["methodology", "method", "methods", "approach"]),
    section("Results", &["result", "results", "findings", "evaluation"]),
    section("Discussion", &["discussion", "analysis"]),
    section("Conclusion", &["conclusion", "conclusions"]),
    section("References", &["reference", "references", "bibliography"]),
];

const RESEARCH_PAPER: &[Section] = &[
    section("Abstract", &["abstract", "summary"]),
    section("Introduction", &["introduction"]),
    section("Related Work", &["related work", "literature", "background"]),
    section("Method", &["method", "methods", "methodology", "approach"]),
    section("Results", &["result", "results", "experiment", "evaluation"]),
    section("Discussion", &["discussion", "analysis"]),
    section("Conclusion", &["conclusion", "conclusions"]),
    section("References", &["reference", "references", "bibliography"]),
];

const REPORT: &[Section] = &[
    section("Introduction", &["introduction", "overview", "purpose"]),
    section("Background", &["background", "context"]),
    section("Findings", &["finding", "findings", "result", "results", "analysis"]),
    section("Recommendations", &["recommendation", "recommendations", "next steps"]),
    section("Conclusion", &["conclusion", "conclusions", "summary"]),
];

const LEGAL: &[Section] = &[
    section("Parties", &["parties", "party", "between"]),
    section("Definitions", &["definition", "definitions", "interpretation"]),
    section("Scope", &["scope", "services", "purpose"]),
    section("Obligations", &["obligation", "obligations", "responsibilities", "duties"]),
    section("Termination", &["termination", "term"]),
    section("Governing Law", &["governing law", "jurisdiction", "dispute"]),
];

/// The sections a document of this type usually has. Empty when we have no template.
fn template_for(kind: &str) -> &'static [Section] {
    match kind.trim().to_lowercase().as_str() {
        "thesis" => THESIS,
        "research paper" | "paper" => RESEARCH_PAPER,
        "report" => REPORT,
        "legal" => LEGAL,
        _ => &[],
    }
}

/// Reads the outline the editor sent: `level<TAB>start<TAB>end<TAB>title` per line.
pub fn parse_outline(raw: &str) -> Vec<Heading> {
    raw.lines()
        .filter_map(|line| {
            let mut parts = line.splitn(4, '\t');
            let level: u8 = parts.next()?.trim().parse().ok()?;
            let start: usize = parts.next()?.trim().parse().ok()?;
            let end: usize = parts.next()?.trim().parse().ok()?;
            let title = parts.next().unwrap_or("").trim().to_string();
            if end <= start {
                return None;
            }
            Some(Heading { level: level.clamp(1, 6), title, start, end })
        })
        .collect()
}

/// Is any of these words in the heading?
fn mentions(heading: &str, keywords: &[&str]) -> bool {
    let lower = heading.to_lowercase();
    keywords.iter().any(|word| lower.contains(word))
}

/// The "3." or "4.1 " a heading starts with, so renaming keeps the numbering.
fn numbering_prefix(title: &str) -> String {
    let prefix: String = title
        .chars()
        .take_while(|c| c.is_ascii_digit() || *c == '.' || *c == ' ' || *c == ')')
        .collect();
    if prefix.chars().any(|c| c.is_ascii_digit()) {
        let trimmed = prefix.trim_end();
        format!("{} ", trimmed)
    } else {
        String::new()
    }
}

/// How much writing sits between each heading and the next one.
/// Returns, for every heading, whether its section has any text at all.
fn sections_have_text(text: &str, headings: &[Heading]) -> Vec<bool> {
    let mut filled = vec![false; headings.len()];
    if headings.is_empty() {
        return filled;
    }
    // The gap after heading i runs from its end to the next heading's start.
    let gaps: Vec<(usize, usize)> = headings
        .iter()
        .enumerate()
        .map(|(index, heading)| {
            let next = headings.get(index + 1).map(|h| h.start).unwrap_or(usize::MAX);
            (heading.end, next)
        })
        .collect();

    let mut gap = 0usize;
    let mut position = 0usize; // UTF-16 offset of the current character
    for c in text.chars() {
        while gap < gaps.len() && position >= gaps[gap].1 {
            gap += 1;
        }
        if gap >= gaps.len() {
            break;
        }
        if position >= gaps[gap].0 && !c.is_whitespace() {
            filled[gap] = true;
            gap += 1; // this section has text; move on to the next one
            continue;
        }
        position += c.len_utf16();
    }
    filled
}

/// The end of the document's first word, in UTF-16 units. The "no headings"
/// issue has no single place to point at, so it points at the opening word
/// rather than at nothing — a zero-width highlight draws as an empty box.
fn first_word_end(text: &str) -> usize {
    let mut position = 0usize;
    let mut seen_letter = false;
    for c in text.chars() {
        if c.is_whitespace() {
            if seen_letter {
                return position;
            }
        } else {
            seen_letter = true;
        }
        position += c.len_utf16();
        if position >= 40 {
            return position;
        }
    }
    position
}

/// Runs the structure checks. `kind` is the document's type from the Create screen.
pub fn run(text: &str, headings: &[Heading], kind: &str) -> Vec<Issue> {
    let mut issues = Vec::new();

    // 0. No headings at all.
    //
    // This used to return nothing, which was exactly backwards: a page with no
    // headings is the moment a writer most needs the shape of the document
    // spelled out, and the checks below all need at least one heading before
    // they can say anything. So the one thing worth saying here is the whole
    // outline, offered in a single click rather than eight.
    //
    // It waits for a little writing first (40 words). Nagging an empty page
    // the moment it opens would be noise, not help.
    if headings.is_empty() {
        let template = template_for(kind);
        let words = text.split_whitespace().count();
        if !template.is_empty() && words >= 40 {
            let names: Vec<&str> = template.iter().map(|section| section.name).collect();
            issues.push(Issue {
                id: "outline-missing".to_string(),
                kind: "structure".to_string(),
                title: "No headings yet".to_string(),
                message: format!(
                    "This document has no headings, so nothing about its structure can be checked. \
                     A {} usually has {} sections: {}.",
                    kind.to_lowercase(),
                    names.len(),
                    names.join(", ")
                ),
                severity: "medium".to_string(),
                location: "Whole document".to_string(),
                start: 0,
                end: first_word_end(text),
                related: Vec::new(),
                repairs: Vec::new(),
                suggestion: None,
                outline: template
                    .iter()
                    .map(|section| Suggestion { title: section.name.to_string(), level: 1 })
                    .collect(),
            });
        }
        return issues;
    }

    let last = &headings[headings.len() - 1];
    let body_level = headings.iter().map(|h| h.level).max().unwrap_or(2).min(3);

    // 1. Sections this kind of document usually has.
    let template = template_for(kind);
    if headings.len() >= 2 {
        for wanted in template {
            // A heading may use a different word for the same section
            // ("Findings" for Results, "Summary" for Abstract).
            if let Some(found) = headings.iter().find(|h| mentions(&h.title, wanted.keywords)) {
                let standard = wanted.name.to_lowercase();
                if !found.title.to_lowercase().contains(&standard) {
                    let renamed = format!("{}{}", numbering_prefix(&found.title), wanted.name);
                    issues.push(Issue {
                        id: format!("rename-{}", found.start),
                        kind: "structure".to_string(),
                        title: "A more standard name".to_string(),
                        message: format!(
                            "“{}” is where a {} usually puts “{}”. Renaming it keeps the outline standard.",
                            found.title,
                            kind.to_lowercase(),
                            wanted.name
                        ),
                        severity: "low".to_string(),
                        location: format!("Heading “{}”", found.title),
                        start: found.start,
                        end: found.end,
                        related: Vec::new(),
                        repairs: vec![Repair {
                            label: format!("Rename to “{}”", wanted.name),
                            start: found.start,
                            end: found.end,
                            text: renamed,
                        }],
                        suggestion: None,
                        outline: Vec::new(),
                    });
                }
                continue;
            }
            issues.push(Issue {
                id: format!("missing-{}", wanted.name.to_lowercase().replace(' ', "-")),
                kind: "structure".to_string(),
                title: format!("“{}” section is missing", wanted.name),
                message: format!(
                    "A {} usually includes “{}”. This document has no heading for it.",
                    kind.to_lowercase(),
                    wanted.name
                ),
                severity: "medium".to_string(),
                location: format!("{} headings so far", headings.len()),
                start: last.start,
                end: last.end,
                related: Vec::new(),
                repairs: Vec::new(),
                suggestion: Some(Suggestion {
                    title: wanted.name.to_string(),
                    level: body_level.max(1),
                }),
                outline: Vec::new(),
            });
        }
    }

    // 2. Headings with nothing written under them.
    let filled = sections_have_text(text, headings);
    for (index, heading) in headings.iter().enumerate() {
        if filled[index] {
            continue;
        }
        // A heading directly above a deeper heading is a parent, not an empty section.
        if headings.get(index + 1).map(|next| next.level > heading.level).unwrap_or(false) {
            continue;
        }
        issues.push(Issue {
            id: format!("empty-{}", heading.start),
            kind: "structure".to_string(),
            title: "Section has no text".to_string(),
            message: format!("“{}” has a heading but nothing written under it yet.", heading.title),
            severity: "low".to_string(),
            location: format!("Heading “{}”", heading.title),
            start: heading.start,
            end: heading.end,
            related: Vec::new(),
            repairs: Vec::new(),
            suggestion: None,
            outline: Vec::new(),
        });
    }

    // 3. A heading level that jumps (Heading 1 straight to Heading 3).
    for pair in headings.windows(2) {
        let (before, after) = (&pair[0], &pair[1]);
        if after.level > before.level + 1 {
            issues.push(Issue {
                id: format!("level-{}", after.start),
                kind: "structure".to_string(),
                title: "Heading level skipped".to_string(),
                message: format!(
                    "“{}” is a Heading {} directly under a Heading {}. Use Heading {} so the outline stays in order.",
                    after.title, after.level, before.level, before.level + 1
                ),
                severity: "low".to_string(),
                location: format!("Heading “{}”", after.title),
                start: after.start,
                end: after.end,
                related: vec![Span { start: before.start, end: before.end }],
                repairs: Vec::new(),
                suggestion: None,
                outline: Vec::new(),
            });
        }
    }

    // 4. The same heading twice.
    for (index, heading) in headings.iter().enumerate() {
        if heading.title.trim().is_empty() {
            continue;
        }
        let earlier = headings[..index]
            .iter()
            .find(|other| other.title.trim().eq_ignore_ascii_case(heading.title.trim()));
        if let Some(other) = earlier {
            issues.push(Issue {
                id: format!("duplicate-{}", heading.start),
                kind: "structure".to_string(),
                title: "Two sections share a name".to_string(),
                message: format!("“{}” is used as a heading twice. Rename one of them.", heading.title),
                severity: "low".to_string(),
                location: format!("Heading “{}”", heading.title),
                start: heading.start,
                end: heading.end,
                related: vec![Span { start: other.start, end: other.end }],
                repairs: Vec::new(),
                suggestion: None,
                outline: Vec::new(),
            });
        }
    }

    issues
}

#[cfg(test)]
mod tests {
    use super::*;

    fn outline(lines: &[(&str, u8, usize, usize)]) -> Vec<Heading> {
        lines
            .iter()
            .map(|(title, level, start, end)| Heading {
                level: *level,
                title: title.to_string(),
                start: *start,
                end: *end,
            })
            .collect()
    }

    #[test]
    fn reads_the_outline_the_editor_sends() {
        let list = parse_outline("1\t0\t12\tIntroduction\n2\t40\t51\tMethodology\n");
        assert_eq!(list.len(), 2);
        assert_eq!(list[1].title, "Methodology");
        assert_eq!(list[1].start, 40);
    }

    #[test]
    fn reports_a_missing_thesis_section() {
        let headings = outline(&[("Introduction", 1, 0, 12), ("Results", 1, 30, 37)]);
        let text = "Introduction\nSome text here.\nResults\nMore text here.";
        let issues = run(text, &headings, "Thesis");
        let titles: Vec<&str> = issues.iter().map(|i| i.title.as_str()).collect();
        assert!(titles.iter().any(|t| t.contains("Methodology")));
        assert!(titles.iter().any(|t| t.contains("References")));
    }

    #[test]
    fn a_heading_that_says_research_methodology_counts() {
        let headings = outline(&[("Introduction", 1, 0, 12), ("3. Research Methodology", 1, 30, 53)]);
        let text = "Introduction\nSome text.\n3. Research Methodology\nMore text.";
        let issues = run(text, &headings, "Thesis");
        assert!(!issues.iter().any(|i| i.title.contains("Methodology")));
    }

    #[test]
    fn suggests_the_standard_name_for_a_synonym() {
        let headings = outline(&[("Introduction", 1, 0, 12), ("4. Findings", 1, 30, 41)]);
        let text = "Introduction\nSome text.\n4. Findings\nMore text.";
        let issues = run(text, &headings, "Thesis");
        let rename = issues
            .iter()
            .find(|i| i.title == "A more standard name")
            .expect("“Findings” should suggest “Results”");
        assert_eq!(rename.repairs[0].text, "4. Results");
        // …and Results is no longer reported as missing.
        assert!(!issues.iter().any(|i| i.title.contains("“Results”") && i.title.contains("missing")));
    }

    #[test]
    fn the_standard_name_itself_is_never_flagged() {
        let headings = outline(&[("Introduction", 1, 0, 12), ("Results", 1, 30, 37)]);
        let text = "Introduction\nSome text.\nResults\nMore text.";
        let issues = run(text, &headings, "Thesis");
        assert!(!issues.iter().any(|i| i.title == "A more standard name"));
    }

    #[test]
    fn no_template_means_no_missing_sections() {
        let headings = outline(&[("Notes", 1, 0, 5), ("More", 1, 20, 24)]);
        let text = "Notes\nSomething written.\nMore\nAlso written.";
        let issues = run(text, &headings, "Other");
        assert!(issues.iter().all(|i| i.title != "“Abstract” section is missing"));
    }

    #[test]
    fn finds_an_empty_section() {
        //            0123456789012 3456789012345678 90123456789
        let text = "Introduction\nSome text here.\nMethodology\n";
        let headings = outline(&[("Introduction", 1, 0, 12), ("Methodology", 1, 29, 40)]);
        let issues = run(text, &headings, "Other");
        assert_eq!(issues.len(), 1);
        assert_eq!(issues[0].title, "Section has no text");
        assert!(issues[0].message.contains("Methodology"));
    }

    #[test]
    fn a_parent_heading_is_not_empty() {
        let text = "Results\nAccuracy\nThe model reached 92%.";
        let headings = outline(&[("Results", 1, 0, 7), ("Accuracy", 2, 8, 16)]);
        let issues = run(text, &headings, "Other");
        assert!(issues.is_empty());
    }

    #[test]
    fn catches_a_skipped_heading_level() {
        let text = "Results\nDetails\nSome writing here.";
        let headings = outline(&[("Results", 1, 0, 7), ("Details", 3, 8, 15)]);
        let issues = run(text, &headings, "Other");
        assert!(issues.iter().any(|i| i.title == "Heading level skipped"));
    }

    #[test]
    fn catches_a_repeated_heading() {
        let text = "Results\nFirst part.\nResults\nSecond part.";
        let headings = outline(&[("Results", 1, 0, 7), ("Results", 1, 20, 27)]);
        let issues = run(text, &headings, "Other");
        assert!(issues.iter().any(|i| i.title == "Two sections share a name"));
    }

    #[test]
    fn offers_the_whole_outline_when_there_are_no_headings() {
        let text = "This study looks at how students write long documents and where the structure \
                    tends to break down under pressure. We interviewed twenty students across three \
                    separate departments and collected the drafts that each of them was working on \
                    at the time, then read every one of them closely.";
        let issues = run(text, &[], "Thesis");
        let issue = issues.iter().find(|i| i.title == "No headings yet").expect("should offer an outline");
        assert_eq!(issue.outline.len(), 8);
        assert_eq!(issue.outline[0].title, "Abstract");
        assert!(issue.message.contains("Methodology"));
        assert!(issue.end > issue.start, "the highlight needs somewhere to land");
    }

    #[test]
    fn stays_quiet_on_a_page_barely_started() {
        // Three words in is too early to be told how a thesis is shaped.
        let issues = run("Chapter one draft", &[], "Thesis");
        assert!(issues.is_empty());
    }

    #[test]
    fn stays_quiet_when_the_kind_has_no_template() {
        let text = "This study looks at how students write long documents and where the structure \
                    tends to break down under pressure. We interviewed twenty students across three \
                    separate departments and collected the drafts that each of them was working on \
                    at the time, then read every one of them closely.";
        assert!(run(text, &[], "Other").is_empty());
    }
}
