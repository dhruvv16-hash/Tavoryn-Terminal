import os
from playwright.sync_api import sync_playwright

ASSETS_DIR = os.path.abspath("docs/user-manual/assets")

def test_manual():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1400, "height": 900})

        # 1. Direct navigation to /user-manual
        print("Testing direct navigation to /user-manual...")
        page.goto("http://localhost:3787/user-manual")
        page.wait_for_timeout(1500)
        
        # Verify manualView is visible and grid is hidden
        mv_hidden = page.evaluate("document.getElementById('manualView').hidden")
        grid_hidden = page.evaluate("document.getElementById('grid').hidden")
        print(f"manualView hidden: {mv_hidden}, grid hidden: {grid_hidden}")
        assert not mv_hidden, "manualView should be visible"
        assert grid_hidden, "grid should be hidden"

        # Capture user-manual-interface.png
        manual_screenshot = os.path.join(ASSETS_DIR, "user-manual-interface.png")
        page.screenshot(path=manual_screenshot)
        print(f"Captured {manual_screenshot} ({os.path.getsize(manual_screenshot):,} bytes)")

        # 2. Test search functionality
        print("Testing search for 'DCF'...")
        page.fill("#manualSearch", "DCF")
        page.wait_for_timeout(500)
        results_count = page.evaluate("document.querySelectorAll('.search-result-item').length")
        print(f"Search results count for 'DCF': {results_count}")
        assert results_count > 0, "Should have search results for 'DCF'"

        # Capture search results screenshot
        search_screenshot = os.path.join(ASSETS_DIR, "user-manual-search.png")
        page.screenshot(path=search_screenshot)
        print(f"Captured {search_screenshot} ({os.path.getsize(search_screenshot):,} bytes)")

        # Click the DCF search result
        print("Clicking first search result...")
        page.click(".search-result-item")
        page.wait_for_timeout(500)
        article_title = page.evaluate("document.querySelector('.manual-article h1').textContent")
        print(f"Active article title: {article_title}")
        assert "DCF" in article_title or "Quantitative" in article_title, "Should load DCF section"

        # 3. Test Back to Terminal
        print("Clicking Back to Terminal...")
        page.click("#manualBackBtn")
        page.wait_for_timeout(500)
        url = page.url
        mv_hidden = page.evaluate("document.getElementById('manualView').hidden")
        grid_hidden = page.evaluate("document.getElementById('grid').hidden")
        print(f"After Back: URL={url}, mv_hidden={mv_hidden}, grid_hidden={grid_hidden}")
        assert mv_hidden, "manualView should be hidden after Back"
        assert not grid_hidden, "grid should be visible after Back"

        # 4. Test clicking HELP toplink in header
        print("Clicking HELP toplink in header...")
        page.click("#helpLink")
        page.wait_for_timeout(500)
        url = page.url
        mv_hidden = page.evaluate("document.getElementById('manualView').hidden")
        grid_hidden = page.evaluate("document.getElementById('grid').hidden")
        print(f"After HELP link: URL={url}, mv_hidden={mv_hidden}, grid_hidden={grid_hidden}")
        assert not mv_hidden, "manualView should be visible after HELP link"
        assert "/user-manual" in url, "URL should update to /user-manual"

        # 5. Test Escape key
        print("Testing Escape key...")
        page.keyboard.press("Escape")
        page.wait_for_timeout(500)
        mv_hidden = page.evaluate("document.getElementById('manualView').hidden")
        grid_hidden = page.evaluate("document.getElementById('grid').hidden")
        print(f"After Escape: mv_hidden={mv_hidden}, grid_hidden={grid_hidden}")
        assert mv_hidden, "manualView should be hidden after Escape"
        assert not grid_hidden, "grid should be visible after Escape"

        # 6. Test direct navigation to /help
        print("Testing direct navigation to /help...")
        page.goto("http://localhost:3787/help")
        page.wait_for_timeout(1000)
        mv_hidden = page.evaluate("document.getElementById('manualView').hidden")
        print(f"/help route: mv_hidden={mv_hidden}")
        assert not mv_hidden, "manualView should be visible on /help"

        # 7. Test browser refresh on /user-manual
        print("Testing browser refresh on /user-manual...")
        page.goto("http://localhost:3787/user-manual")
        page.wait_for_timeout(500)
        page.reload()
        page.wait_for_timeout(1000)
        mv_hidden = page.evaluate("document.getElementById('manualView').hidden")
        print(f"After reload: mv_hidden={mv_hidden}")
        assert not mv_hidden, "manualView should remain visible after reload"

        # 8. Test browser back/forward
        print("Testing browser back and forward...")
        page.click("#manualBackBtn")
        page.wait_for_timeout(500)
        assert page.evaluate("document.getElementById('manualView').hidden"), "Should be on terminal"
        page.go_back()
        page.wait_for_timeout(500)
        assert not page.evaluate("document.getElementById('manualView').hidden"), "Should be on manual after go_back"
        page.go_forward()
        page.wait_for_timeout(500)
        assert page.evaluate("document.getElementById('manualView').hidden"), "Should be on terminal after go_forward"

        # 9. Test mobile responsiveness
        print("Testing mobile viewport 375x812...")
        mobile_page = browser.new_page(viewport={"width": 375, "height": 812})
        mobile_page.goto("http://localhost:3787/user-manual")
        mobile_page.wait_for_timeout(1000)
        mobile_screenshot = os.path.join(ASSETS_DIR, "user-manual-mobile.png")
        mobile_page.screenshot(path=mobile_screenshot)
        print(f"Captured mobile screenshot: {mobile_screenshot} ({os.path.getsize(mobile_screenshot):,} bytes)")
        mobile_page.close()

        browser.close()
        print("All Playwright verification tests PASSED successfully!")

if __name__ == "__main__":
    test_manual()
