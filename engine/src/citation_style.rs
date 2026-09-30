//! citation_style.rs — does the reference list follow the style the writer chose?
//!
//! The writer picks APA, MLA or IEEE for the document. This module then reads
//! the reference list the way that style expects it and says, for each entry,
//! what is missing and how to fix it, with an example of the right form:
//!
//!   * each entry's shape (author form, year, title, ending)
//!   * the order of the list (alphabetical for APA and MLA; the order of first
//!     citation for IEEE)
//!   * the list's name ("References" or "Works Cited")
//!   * author-year citations in the text ("(Smith, 2020)") against the entries
//!
//! It is rule-based and works offline. It cannot see italics (the engine reads
//! plain text), so a book title without quotation marks is not an error to it.
//! Positions are UTF-16 offsets, as everywhere in the engine.

use crate::numbering::{heading_text, Marker};
use crate::references::{body_citations, find_list, has_year, issue, ReferenceList};
use crate::rules::Issue;
use crate::structure::Heading;
use crate::text::Line;

const MAX_ISSUES: usize = 40;

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Style {
    Apa,
    Mla,
    Ieee,
}

impl Style {
    /// "APA", "mla" or "IEEE" (any case). Anything else means no style chosen.
    pub fn parse(name: &str) -> Option<Style> {
        match name.trim().to_lowercase().as_str() {
            "apa" => Some(Style::Apa),
            "mla" => Some(Style::Mla),
            "ieee" => Some(Style::Ieee),
            _ => None,
        }
    }

    fn name(self) -> &'static str {
        match self {
            Style::Apa => "APA",
            Style::Mla => "MLA",
            Style::Ieee => "IEEE",
        }
    }

    fn list_name(self) -> &'static str {
        match self {
            Style::Mla => "Works Cited",
            _ => "References",
        }
    }

    fn example(self) -> &'static str {
        match self {
            Style::Apa => "Author, A. A. (2020). Article title. Journal Name, 3(2), 10-20.",
            Style::Mla => "Author, Firstname. \"Article Title.\" Journal Name, vol. 3, no. 2, 2020, pp. 10-20.",
            Style::Ieee => "[1] A. Author, \"Article title,\" Journal Name, vol. 3, no. 2, pp. 10-20, 2020.",
        }
    }
}

/* ---------------------------------------------------------------------------
   Small readers for one entry. All of them work on the entry's own text.
   ------------------------------------------------------------------------- */

/// Ends with a full stop, or with a link or DOI (which take none).
fn ends_properly(text: &str) -> bool {
    let trimmed = text.trim_end();
    if trimmed.ends_with('.') {
        return true;
    }
    let last = trimmed.split_whitespace().last().unwrap_or("");
    last.contains("://") || last.to_lowercase().starts_with("doi")
}

/// "A. Author" or "J. K. Rowling": initials first, then the surname.
fn initials_first(text: &str) -> bool {
    let chars: Vec<char> = text.chars().collect();
    let mut i = 0usize;
    let mut initials = 0usize;
    while i + 1 < chars.len() && chars[i].is_uppercase() && chars[i + 1] == '.' {
        initials += 1;
        i += 2;
        while i < chars.len() && chars[i] == ' ' {
            i += 1;
        }
    }
    initials >= 1 && i < chars.len() && chars[i].is_uppercase()
}

/// "Smith, J." (APA: initials only) or "Smith, John" (MLA): surname, comma, first name.
fn surname_first(text: &str, initials_only: bool) -> bool {
    let chars: Vec<char> = text.chars().collect();
    if !chars.first().map(|c| c.is_uppercase()).unwrap_or(false) {
        return false;
    }
    let mut i = 0usize;
    while i < chars.len() && (chars[i].is_alphabetic() || matches!(chars[i], '\'' | '\u{2019}' | '-' | ' ')) {
        i += 1;
    }
    if chars.get(i) != Some(&',') || chars.get(i + 1) != Some(&' ') {
        return false;
    }
    let name = i + 2;
    match chars.get(name) {
        Some(c) if c.is_uppercase() => !initials_only || chars.get(name + 1) == Some(&'.'),
        _ => false,
    }
}

/// No comma before the first sentence, so it reads as an organisation or a
/// title standing in for an author ("World Health Organization. (2020)…").
fn organisation_or_title_first(text: &str) -> bool {
    let head = match text.find(". ") {
        Some(position) => &text[..position],
        None => text,
    };
    !head.contains(',')
}

/// A title inside quotation marks, straight or curly.
fn has_quoted_title(text: &str) -> bool {
    let chars: Vec<char> = text.chars().collect();
    let Some(open) = chars.iter().position(|c| matches!(c, '"' | '\u{201c}')) else {
        return false;
    };
    chars.iter().skip(open + 4).any(|c| matches!(c, '"' | '\u{201d}'))
}

