//! Local Loopback Port Allocation Module
//! Safely probes for default port 3787, or dynamically allocates an ephemeral port on 127.0.0.1.

use std::net::TcpListener;

pub const DEFAULT_PORT: u16 = 3787;

/// Allocates an available port on loopback 127.0.0.1.
/// Tries DEFAULT_PORT (3787) first. If already bound, requests an ephemeral port from the OS (port 0).
pub fn allocate_port() -> Result<u16, String> {
    // Attempt default port first
    if let Ok(listener) = TcpListener::bind(("127.0.0.1", DEFAULT_PORT)) {
        let port = listener
            .local_addr()
            .map_err(|e| format!("Failed to read socket address: {e}"))?
            .port();
        drop(listener);
        return Ok(port);
    }

    // Default port is occupied, allocate an ephemeral free port
    let listener = TcpListener::bind(("127.0.0.1", 0))
        .map_err(|e| format!("Failed to bind to ephemeral loopback port: {e}"))?;
    let port = listener
        .local_addr()
        .map_err(|e| format!("Failed to read socket address: {e}"))?
        .port();
    drop(listener);
    Ok(port)
}
