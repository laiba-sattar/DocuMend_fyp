//! json.rs — a tiny JSON writer.
//!
//! The engine only ever sends one shape of data to the browser, so writing the
//! JSON by hand keeps the crate dependency-free: no serde, a much smaller .wasm
//! file, and `cargo test` works offline.

/// Wraps a string in quotes and escapes what JSON does not allow.
pub fn quote(value: &str) -> String {
    let mut out = String::with_capacity(value.len() + 2);
    out.push('"');
    for c in value.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out.push('"');
    out
}

/// Writes a number the way JavaScript expects (no trailing `.0`, no `NaN`).
pub fn number(value: f64) -> String {
    if !value.is_finite() {
        return "0".to_string();
    }
    if value.fract() == 0.0 && value.abs() < 1e15 {
        format!("{}", value as i64)
    } else {
        format!("{}", value)
    }
}

/// `{ "a": 1, "b": "two" }` from a list of already-written values.
pub fn object(fields: &[(&str, String)]) -> String {
    let body: Vec<String> = fields
        .iter()
        .map(|(key, value)| format!("{}:{}", quote(key), value))
        .collect();
    format!("{{{}}}", body.join(","))
}

/// `[ … ]` from a list of already-written values.
pub fn array(items: &[String]) -> String {
    format!("[{}]", items.join(","))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn escapes_quotes_and_newlines() {
        assert_eq!(quote("he said \"hi\"\n"), "\"he said \\\"hi\\\"\\n\"");
    }

    #[test]
    fn writes_whole_numbers_without_a_dot() {
        assert_eq!(number(45000.0), "45000");
        assert_eq!(number(3.5), "3.5");
    }

    #[test]
    fn builds_objects() {
        let out = object(&[("a", number(1.0)), ("b", quote("two"))]);
        assert_eq!(out, "{\"a\":1,\"b\":\"two\"}");
    }
}