/// The "(2020)" after the authors: the index of "(" and of ")", or `None`.
fn year_in_parentheses(chars: &[char]) -> Option<(usize, usize)> {
    let mut i = 0usize;
    while i < chars.len() {
        if chars[i] == '(' {
            let rest: String = chars[i + 1..].iter().take(5).collect();
            if rest.to_lowercase() == "n.d.)" {
                return Some((i, i + 5));
            }
            if i + 5 < chars.len() && chars[i + 1..i + 5].iter().all(|c| c.is_ascii_digit()) {
                let year: u32 = chars[i + 1..i + 5].iter().collect::<String>().parse().unwrap_or(0);
                if (1500..=2099).contains(&year) {
                    let mut k = i + 5;
                    if k < chars.len() && chars[k].is_ascii_lowercase() {
                        k += 1;
                    }
                    if k < chars.len() && (chars[k] == ')' || chars[k] == ',') {
                        return (k..chars.len()).find(|&x| chars[x] == ')').map(|close| (i, close));
                    }
                }
            }
        }
        i += 1;
    }
    None
}

/// The text after an entry's own number, or the whole text when it has none.
fn without_marker(text: &str, mark: &Option<Marker>) -> String {
    match mark {
        Some(m) => text.chars().skip(m.token_end).collect::<String>().trim().to_string(),
        None => text.to_string(),
    }
}

/// The name an entry is sorted under (its first author's surname), as written and in lower case.
fn sort_name(body: &str) -> (String, String) {
    let name: String = body
        .chars()
        .take_while(|c| !matches!(c, ',' | '.' | '(' | '"'))
        .collect::<String>()
        .trim()
        .to_string();
    let lower = name.to_lowercase();
    (name, lower)
}

/// A short piece of an entry, for naming it in the review panel.
fn snippet(text: &str) -> String {
    let short: String = text.chars().take(24).collect();
    if text.chars().count() > 24 {
        format!("{}\u{2026}", short)
    } else {
        short
    }
}

fn entry_location(mark: &Option<Marker>, text: &str) -> String {
    match mark {
        Some(m) => format!("Reference {}", m.number),
        None => format!("Reference \u{201c}{}\u{201d}", snippet(text)),
    }
}

/* ---------------------------------------------------------------------------
   What each style asks of one entry. Each piece is something to do.
   ------------------------------------------------------------------------- */

fn apa_pieces(body: &str, numbered: bool) -> Vec<String> {
    let mut pieces = Vec::new();
    if numbered {
        pieces.push("remove the number: APA lists references alphabetically, without numbers".to_string());
    }
    if !surname_first(body, true) && !organisation_or_title_first(body) {
        pieces.push("write the first author as surname, comma, initials (Author, A. A.)".to_string());
    }
    let chars: Vec<char> = body.chars().collect();
    match year_in_parentheses(&chars) {
        Some((open, close)) => {
            let authors: String = chars[..open].iter().collect();
            if authors.contains(" and ") {
                pieces.push("join the last two authors with &, not \"and\"".to_string());
            }
            let next = chars[close + 1..].iter().find(|c| !c.is_whitespace());
            if next != Some(&'.') {
                pieces.push("put a full stop after the year in brackets: (2020)".to_string());
            }
        }
        None => {
            if has_year(body) {
                pieces.push("put the year in parentheses right after the authors, like (2020)".to_string());
            }
        }
    }
    if !ends_properly(body) {
        pieces.push("end the entry with a full stop (or a DOI or link)".to_string());
    }
    pieces
}

fn mla_pieces(body: &str, numbered: bool) -> Vec<String> {
    let mut pieces = Vec::new();
    if numbered {
        pieces.push("remove the number: MLA lists works alphabetically, without numbers".to_string());
    }
    if !surname_first(body, false) && !organisation_or_title_first(body) {
        pieces.push("start with the author's surname, a comma, then the first name (Author, Firstname)".to_string());
    }
    if !ends_properly(body) {
        pieces.push("end the entry with a full stop".to_string());
    }
    pieces
}

fn ieee_pieces(body: &str, mark: &Option<Marker>) -> Vec<String> {
    let mut pieces = Vec::new();
    if !matches!(mark, Some(m) if m.style == ']') {
        pieces.push("start it with its number in brackets, like [3]".to_string());
    }
    if !initials_first(body) {
        pieces.push("write the first author as initials then surname, like A. Author".to_string());
    }
    let quoted = has_quoted_title(body);
    if !quoted {
        pieces.push("put an article title in quotation marks (a book title is italic instead)".to_string());
    } else {
        let lower = body.to_lowercase();
        let has_details = ["vol.", "pp.", "no.", "proc", "available", "doi", "http", "arxiv"]
            .iter()
            .any(|word| lower.contains(word));
        if !has_details {
            pieces.push("add the volume, issue and pages: vol. 3, no. 2, pp. 10-20".to_string());
        }
    }
    if !ends_properly(body) {
        pieces.push("end the entry with a full stop".to_string());
    }
    pieces
}

