// リキャプチャ検出のための主要な関数
const RecaptchaDetector = {
  RECAPTCHA_INDICATORS: {
    ELEMENTS: [
      ".g-recaptcha",
      "#recaptcha",
      "#captcha-form",
      'iframe[src*="recaptcha"]',
      'script[src*="recaptcha"]',
      'div[class*="captcha"]',
      'div[class*="recaptcha"]',
      'form[action*="sorry"]',
      'div[id*="captcha"]',
      'div[id*="recaptcha"]',
      'iframe[src*="challenges"]',
      'div[class*="challenge"]',
      'div[id*="challenge"]',
    ],
    TEXT_CONTENT: [
      "通常と異なるトラフィックが検出されました",
      "このページについて",
      "セキュリティ チェック",
      "reCAPTCHA による確認",
      "ロボットではありません",
      "verify you're human",
      "security check",
      "unusual traffic",
      "automated queries",
      "automated access",
      "bot check",
      "human verification",
      "security challenge",
      "検証が必要です",
      "自動化されたリクエスト",
      "不審なトラフィック",
      "一時的にブロック",
    ],
    URLS: [
      "google.com/sorry/",
      "/recaptcha/",
      "sorry/index",
      "challenge",
      "verify",
      "/sorry?",
      "captcha",
      "security_check",
    ],
    IMAGE_PATTERNS: ["captcha", "recaptcha", "challenge", "security", "verify"],
  },

  detect() {
    const detectionMethods = [
      this.checkElements(),
      this.checkTextContent(),
      this.checkURL(),
      this.checkNetworkRequests(),
      this.checkImages(),
      this.checkResponseHeaders(),
    ];

    // 2つ以上の検出方法でヒットした場合にリキャプチャと判定
    return detectionMethods.filter(Boolean).length >= 2;
  },

  checkElements() {
    return this.RECAPTCHA_INDICATORS.ELEMENTS.some((selector) => {
      try {
        return document.querySelector(selector) !== null;
      } catch (e) {
        console.warn("セレクタチェックエラー:", e);
        return false;
      }
    });
  },

  checkTextContent() {
    try {
      const bodyText = document.body?.textContent?.toLowerCase() || "";
      return this.RECAPTCHA_INDICATORS.TEXT_CONTENT.some((text) => {
        return bodyText.includes(text.toLowerCase());
      });
    } catch (e) {
      console.warn("テキストチェックエラー:", e);
      return false;
    }
  },

  checkURL() {
    try {
      const currentURL = window.location.href.toLowerCase();
      return this.RECAPTCHA_INDICATORS.URLS.some((urlPart) => {
        return currentURL.includes(urlPart.toLowerCase());
      });
    } catch (e) {
      console.warn("URLチェックエラー:", e);
      return false;
    }
  },

  checkNetworkRequests() {
    try {
      return performance.getEntries().some((entry) => {
        const url = entry.name.toLowerCase();
        return (
          url.includes("recaptcha") ||
          url.includes("challenge") ||
          url.includes("captcha") ||
          url.includes("sorry") ||
          url.includes("verify")
        );
      });
    } catch (e) {
      console.warn("ネットワークリクエストチェックエラー:", e);
      return false;
    }
  },

  // 新機能: 画像のsrc属性をチェック
  checkImages() {
    try {
      const images = document.querySelectorAll("img");
      return Array.from(images).some((img) => {
        if (!img.src) return false;
        const src = img.src.toLowerCase();
        return this.RECAPTCHA_INDICATORS.IMAGE_PATTERNS.some((pattern) =>
          src.includes(pattern)
        );
      });
    } catch (e) {
      console.warn("画像チェックエラー:", e);
      return false;
    }
  },

  // 新機能: レスポンスヘッダーをチェック
  checkResponseHeaders() {
    try {
      // Performance APIを使用してレスポンスヘッダーをチェック
      const entries = performance.getEntriesByType("resource");
      if (!entries || entries.length === 0) return false;

      // PerformanceResourceTimingオブジェクトからは直接ヘッダーにアクセスできないため、
      // URLパターンで判断
      return entries.some((entry) => {
        const url = entry.name.toLowerCase();
        return (
          url.includes("sorry") ||
          url.includes("captcha") ||
          url.includes("challenge")
        );
      });
    } catch (e) {
      console.warn("レスポンスヘッダーチェックエラー:", e);
      return false;
    }
  },

  notifyRecaptchaDetected() {
    try {
      chrome.runtime.sendMessage({
        type: "RECAPTCHA_DETECTED",
        message: "リキャプチャが検出されました",
        url: window.location.href,
        timestamp: new Date().toISOString(),
        details: {
          title: document.title,
          bodyText: document.body?.textContent?.substring(0, 200) || "",
          hasRecaptchaElements: this.checkElements(),
          hasRecaptchaText: this.checkTextContent(),
          isRecaptchaURL: this.checkURL(),
          hasRecaptchaNetworkRequests: this.checkNetworkRequests(),
          hasRecaptchaImages: this.checkImages(),
        },
      });
    } catch (error) {
      console.error("メッセージ送信エラー:", error);
    }
    return true;
  },
};

// グローバルスコープで関数を定義
function checkForRecaptcha() {
  const isRecaptcha = RecaptchaDetector.detect();
  if (isRecaptcha) {
    RecaptchaDetector.notifyRecaptchaDetected();
  }
  return isRecaptcha;
}

// DOMの読み込み完了時に自動チェック
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", checkForRecaptcha);
} else {
  checkForRecaptcha();
}

// DOMの変更を監視
const observer = new MutationObserver(() => {
  checkForRecaptcha();
});

// body要素が存在する場合のみ監視を開始
if (document.body) {
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    characterData: true,
  });
}

// 定期的なチェックを追加（5秒ごと）
setInterval(checkForRecaptcha, 5000);
