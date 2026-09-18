use std::{
    fs::{self, File, OpenOptions},
    io::{self, Write},
    path::PathBuf,
};
struct SizeLog {
    path: PathBuf,
    file: File,
    size: u64,
}
impl SizeLog {
    fn open(path: PathBuf) -> io::Result<Self> {
        fs::create_dir_all(path.parent().unwrap())?;
        let file = OpenOptions::new().create(true).append(true).open(&path)?;
        let size = file.metadata()?.len();
        Ok(Self { path, file, size })
    }
}
impl Write for SizeLog {
    fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
        if self.size + bytes.len() as u64 > 2 * 1024 * 1024 {
            self.file.flush()?;
            fs::rename(&self.path, self.path.with_extension("log.1"))?;
            self.file = File::create(&self.path)?;
            self.size = 0;
        }
        let n = self.file.write(bytes)?;
        self.size += n as u64;
        Ok(n)
    }
    fn flush(&mut self) -> io::Result<()> {
        self.file.flush()
    }
}
pub fn init(path: PathBuf) -> io::Result<tracing_appender::non_blocking::WorkerGuard> {
    let (writer, guard) = tracing_appender::non_blocking(SizeLog::open(path)?);
    tracing_subscriber::fmt()
        .with_ansi(false)
        .with_writer(writer)
        .init();
    Ok(guard)
}