/* ---------------------------------------------------------------------------
   Author-year citations in the text: "(Smith, 2020)", "Smith and Jones (2020)",
   "(Smith 45)". Read only enough to match them against the reference list.
   ------------------------------------------------------------------------- */

struct AuthorCitation {
    display: String,
    surname: String,
    year: String,
    start: usize,
    end: usize,
}

/// UTF-16 offset of each character of a line, plus one for the end.
fn offsets(line: &Line, chars: &[char]) -> Vec<usize> {
    let mut at = Vec::with_capacity(chars.len() + 1);
    let mut position = line.start;
    for c in chars {
        at.push(position);
        position += c.len_utf16();
    }
    at.push(position);
    at
}

/// The [start, end) character ranges of the whitespace-separated words in `a..b`.
fn words(chars: &[char], a: usize, b: usize) -> Vec<(usize, usize)> {
    let mut out = Vec::new();
    let mut i = a;
    while i < b {
        if chars[i].is_whitespace() {
            i += 1;
            continue;
        }
        let start = i;
        while i < b && !chars[i].is_whitespace() {
            i += 1;
        }
        out.push((start, i));
    }
    out
}

/// A word without the punctuation around it ("Smith," is "Smith", "Smith's" is "Smith").
fn clean_word(word: &[char]) -> String {
    let raw: String = word.iter().collect();
    let trimmed = raw.trim_matches(|c| matches!(c, ',' | ';' | ':' | '&' | '(' | ')' | '"' | '\u{201c}' | '\u{201d}'));
    let trimmed = trimmed
        .strip_suffix("'s")
        .or_else(|| trimmed.strip_suffix("\u{2019}s"))
        .unwrap_or(trimmed);
    trimmed.trim_end_matches('.').to_string()
}

fn starts_upper(word: &str) -> bool {
    word.chars().next().map(|c| c.is_uppercase()).unwrap_or(false)
}

/// Words that begin a citation without being a name: "(see Smith, 2020)".
fn is_lead_in(word: &str) -> bool {
    matches!(word.to_lowercase().as_str(), "see" | "also" | "cf" | "e.g" | "eg" | "for" | "in" | "compare" | "but" | "and" | "as" | "by")
}

/// The first year (1500-2099) anywhere in the text.
fn first_year(chars: &[char]) -> Option<String> {
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
            let digits: String = chars[start..i].iter().collect();
            let value: u32 = digits.parse().unwrap_or(0);
            if (1500..=2099).contains(&value) {
                return Some(digits);
            }
        }
    }
    None
}

/// The last year (1500-2099) in `chars[a..b]` and where it starts.
fn last_year(chars: &[char], a: usize, b: usize) -> Option<(String, usize)> {
    let mut best = None;
    let mut i = a;
    while i < b {
        if !chars[i].is_ascii_digit() {
            i += 1;
            continue;
        }
        let start = i;
        while i < b && chars[i].is_ascii_digit() {
            i += 1;
        }
        if i - start == 4 && (start == a || !chars[start - 1].is_alphanumeric()) {
            let digits: String = chars[start..i].iter().collect();
            let value: u32 = digits.parse().unwrap_or(0);
            if (1500..=2099).contains(&value) {
                best = Some((digits, start));
            }
        }
    }
    best
}

/// The first name-like word in `chars[a..b]`, for "(see Smith & Jones, 2020)".
fn surname_before(chars: &[char], a: usize, b: usize) -> Option<String> {
    for (start, end) in words(chars, a, b) {
        let cleaned = clean_word(&chars[start..end]);
        if starts_upper(&cleaned) && !is_lead_in(&cleaned) {
            return Some(cleaned);
        }
    }
    None
}

/// For "Smith and Jones (2020)" or "Smith et al. (2020)": the first author,
/// read backwards from the "(". A name may be joined to the one before it by
/// "and" or "&"; anything else ("As Smith (2020)") ends the names.
fn narrative_surname(chars: &[char], open: usize) -> Option<String> {
    let all = words(chars, 0, open);
    let mut first: Option<String> = None;
    let mut expecting_name = true;
    let mut index = all.len();
    let mut steps = 0usize;
    while index > 0 && steps < 12 {
        index -= 1;
        steps += 1;
        let (start, end) = all[index];
        let raw: String = chars[start..end].iter().collect();
        let cleaned = clean_word(&chars[start..end]);
        let lower = cleaned.to_lowercase();
        if expecting_name {
            if first.is_none() && lower == "al" {
                // "et al." then the first author before it
                if index == 0 {
                    break;
                }
                let (before_start, before_end) = all[index - 1];
                if clean_word(&chars[before_start..before_end]).to_lowercase() != "et" {
                    break;
                }
                index -= 1;
                steps += 1;
                expecting_name = true;
                continue;
            }
            if !starts_upper(&cleaned) {
                break;
            }
            first = Some(cleaned);
            expecting_name = false;
        } else if lower == "and" || raw == "&" {
            expecting_name = true;
        } else {
            break;
        }
    }
    first
}

