//! Local execution of the candidate's DSA solution.
//!
//! THREAT MODEL — read before hardening this.
//! The candidate writes code and runs it on their own machine. This is not
//! untrusted-code execution: it is the same trust boundary as opening a
//! terminal and running the file themselves. So the job here is NOT to
//! defend the machine from its own owner; it is to keep the *interview*
//! healthy:
//!   - a runaway loop must not hang the app  -> hard wall-clock timeout + kill
//!   - output must not exhaust memory        -> capped capture
//!   - a crash must read as a test failure   -> stderr/exit code returned
//!
//! If this ever runs code the user did NOT write (e.g. a shared/imported
//! solution, or a hosted mode), the model changes completely and this needs
//! real isolation — job objects, a container, or a remote judge.

use serde::Serialize;
use std::fs;
use std::io::Read;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};
use wait_timeout::ChildExt;

const MAX_OUTPUT: usize = 256 * 1024;

#[derive(Serialize)]
pub struct ExecResult {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: Option<i32>,
    pub timed_out: bool,
    pub duration_ms: u64,
    /// Set when the toolchain itself is missing, so the UI can say
    /// "install g++" instead of reporting a wrong answer.
    pub runtime_missing: bool,
}

fn workdir() -> Result<PathBuf, String> {
    // Nanosecond suffix keeps concurrent runs from colliding.
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_nanos();
    let dir = std::env::temp_dir().join(format!("interview-system-run-{nanos}"));
    fs::create_dir_all(&dir).map_err(|e| format!("could not create temp dir: {e}"))?;
    Ok(dir)
}

fn missing_toolchain(err: &std::io::Error) -> bool {
    err.kind() == std::io::ErrorKind::NotFound
}

/// Read a pipe to EOF, keeping at most MAX_OUTPUT bytes but continuing to
/// drain the rest. Draining is the point: if we stopped reading at the cap,
/// a chatty child would block on a full pipe and never exit — the exact
/// deadlock that made correct-but-verbose solutions report as timeouts.
fn read_capped<R: Read>(reader: &mut R) -> String {
    let mut kept: Vec<u8> = Vec::new();
    let mut chunk = [0u8; 8192];
    let mut truncated = false;
    loop {
        match reader.read(&mut chunk) {
            Ok(0) => break,
            Ok(n) => {
                if kept.len() < MAX_OUTPUT {
                    let take = (MAX_OUTPUT - kept.len()).min(n);
                    kept.extend_from_slice(&chunk[..take]);
                    if take < n {
                        truncated = true;
                    }
                } else {
                    truncated = true; // keep draining, discard
                }
            }
            Err(_) => break,
        }
    }
    let mut s = String::from_utf8_lossy(&kept).into_owned();
    if truncated {
        s.push_str("\n…output truncated…");
    }
    s
}

/// Run one command with a wall-clock timeout, feeding `stdin_data`.
fn run_with_timeout(
    mut cmd: Command,
    stdin_data: &str,
    timeout: Duration,
) -> Result<ExecResult, String> {
    let started = Instant::now();
    let mut child = match cmd
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
    {
        Ok(c) => c,
        Err(e) if missing_toolchain(&e) => {
            return Ok(ExecResult {
                stdout: String::new(),
                stderr: format!("toolchain not found: {e}"),
                exit_code: None,
                timed_out: false,
                duration_ms: 0,
                runtime_missing: true,
            })
        }
        Err(e) => return Err(format!("spawn failed: {e}")),
    };

    // Feed stdin from its own thread. A solution that ignores stdin, or a
    // large payload, must not block us before we start draining stdout.
    if let Some(mut stdin) = child.stdin.take() {
        use std::io::Write;
        let data = stdin_data.to_owned();
        std::thread::spawn(move || {
            let _ = stdin.write_all(data.as_bytes());
            // Drop closes the pipe so a reader on the child side sees EOF.
        });
    }

    // Drain stdout/stderr CONCURRENTLY with the wait. Reading only after the
    // child exits deadlocks: a child that fills the ~64KB OS pipe buffer
    // blocks on write, never exits, and trips the timeout — reporting a
    // correct solution as an infinite loop.
    let stdout_reader = child
        .stdout
        .take()
        .map(|mut out| std::thread::spawn(move || read_capped(&mut out)));
    let stderr_reader = child
        .stderr
        .take()
        .map(|mut err| std::thread::spawn(move || read_capped(&mut err)));

    let status = child
        .wait_timeout(timeout)
        .map_err(|e| format!("wait failed: {e}"))?;

    let timed_out = status.is_none();
    let exit_code = match status {
        Some(s) => s.code(),
        None => {
            let _ = child.kill();
            let _ = child.wait();
            None
        }
    };

    // Join the readers — after a kill they see EOF and return promptly.
    let stdout = stdout_reader
        .map(|h| h.join().unwrap_or_default())
        .unwrap_or_default();
    let stderr = stderr_reader
        .map(|h| h.join().unwrap_or_default())
        .unwrap_or_default();

    Ok(ExecResult {
        // read_capped already bounds and marks these.
        stdout,
        stderr,
        exit_code,
        timed_out,
        duration_ms: started.elapsed().as_millis() as u64,
        runtime_missing: false,
    })
}

