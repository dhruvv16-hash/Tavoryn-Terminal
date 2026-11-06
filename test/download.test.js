// Download endpoint test - verifies /api/download, /download, and /api/download/info
import assert from "node:assert";
import http from "node:http";
import { handle } from "../server.js";

const server = http.createServer(handle);

server.listen(0, "127.0.0.1", async () => {
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;

  try {
    // 1. Verify /api/download/info returns platform catalog
    const infoRes = await fetch(`${base}/api/download/info`);
    assert.strictEqual(infoRes.status, 200, "info status should be 200");
    const info = await infoRes.json();
    assert.strictEqual(info.ok, true, "info.ok should be true");
    assert.ok(info.platforms["windows-exe"], "should contain windows-exe");
    assert.ok(info.platforms["macos-arm64"], "should contain macos-arm64");
    assert.ok(info.platforms["linux-appimage"], "should contain linux-appimage");

    // 2. Verify Windows download streams or redirects
    const winRes = await fetch(`${base}/api/download?platform=windows-exe`, { redirect: "manual" });
    assert.ok([200, 302].includes(winRes.status), "windows download should be 200 or 302");
    if (winRes.status === 200) {
      assert.strictEqual(
        winRes.headers.get("content-disposition"),
        'attachment; filename="Tavoryn-Terminal-Setup-1.0.0.exe"'
      );
      assert.ok(Number(winRes.headers.get("content-length")) > 10000000);
    }

    // 3. Verify /download alias behaves identically
    const aliasRes = await fetch(`${base}/download?platform=windows-exe`, { redirect: "manual" });
    assert.strictEqual(aliasRes.status, winRes.status);

    // 4. Verify macOS download 302 redirects to GitHub release when not on macOS host
    const macRes = await fetch(`${base}/api/download?platform=macos-arm64`, { redirect: "manual" });
    assert.strictEqual(macRes.status, 302, "macos should 302 redirect");
    assert.ok(
      macRes.headers.get("location").includes("github.com/dhruvv16-hash/Tavoryn-Terminal/releases/download"),
      "should point to GitHub release artifact"
    );

    // 5. Verify Linux download 302 redirects to GitHub release when not on Linux host
    const linuxRes = await fetch(`${base}/api/download?platform=linux-appimage`, { redirect: "manual" });
    assert.strictEqual(linuxRes.status, 302, "linux should 302 redirect");
    assert.ok(
      linuxRes.headers.get("location").includes("Tavoryn-Terminal-1.0.0.AppImage"),
      "should point to AppImage artifact"
    );

    console.log("✔ All download endpoint checks passed successfully!");
  } finally {
    server.close();
  }
});