/// Every APA-style author-year citation on one line.
fn apa_citations(line: &Line) -> Vec<AuthorCitation> {
    let chars: Vec<char> = line.text.chars().collect();
    let at = offsets(line, &chars);
    let mut found = Vec::new();
    let mut i = 0usize;
    while i < chars.len() {
        if chars[i] != '(' {
            i += 1;
            continue;
        }
        let mut j = i + 1;
        while j < chars.len() && j - i <= 200 && chars[j] != ')' && chars[j] != '(' {
            j += 1;
        }
        if j >= chars.len() || chars[j] != ')' {
            i += 1;
            continue;
        }
        let mut part_start = i + 1;
        let mut first_part = true;
        let mut k = i + 1;
        while k <= j {
            if k == j || chars[k] == ';' {
                if let Some((year, year_at)) = last_year(&chars, part_start, k) {
                    let surname = surname_before(&chars, part_start, year_at).or_else(|| {
                        if first_part && chars[part_start..year_at].iter().all(|c| !c.is_alphanumeric()) {
                            narrative_surname(&chars, i)
                        } else {
                            None
                        }
                    });
                    if let Some(display) = surname {
                        // "(Smith, 2020; Jones, 2019)": point at the one source, not the whole bracket
                        let (start, end) = if chars[i + 1..j].contains(&';') {
                            let mut a = part_start;
                            while a < k && chars[a].is_whitespace() {
                                a += 1;
                            }
                            let mut b = k;
                            while b > a && chars[b - 1].is_whitespace() {
                                b -= 1;
                            }
                            (at[a], at[b])
                        } else {
                            (at[i], at[j + 1])
                        };
                        found.push(AuthorCitation { surname: display.to_lowercase(), display, year, start, end });
                    }
                }
                part_start = k + 1;
                first_part = false;
            }
            k += 1;
        }
        i = j + 1;
    }
    found
}

/// Words that look like a name at the start of a bracket but are not one: "(Figure 2)".
fn is_not_a_name(word: &str) -> bool {
    matches!(
        word.to_lowercase().as_str(),
        "figure" | "fig" | "table" | "section" | "chapter" | "appendix" | "equation" | "eq" | "page" | "pages"
            | "pp" | "see" | "ibid" | "cf" | "also" | "below" | "above" | "note" | "article" | "part" | "volume"
            | "vol" | "example" | "eg"
    )
}

/// "45" or "45-47" (hyphen or en dash).
fn is_pages(word: &str) -> bool {
    let chars: Vec<char> = word.chars().collect();
    let digits = chars.iter().take_while(|c| c.is_ascii_digit()).count();
    if digits == 0 {
        return false;
    }
    if digits == chars.len() {
        return true;
    }
    matches!(chars[digits], '-' | '\u{2013}') && chars.len() > digits + 1 && chars[digits + 1..].iter().all(|c| c.is_ascii_digit())
}

fn is_name_word(word: &str) -> bool {
    starts_upper(word) && word.chars().all(|c| c.is_alphabetic() || matches!(c, '\'' | '\u{2019}' | '-'))
}

/// Every MLA-style "(Surname 45)" citation on one line: (display name, start, end).
fn mla_citations(line: &Line) -> Vec<(String, usize, usize)> {
    let chars: Vec<char> = line.text.chars().collect();
    let at = offsets(line, &chars);
    let mut found = Vec::new();
    let mut i = 0usize;
    while i < chars.len() {
        if chars[i] != '(' {
            i += 1;
            continue;
        }
        let mut j = i + 1;
        while j < chars.len() && j - i <= 80 && chars[j] != ')' && chars[j] != '(' {
            j += 1;
        }
        if j >= chars.len() || chars[j] != ')' {
            i += 1;
            continue;
        }
        let content: String = chars[i + 1..j].iter().collect();
        let parts: Vec<&str> = content.split_whitespace().collect();
        if let Some(first) = parts.first() {
            if is_name_word(first) && !is_not_a_name(first) {
                let mut index = 1usize;
                if parts.get(index) == Some(&"and") && parts.get(index + 1).map(|w| is_name_word(w)).unwrap_or(false) {
                    index += 2;
                } else if parts.get(index) == Some(&"et") && parts.get(index + 1) == Some(&"al.") {
                    index += 2;
                }
                // A page number is required: "(Firebase)" or "(Rust)" is a product name, not a citation.
                if index + 1 == parts.len() && is_pages(parts[index]) {
                    found.push((first.to_string(), at[i], at[j + 1]));
                }
            }
        }
        i = j + 1;
    }
    found
}

