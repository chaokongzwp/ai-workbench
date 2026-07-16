import UIKit
import WebKit
import Capacitor

final class WorkbenchViewController: CAPBridgeViewController {
    override func viewDidLoad() {
        super.viewDidLoad()
        configureNativeShell()
    }

    private func configureNativeShell() {
        // Configure the WKWebView once. Reapplying these properties from
        // viewDidLayoutSubviews can trigger another layout/compositing pass on
        // every visual viewport update, which presents as continuous flashing.
        view.backgroundColor = .systemBackground
        view.clipsToBounds = true

        guard let webView else { return }
        webView.isOpaque = true
        webView.backgroundColor = .systemBackground
        webView.scrollView.backgroundColor = .systemBackground
        webView.scrollView.bounces = false
        webView.scrollView.alwaysBounceVertical = false
        webView.scrollView.alwaysBounceHorizontal = false
        webView.scrollView.showsVerticalScrollIndicator = false
        webView.scrollView.showsHorizontalScrollIndicator = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.scrollView.keyboardDismissMode = .interactive
        webView.scrollView.clipsToBounds = true
    }
}
