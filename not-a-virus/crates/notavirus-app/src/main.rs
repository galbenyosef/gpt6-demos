#[cfg(target_os = "macos")]
mod app;
#[cfg(target_os = "macos")]
mod bridge;
#[cfg(target_os = "macos")]
mod cursor;
#[cfg(target_os = "macos")]
mod logging;
#[cfg(target_os = "macos")]
mod panel;
#[cfg(target_os = "macos")]
mod preferences;
#[cfg(target_os = "macos")]
mod status;
#[cfg(target_os = "macos")]
mod tick;
fn main() {
    if let Some(path) = std::env::args().nth(1).filter(|p| p != "--help") {
        match notavirus_pack::load(std::path::Path::new(&path)) {
            Ok(p) => {
                println!(
                    "{}: valid schema 1 pack ({} clips, {}×{} atlas)",
                    p.pack.name,
                    p.pack.clips.len(),
                    p.width,
                    p.height
                );
                return;
            }
            Err(e) => {
                eprintln!("Invalid pack: {e}");
                std::process::exit(1);
            }
        }
    }
    #[cfg(target_os = "macos")]
    {
        let log = std::path::PathBuf::from(objc2_foundation::NSHomeDirectory().to_string())
            .join("Library/Logs/NotAVirus/notavirus.log");
        let _guard = match logging::init(log) {
            Ok(guard) => Some(guard),
            Err(e) => {
                eprintln!("Cannot open NotAVirus log: {e}");
                None
            }
        };
        app::run();
    }
    #[cfg(not(target_os = "macos"))]
    eprintln!(
        "For Ubuntu GNOME 50, build and install with scripts/build-gnome.sh and scripts/install-gnome.sh. This binary runs the macOS frontend or validates a pack path."
    );
}