/// "smith" matches "smith", "smith jones" and "world health smith": the cited
/// name is the whole reference name or its first or last word(s).
fn same_surname(reference: &str, cited: &str) -> bool {
    reference == cited
        || reference.starts_with(&format!("{} ", cited))
        || reference.ends_with(&format!(" {}", cited))
}

/* ---------------------------------------------------------------------------
   The check
   ------------------------------------------------------------------------- */

/// Runs the style checks over a document's reference list and citations.
pub fn run(style: Style, document_len: usize, headings: &[Heading], lines: &[Line]) -> Vec<Issue> {
    let mut issues = Vec::new();
    let Some(list) = find_list(document_len, headings, lines) else {
        return issues;
    };

    // the list's name
    let name = heading_text(&list.heading.title);
    let shown = name.trim_end_matches(':').trim();
    if shown.to_lowercase() != style.list_name().to_lowercase() {
        issues.push(issue(
            format!("heading-{}", list.heading.start),
            &format!("Reference list should be called \u{201c}{}\u{201d}", style.list_name()),
            format!(
                "{} style calls this list \u{201c}{}\u{201d}; this document calls it \u{201c}{}\u{201d}.",
                style.name(),
                style.list_name(),
                shown
            ),
            "low",
            "Reference list heading".to_string(),
            list.heading.start,
            list.heading.end,
        ));
    }

    // each entry's shape
    for (line, mark) in &list.entries {
        if issues.len() >= MAX_ISSUES {
            return issues;
        }
        if line.text.split_whitespace().count() < 3 {
            continue;
        }
        let body = without_marker(&line.text, mark);
        let pieces = match style {
            Style::Apa => apa_pieces(&body, mark.is_some()),
            Style::Mla => mla_pieces(&body, mark.is_some()),
            Style::Ieee => ieee_pieces(&body, mark),
        };
        if pieces.is_empty() {
            continue;
        }
        issues.push(issue(
            format!("style-{}", line.start),
            &format!("Reference is not in {} style", style.name()),
            format!("To match {} style: {}. Example: {}", style.name(), pieces.join("; "), style.example()),
            "medium",
            entry_location(mark, &line.text),
            line.start,
            line.end,
        ));
    }

    // the order of the list
    if style != Style::Ieee {
        let mut before: Option<(String, String)> = None;
        for (line, mark) in &list.entries {
            let (display, lower) = sort_name(&without_marker(&line.text, mark));
            if lower.is_empty() {
                continue;
            }
            if let Some((earlier_display, earlier_lower)) = &before {
                if lower < *earlier_lower {
                    if issues.len() >= MAX_ISSUES {
                        return issues;
                    }
                    issues.push(issue(
                        format!("order-{}", line.start),
                        "References are out of order",
                        format!(
                            "\u{201c}{}\u{201d} should come before \u{201c}{}\u{201d}: {} style lists references alphabetically by the first author's surname.",
                            display,
                            earlier_display,
                            style.name()
                        ),
                        "low",
                        entry_location(mark, &line.text),
                        line.start,
                        line.end,
                    ));
                }
            }
            before = Some((display, lower));
        }
    }

    match style {
        Style::Ieee => ieee_order(&list, headings, lines, &mut issues),
        Style::Apa => author_year_matching(&list, headings, lines, &mut issues),
        Style::Mla => surname_matching(&list, headings, lines, &mut issues),
    }
    issues
}

/// IEEE numbers references in the order they are first cited: when [n] is cited
/// for the first time, no lower number that is cited later may be waiting.
fn ieee_order(list: &ReferenceList, headings: &[Heading], lines: &[Line], issues: &mut Vec<Issue>) {
    let listed: Vec<u32> = list.entries.iter().filter_map(|(_, m)| m.as_ref().map(|m| m.number)).collect();
    if listed.is_empty() {
        return;
    }
    let cited: Vec<_> = body_citations(list, headings, lines)
        .into_iter()
        .filter(|citation| listed.contains(&citation.number))
        .collect();
    let mut seen: Vec<u32> = Vec::new();
    for citation in &cited {
        if seen.contains(&citation.number) {
            continue;
        }
        let waiting = cited
            .iter()
            .map(|c| c.number)
            .filter(|n| !seen.contains(n))
            .min()
            .unwrap_or(citation.number);
        seen.push(citation.number);
        if citation.number > waiting {
            if issues.len() >= MAX_ISSUES {
                return;
            }
            issues.push(issue(
                format!("order-cite-{}", citation.start),
                "References are out of order",
                format!(
                    "[{}] is cited before [{}]. IEEE numbers references in the order they first appear in the text.",
                    citation.number, waiting
                ),
                "low",
                format!("Citation [{}]", citation.number),
                citation.start,
                citation.end,
            ));
        }
    }
}

