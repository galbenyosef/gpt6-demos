use notavirus_gnome::protocol::*;
use std::io::Cursor;
#[test]
fn framing_is_bounded_and_eof_is_explicit() {
    assert!(read_message(&mut Cursor::new(vec![b'x'; MAX_MESSAGE + 1])).is_err());
    assert!(read_message(&mut Cursor::new(b"{}")).is_err());
    assert!(read_message(&mut Cursor::new(b"")).unwrap().is_none());
    let mut r = Cursor::new(b"{}\n{}\n");
    assert_eq!(read_message(&mut r).unwrap().unwrap(), b"{}\n");
    assert_eq!(read_message(&mut r).unwrap().unwrap(), b"{}\n");
}
#[test]
fn strict_requests_reject_nonfinite_unknown_and_incompatible_types() {
    for source in [
        r#"{"type":"set_size","seq":1,"size":NaN}"#,
        r#"{"type":"set_size","seq":1,"size":1e999}"#,
        r#"{"type":"set_paused","seq":1,"paused":0}"#,
        r#"{"type":"shutdown","seq":1,"unexpected":true}"#,
    ] {
        assert!(serde_json::from_str::<Request>(source).is_err(), "{source}");
    }
    assert!(!size_valid(1.1));
    assert!(!id_valid("../paco"));
}