/// Compile step for languages that need one. Returns Err(result) if the
/// compile itself failed, so the caller can surface it as a build error.
fn compile(cmd: Command, timeout: Duration) -> Result<Option<ExecResult>, String> {
    let r = run_with_timeout(cmd, "", timeout)?;
    if r.runtime_missing || r.timed_out || r.exit_code != Some(0) {
        return Ok(Some(r));
    }
    Ok(None)
}

#[tauri::command]
pub fn run_code(
    language: String,
    source: String,
    stdin_data: String,
    timeout_ms: u64,
) -> Result<ExecResult, String> {
    let dir = workdir()?;
    let timeout = Duration::from_millis(timeout_ms.clamp(1000, 30_000));
    let result = (|| -> Result<ExecResult, String> {
        match language.as_str() {
            "python" => {
                let file = dir.join("solution.py");
                fs::write(&file, source).map_err(|e| e.to_string())?;
                let mut cmd = Command::new(python_exe());
                cmd.arg(&file);
                run_with_timeout(cmd, &stdin_data, timeout)
            }
            "javascript" => {
                let file = dir.join("solution.mjs");
                fs::write(&file, source).map_err(|e| e.to_string())?;
                let mut cmd = Command::new("node");
                cmd.arg(&file);
                run_with_timeout(cmd, &stdin_data, timeout)
            }
            "cpp" => {
                let src = dir.join("solution.cpp");
                let exe = dir.join(if cfg!(windows) { "solution.exe" } else { "solution" });
                fs::write(&src, source).map_err(|e| e.to_string())?;
                let mut cc = Command::new("g++");
                cc.arg("-std=c++17").arg("-O2").arg("-o").arg(&exe).arg(&src);
                if let Some(fail) = compile(cc, Duration::from_secs(30))? {
                    return Ok(fail);
                }
                run_with_timeout(Command::new(&exe), &stdin_data, timeout)
            }
            "java" => {
                let src = dir.join("Main.java");
                fs::write(&src, source).map_err(|e| e.to_string())?;
                let mut javac = Command::new("javac");
                javac.arg(&src);
                if let Some(fail) = compile(javac, Duration::from_secs(30))? {
                    return Ok(fail);
                }
                let mut cmd = Command::new("java");
                cmd.arg("-cp").arg(&dir).arg("Main");
                run_with_timeout(cmd, &stdin_data, timeout)
            }
            other => Err(format!("unsupported language: {other}")),
        }
    })();

    let _ = fs::remove_dir_all(&dir);
    result
}

fn python_exe() -> &'static str {
    if cfg!(windows) {
        "python"
    } else {
        "python3"
    }
}

/// Which languages can actually run here — the UI greys out the rest rather
/// than letting a candidate write C++ and then discover g++ is missing.
#[tauri::command]
pub fn available_languages() -> Vec<String> {
    let probes: [(&str, &str, &str); 4] = [
        ("python", python_exe(), "--version"),
        ("javascript", "node", "--version"),
        ("cpp", "g++", "--version"),
        ("java", "javac", "-version"),
    ];
    probes
        .iter()
        .filter(|(_, exe, arg)| {
            // Require a SUCCESSFUL exit, not merely a spawn. On stock Windows,
            // %LOCALAPPDATA%\Microsoft\WindowsApps holds 0-byte python.exe
            // "App Execution Alias" stubs that spawn fine and exit 9009. With
            // `.is_ok()` that reported Python as installed, unlocked Run, and
            // then blamed the candidate's code for the empty output.
            Command::new(exe)
                .arg(arg)
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .status()
                .map(|s| s.success())
                .unwrap_or(false)
        })
        .map(|(name, _, _)| name.to_string())
        .collect()
}
