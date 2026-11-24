//! Two explicit, potentially billable edits of the bundled photograph, followed by offline reopen.
use anyhow::{Context, Result, ensure};
use std::path::{Path, PathBuf};
use wyang::{
    project::Project,
    provider::{Batch, Config},
};
fn main() -> Result<()> {
    let mut args = std::env::args_os().skip(1);
    ensure!(
        args.next().as_deref() == Some(std::ffi::OsStr::new("--live")),
        "Pass --live OUTPUT_DIRECTORY to submit two OpenAI edits"
    );
    let dir = PathBuf::from(args.next().context("Expected a new project directory")?);
    ensure!(!dir.exists(), "Choose a new project directory");
    let config = Config::load(Path::new("."))?;
    let model = config.model.clone();
    let provider = config.client()?.context("Set OPENAI_API_KEY")?;
    let mut p = Project::from_bytes(
        "Hamburg harbor.jpg".into(),
        include_bytes!("../assets/hamburg-harbor.jpg").to_vec(),
    )?;
    p.manifest.prompt =
        "Keep the boats and skyline. Make it blue hour, with warm light in the windows.".into();
    p.save(&dir)?;
    let mut batch = Batch::new(1, 2, p.manifest.prompt.clone(), model)?;
    let source = p.clone();
    let mut result = Ok(());
    batch.clone().run(&provider, &source, |job| {
        if !batch.accept(&job) {
            return;
        }
        match job.result {
            Ok((c, g)) => {
                p.add(c, g);
                if let Err(e) = p.save(&dir) {
                    result = Err(e);
                    batch.cancel();
                } else {
                    println!("{} of 2 ready", batch.ready);
                }
            }
            Err(e) => result = Err(anyhow::anyhow!("{e}")),
        }
    });
    result?;
    let reopened = Project::open(&dir)?;
    ensure!(
        reopened.candidates.len() == 2,
        "Expected two readable candidates"
    );
    println!("Reopened both edits from {}", dir.display());
    Ok(())
}
