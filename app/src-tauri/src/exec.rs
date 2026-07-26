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

fn truncate(mut s: String) -> String {
    if s.len() > MAX_OUTPUT {
        s.truncate(MAX_OUTPUT);
        s.push_str("\n…output truncated…");
    }
    s
}

fn missing_toolchain(err: &std::io::Error) -> bool {
    err.kind() == std::io::ErrorKind::NotFound
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

    if let Some(mut stdin) = child.stdin.take() {
        use std::io::Write;
        // A solution that never reads stdin closes the pipe early; that's a
        // broken pipe, not an error worth failing the run over.
        let _ = stdin.write_all(stdin_data.as_bytes());
    }

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

    let mut stdout = String::new();
    let mut stderr = String::new();
    if let Some(mut out) = child.stdout.take() {
        let _ = out.read_to_string(&mut stdout);
    }
    if let Some(mut err) = child.stderr.take() {
        let _ = err.read_to_string(&mut stderr);
    }

    Ok(ExecResult {
        stdout: truncate(stdout),
        stderr: truncate(stderr),
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
            Command::new(exe)
                .arg(arg)
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .status()
                .is_ok()
        })
        .map(|(name, _, _)| name.to_string())
        .collect()
}
