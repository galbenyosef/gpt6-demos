use notavirus_gnome::{
    assets::{self, Assets},
    protocol::{self, Request},
    runtime::Runtime,
};
use std::{
    fs::OpenOptions,
    io::{self, Write},
    os::unix::fs::OpenOptionsExt,
    path::PathBuf,
};
fn run() -> Result<(), Box<dyn std::error::Error>> {
    let mut args = std::env::args_os().skip(1);
    let command = args.next().unwrap_or_else(|| "serve".into());
    let bundled = std::env::current_exe()?
        .parent()
        .ok_or("Missing executable directory")?
        .join("packs");
    let user = assets::data_root()?;
    let roots = vec![bundled, user.clone()];
    if command == "import" {
        let archive = PathBuf::from(
            args.next()
                .ok_or("Usage: notavirus-gnome import FILE.petpack")?,
        );
        std::fs::create_dir_all(&user)?;
        let lock = OpenOptions::new()
            .read(true)
            .write(true)
            .create(true)
            .truncate(false)
            .mode(0o600)
            .custom_flags(libc::O_NOFOLLOW)
            .open(user.join(".import.lock"))?;
        assets::lock(&lock).map_err(|_| "Another import is running; try again when it finishes")?;
        let ids = notavirus_pack::discover(&roots)
            .into_iter()
            .filter_map(|c| c.id)
            .collect::<Vec<_>>();
        let installed = notavirus_pack::install(&archive, &user, &ids)?;
        println!(
            "{}",
            serde_json::json!({"id":notavirus_pack::load(&installed)?.pack.id})
        );
        return Ok(());
    }
    if command != "serve" {
        return Err("Usage: notavirus-gnome [serve | import FILE.petpack]".into());
    }
    let runtime_dir = std::env::var_os("XDG_RUNTIME_DIR")
        .ok_or("XDG_RUNTIME_DIR is required; launch from your GNOME session")?;
    let mut runtime = Runtime::new(roots, Assets::new(&PathBuf::from(runtime_dir))?);
    let mut stdin = io::stdin().lock();
    let mut stdout = io::stdout().lock();
    while let Some(line) = protocol::read_message(&mut stdin)? {
        let request: Request = serde_json::from_slice(&line)?;
        let seq = request.seq();
        let shutdown = matches!(request, Request::Shutdown { .. });
        let result = runtime.handle(request).unwrap_or_else(|error| serde_json::json!({"type":"error","seq":seq,"message":error.chars().take(512).collect::<String>()}));
        let mut bytes = serde_json::to_vec(&result)?;
        bytes.push(b'\n');
        if bytes.len() > protocol::MAX_MESSAGE {
            return Err("Response exceeds protocol limit".into());
        }
        stdout.write_all(&bytes)?;
        stdout.flush()?;
        if shutdown {
            break;
        }
    }
    Ok(())
}
fn main() {
    if let Err(error) = run() {
        eprintln!("NotAVirus: {error}");
        std::process::exit(1);
    }
}
