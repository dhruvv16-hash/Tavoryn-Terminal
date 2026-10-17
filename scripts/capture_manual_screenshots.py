import os
import time
from playwright.sync_api import sync_playwright

ASSETS_DIR = os.path.abspath("docs/user-manual/assets")
os.makedirs(ASSETS_DIR, exist_ok=True)

TARGETS = [
    {
        "name": "dashboard-workspace-overview.png",
        "cmd": None,  # initial overview
        "wait": 2500,
        "max_panel": None
    },
    {
        "name": "world-markets-wei.png",
        "cmd": "WEI",
        "wait": 2500,
        "max_panel": 0
    },
    {
        "name": "chart-technical-analysis-gp.png",
        "cmd": "SPX INDEX GP",
        "wait": 3000,
        "max_panel": 0
    },
    {
        "name": "dcf-valuation-model.png",
        "cmd": "AAPL US EQUITY DCF",
        "wait": 3000,
        "max_panel": 0
    },
    {
        "name": "portfolio-stress-testing.png",
        "cmd": "PORT STRESS",
        "wait": 3000,
        "max_panel": 0
    },
    {
        "name": "backtest-replay-engine.png",
        "cmd": "SPX INDEX BTST",
        "wait": 3000,
        "max_panel": 0
    },
    {
        "name": "options-chain-omon.png",
        "cmd": "AAPL US EQUITY OMON",
        "wait": 3000,
        "max_panel": 0
    },
    {
        "name": "sec-filings-cf.png",
        "cmd": "AAPL US EQUITY CF",
        "wait": 3000,
        "max_panel": 0
    },
    {
        "name": "economic-calendar-eco.png",
        "cmd": "ECO",
        "wait": 2500,
        "max_panel": 0
    },
    {
        "name": "rates-curve-gc.png",
        "cmd": "GC",
        "wait": 2500,
        "max_panel": 0
    },
    {
        "name": "paper-trading-trad.png",
        "cmd": "TRAD",
        "wait": 2500,
        "max_panel": 0
    },
    {
        "name": "portfolio-holdings-port.png",
        "cmd": "PORT",
        "wait": 2500,
        "max_panel": 0
    },
    {
        "name": "financial-analysis-fa.png",
        "cmd": "AAPL US EQUITY FA",
        "wait": 2500,
        "max_panel": 0
    },
    {
        "name": "screener-equity-scrn.png",
        "cmd": "SCRN",
        "wait": 2500,
        "max_panel": 0
    },
    {
        "name": "ai-research-assistant-ask.png",
        "cmd": "ASKB",
        "wait": 2500,
        "max_panel": 0
    }
]

def main():
    print(f"Connecting to http://localhost:3787 and capturing to {ASSETS_DIR}...")
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1400, "height": 900})
        page.goto("http://localhost:3787")
        page.wait_for_timeout(3000)

        for item in TARGETS:
            name = item["name"]
            cmd = item["cmd"]
            wait_ms = item["wait"]
            max_p = item["max_panel"]
            out_path = os.path.join(ASSETS_DIR, name)

            if cmd:
                print(f"Running '{cmd}' for {name}...")
                page.evaluate(f"window.tavoryn.run('{cmd}', 0)")
                page.wait_for_timeout(wait_ms)
            else:
                print(f"Capturing baseline {name}...")

            if max_p is not None:
                # maximize panel 0 for detail view
                page.evaluate(f"document.querySelectorAll('.panel')[{max_p}].classList.add('max')")
                page.wait_for_timeout(500)
                page.screenshot(path=out_path)
                page.evaluate(f"document.querySelectorAll('.panel')[{max_p}].classList.remove('max')")
                page.wait_for_timeout(300)
            else:
                page.screenshot(path=out_path)

            file_size = os.path.getsize(out_path)
            print(f"  -> Captured {name} ({file_size:,} bytes)")

        browser.close()
    print("Done capturing initial screenshots.")

if __name__ == "__main__":
    main()