/// "Smith (2020)", or just "Smith" when the entry gives no year.
fn cited_label(display: &str, year: &str) -> String {
    if year.is_empty() {
        display.to_string()
    } else {
        format!("{} ({})", display, year)
    }
}

/// An entry with no year matches a citation of that surname in any year.
fn year_matches(entry_year: &str, cited_year: &str) -> bool {
    entry_year.is_empty() || entry_year == cited_year
}

/// APA: "(Smith, 2020)" in the text against "Smith, J. (2020)." in the list.
fn author_year_matching(list: &ReferenceList, headings: &[Heading], lines: &[Line], issues: &mut Vec<Issue>) {
    // A stray "[2]" or a year outside brackets is a style fault reported above; the entry still counts here.
    // (name, lower-case name, year or "", entry line, where to point, numbered)
    let mut entries: Vec<(String, String, String, &Line, String, bool)> = Vec::new();
    for (line, mark) in &list.entries {
        if line.text.split_whitespace().count() < 3 {
            continue;
        }
        let body = without_marker(&line.text, mark);
        let chars: Vec<char> = body.chars().collect();
        let (display, lower) = sort_name(&body);
        if lower.is_empty() {
            continue;
        }
        let year = match year_in_parentheses(&chars) {
            Some((open, _)) => {
                let digits: String = chars[open + 1..open + 5].iter().collect();
                if digits.chars().all(|c| c.is_ascii_digit()) {
                    digits
                } else {
                    "nd".to_string()
                }
            }
            None => first_year(&chars).unwrap_or_default(),
        };
        entries.push((display, lower, year, line, entry_location(mark, &line.text), mark.is_some()));
    }
    // A numbered entry is already reported as uncited by the numbered checks when the text cites by number.
    let numeric_cited = !body_citations(list, headings, lines).is_empty();
    let cites: Vec<AuthorCitation> = lines
        .iter()
        .filter(|line| !list.contains(line) && !headings.iter().any(|h| h.start == line.start))
        .flat_map(apa_citations)
        .collect();

    let mut reported: Vec<(String, String)> = Vec::new();
    for cite in &cites {
        if entries.iter().any(|(_, lower, year, _, _, _)| same_surname(lower, &cite.surname) && year_matches(year, &cite.year)) {
            continue;
        }
        if reported.contains(&(cite.surname.clone(), cite.year.clone())) {
            continue;
        }
        if issues.len() >= MAX_ISSUES {
            return;
        }
        reported.push((cite.surname.clone(), cite.year.clone()));
        issues.push(issue(
            format!("citation-missing-{}", cite.start),
            "Citation has no matching reference",
            format!("No reference for \u{201c}{}\u{201d} in the reference list.", cited_label(&cite.display, &cite.year)),
            "medium",
            "Citation".to_string(),
            cite.start,
            cite.end,
        ));
    }
    if cites.is_empty() {
        return;
    }
    for (display, lower, year, line, location, numbered) in &entries {
        if cites.iter().any(|cite| same_surname(lower, &cite.surname) && year_matches(year, &cite.year)) {
            continue;
        }
        if *numbered && numeric_cited {
            continue;
        }
        if issues.len() >= MAX_ISSUES {
            return;
        }
        issues.push(issue(
            format!("reference-uncited-{}", line.start),
            "Reference is never cited",
            format!("Nothing in the text cites \u{201c}{}\u{201d}.", cited_label(display, year)),
            "low",
            location.clone(),
            line.start,
            line.end,
        ));
    }
}

/// MLA: "(Smith 45)" in the text against "Smith, John." in the list.
fn surname_matching(list: &ReferenceList, headings: &[Heading], lines: &[Line], issues: &mut Vec<Issue>) {
    // (name, lower-case name, entry line, where to point, numbered)
    let mut entries: Vec<(String, String, &Line, String, bool)> = Vec::new();
    for (line, mark) in &list.entries {
        if line.text.split_whitespace().count() < 3 {
            continue;
        }
        let (display, lower) = sort_name(&without_marker(&line.text, mark));
        if !lower.is_empty() {
            entries.push((display, lower, line, entry_location(mark, &line.text), mark.is_some()));
        }
    }
    let numeric_cited = !body_citations(list, headings, lines).is_empty();
    let cites: Vec<(String, usize, usize)> = lines
        .iter()
        .filter(|line| !list.contains(line) && !headings.iter().any(|h| h.start == line.start))
        .flat_map(mla_citations)
        .collect();

    let mut reported: Vec<String> = Vec::new();
    for (display, start, end) in &cites {
        let lower = display.to_lowercase();
        if entries.iter().any(|(_, reference, _, _, _)| same_surname(reference, &lower)) || reported.contains(&lower) {
            continue;
        }
        if issues.len() >= MAX_ISSUES {
            return;
        }
        reported.push(lower);
        issues.push(issue(
            format!("citation-missing-{}", start),
            "Citation has no matching reference",
            format!("No entry for \u{201c}{}\u{201d} in the Works Cited list.", display),
            "medium",
            "Citation".to_string(),
            *start,
            *end,
        ));
    }
    if cites.is_empty() {
        return;
    }
    for (display, lower, line, location, numbered) in &entries {
        if cites.iter().any(|(cited, _, _)| same_surname(lower, &cited.to_lowercase())) {
            continue;
        }
        if *numbered && numeric_cited {
            continue;
        }
        if issues.len() >= MAX_ISSUES {
            return;
        }
        issues.push(issue(
            format!("reference-uncited-{}", line.start),
            "Reference is never cited",
            format!("Nothing in the text cites \u{201c}{}\u{201d}.", display),
            "low",
            location.clone(),
            line.start,
            line.end,
        ));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::text::lines;

    fn heading_at(text: &str, title: &str) -> Heading {
        let start = text.find(title).unwrap();
        Heading { level: 1, title: title.to_string(), start, end: start + title.len() }
    }

    fn check(style: Style, text: &str, heading: &str) -> Vec<Issue> {
        let len = text.chars().map(|c| c.len_utf16()).sum();
        run(style, len, &[heading_at(text, heading)], &lines(text))
    }

    fn titles(issues: &[Issue]) -> Vec<&str> {
        issues.iter().map(|i| i.title.as_str()).collect()
    }

    #[test]
    fn parses_style_names() {
        assert_eq!(Style::parse("APA"), Some(Style::Apa));
        assert_eq!(Style::parse(" ieee "), Some(Style::Ieee));
        assert_eq!(Style::parse("mla"), Some(Style::Mla));
        assert_eq!(Style::parse(""), None);
        assert_eq!(Style::parse("Chicago"), None);
    }

    #[test]
    fn a_good_ieee_list_is_quiet() {
        let text = "See [1] and [2].\nReferences\n[1] A. Author, \"Title one,\" Journal, vol. 1, pp. 2-3, 2020.\n[2] B. Writer, \"Title two,\" Journal, vol. 2, pp. 4-5, 2019.";
        assert!(check(Style::Ieee, text, "References").is_empty());
    }

    #[test]
    fn ieee_says_what_to_fix() {
        let text = "See [1].\nReferences\n[1] Smith, J., A study of things. Journal of Stuff";
        let issues = check(Style::Ieee, text, "References");
        let entry = issues.iter().find(|i| i.title == "Reference is not in IEEE style").unwrap();
        assert!(entry.message.contains("initials then surname"));
        assert!(entry.message.contains("quotation marks"));
        assert!(entry.message.contains("full stop"));
        assert!(entry.message.contains("Example: [1] A. Author"));
    }

    #[test]
    fn ieee_numbers_follow_first_citation() {
        let text = "First [2] then [1].\nReferences\n[1] A. Author, \"T,\" J, vol. 1, 2020.\n[2] B. Writer, \"U,\" J, vol. 2, 2019.";
        let issues = check(Style::Ieee, text, "References");
        let order = issues.iter().find(|i| i.title == "References are out of order").unwrap();
        assert!(order.message.contains("[2] is cited before [1]"));
    }

    #[test]
    fn apa_wants_year_in_parentheses_and_alphabetical_order() {
        let text = "References\nSmith, J. 2020. A study. Journal.\nJones, K. (2019). Another study. Journal.";
        let issues = check(Style::Apa, text, "References");
        let entry = issues.iter().find(|i| i.title == "Reference is not in APA style").unwrap();
        assert!(entry.message.contains("year in parentheses"));
        assert!(titles(&issues).contains(&"References are out of order"));
    }

    #[test]
    fn apa_flags_a_numbered_entry_and_and() {
        let text = "References\n[1] Smith, J., and Jones, K. (2020). A study. Journal.";
        let issues = check(Style::Apa, text, "References");
        let message = &issues.iter().find(|i| i.title == "Reference is not in APA style").unwrap().message;
        assert!(message.contains("remove the number"));
        assert!(message.contains("&, not \"and\""));
    }

    #[test]
    fn apa_matches_citations_to_entries() {
        let text = "Prior work (Smith, 2020) and Jones and Lee (2018) agree, but (Brown, 2015) differs.\nReferences\nSmith, J. (2020). A study. Journal.\nJones, K., & Lee, M. (2018). Other. Journal.\nWhite, P. (2010). Unused. Journal.";
        let issues = check(Style::Apa, text, "References");
        let missing = issues.iter().find(|i| i.title == "Citation has no matching reference").unwrap();
        assert!(missing.message.contains("Brown (2015)"));
        let uncited = issues.iter().find(|i| i.title == "Reference is never cited").unwrap();
        assert!(uncited.message.contains("White (2010)"));
        assert_eq!(issues.iter().filter(|i| i.title == "Citation has no matching reference").count(), 1);
    }

    #[test]
    fn mla_wants_works_cited_and_surname_first() {
        let text = "References\nJohn Smith. \"A study.\" Journal, 2020.";
        let issues = check(Style::Mla, text, "References");
        assert!(titles(&issues).iter().any(|t| t.starts_with("Reference list should be called")));
    }

    #[test]
    fn mla_matches_citations_by_surname() {
        let text = "As argued (Smith 45) and (Brown 12), also (Figure 2).\nWorks Cited\nSmith, John. \"A study.\" Journal, 2020.\nWhite, Pat. \"Unused.\" Journal, 2010.";
        let issues = check(Style::Mla, text, "Works Cited");
        let missing = issues.iter().find(|i| i.title == "Citation has no matching reference").unwrap();
        assert!(missing.message.contains("Brown"));
        assert!(issues.iter().any(|i| i.title == "Reference is never cited" && i.message.contains("White")));
        assert_eq!(issues.iter().filter(|i| i.title == "Citation has no matching reference").count(), 1);
    }

    #[test]
    fn apa_reads_the_author_after_a_lead_in_word() {
        let text = "As Smith (2020) argues, and However, Jones et al. (2018) agree.\nReferences\nJones, K., Lee, M., & Ray, T. (2018). Other. Journal.\nSmith, J. (2020). A study. Journal.";
        assert!(check(Style::Apa, text, "References").is_empty());
    }

    #[test]
    fn a_missing_source_in_a_group_is_pointed_at_alone() {
        let text = "Both (Smith, 2020; Zed, 2001) apply.\nReferences\nSmith, J. (2020). A study. Journal, 1(1), 1-5.";
        let issues = check(Style::Apa, text, "References");
        let missing = issues.iter().find(|i| i.title == "Citation has no matching reference").unwrap();
        assert_eq!(&text[missing.start..missing.end], "Zed, 2001");
    }

    #[test]
    fn apa_matches_an_organisation_by_its_last_words() {
        let text = "World Health Organization (2020) reports.\nReferences\nWorld Health Organization. (2020). A report. WHO Press.";
        assert!(check(Style::Apa, text, "References").is_empty());
    }

    #[test]
    fn ieee_ignores_gaps_when_checking_order() {
        let text = "One [1], two [2], four [4] and five [5].\nReferences\n[1] A. A, \"T,\" J, vol. 1, 2020.\n[2] B. B, \"T,\" J, vol. 1, 2020.\n[3] C. C, \"T,\" J, vol. 1, 2020.\n[4] D. D, \"T,\" J, vol. 1, 2020.\n[5] E. E, \"T,\" J, vol. 1, 2020.";
        let issues = check(Style::Ieee, text, "References");
        assert!(!titles(&issues).contains(&"References are out of order"));
    }

    #[test]
    fn a_stray_number_or_missing_bracket_does_not_hide_a_match() {
        let text = "Prior work (Smith, 2020) and Jones (2018) and (Zed, 2001).\nReferences\nSmith, J. 2020. A study of things. Journal\n[2] Jones, K. (2018). Other things. Journal.";
        let issues = check(Style::Apa, text, "References");
        let missing: Vec<&Issue> = issues.iter().filter(|i| i.title == "Citation has no matching reference").collect();
        assert_eq!(missing.len(), 1);
        assert!(missing[0].message.contains("Zed (2001)"));
        assert!(!titles(&issues).contains(&"Reference is never cited"));
    }

    #[test]
    fn mla_needs_a_page_number_to_count_a_citation() {
        let text = "We used (Firebase) and (Rust 3) here.\nWorks Cited\nSmith, John. \"A study.\" Journal, 2020.";
        let issues = check(Style::Mla, text, "Works Cited");
        let missing: Vec<&Issue> = issues.iter().filter(|i| i.title == "Citation has no matching reference").collect();
        assert_eq!(missing.len(), 1);
        assert!(missing[0].message.contains("Rust"));
    }

    #[test]
    fn a_good_apa_list_is_quiet() {
        let text = "See (Jones, 2018) and Smith (2020).\nReferences\nJones, K. (2018). Other. Journal, 3(2), 10-20.\nSmith, J. (2020). A study. Journal, 1(1), 1-5.";
        assert!(check(Style::Apa, text, "References").is_empty());
    }
}
