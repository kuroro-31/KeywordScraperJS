// contentScript.js
(() => {
  // リキャプチャページの検出 - 強化版
  function detectRecaptcha() {
    // 通常のリキャプチャフレーム
    const recaptchaFrame = document.querySelector('iframe[src*="recaptcha"]');
    const challengeFrame = document.querySelector('iframe[src*="challenge"]');
    const captchaForm = document.querySelector("form#captcha-form");
    const recaptchaElements = document.querySelectorAll(
      '.g-recaptcha, div[class*="captcha"], div[id*="captcha"]'
    );

    // Googleのsorryページの検出
    const isSorryPage =
      window.location.href.includes("/sorry/index") ||
      window.location.href.includes("/sorry?") ||
      window.location.href.includes("security_check") ||
      document.title.includes("Sorry") ||
      document.title.includes("Security Check") ||
      document.title.includes("セキュリティ チェック") ||
      document.querySelector("form#captcha-form");

    // テキストコンテンツによる検出
    const bodyText = document.body?.textContent?.toLowerCase() || "";
    const suspiciousTexts = [
      "通常と異なるトラフィックが検出されました",
      "このページについて",
      "セキュリティ チェック",
      "reCAPTCHA による確認",
      "ロボットではありません",
      "verify you're human",
      "security check",
      "unusual traffic",
      "automated queries",
      "bot check",
      "human verification",
    ];
    const hasRecaptchaText = suspiciousTexts.some((text) =>
      bodyText.includes(text.toLowerCase())
    );

    // ネットワークリクエストによる検出
    const hasRecaptchaRequests = performance.getEntries().some((entry) => {
      const url = entry.name.toLowerCase();
      return (
        url.includes("recaptcha") ||
        url.includes("challenge") ||
        url.includes("captcha") ||
        url.includes("sorry")
      );
    });

    if (
      recaptchaFrame ||
      challengeFrame ||
      captchaForm ||
      recaptchaElements.length > 0 ||
      isSorryPage ||
      hasRecaptchaText ||
      hasRecaptchaRequests
    ) {
      // 検出理由の詳細を収集
      const detectionReasons = {
        recaptchaFrame: !!recaptchaFrame,
        challengeFrame: !!challengeFrame,
        captchaForm: !!captchaForm,
        recaptchaElements: recaptchaElements.length > 0,
        isSorryPage: isSorryPage,
        hasRecaptchaText: hasRecaptchaText,
        hasRecaptchaRequests: hasRecaptchaRequests,
      };

      // より詳細な情報を含めてメッセージを送信
      chrome.runtime.sendMessage({
        type: "RECAPTCHA_DETECTED",
        payload: {
          url: window.location.href,
          timestamp: new Date().toISOString(),
          // URLからキーワードを抽出する試み
          keyword:
            new URLSearchParams(window.location.search).get("q") || undefined,
          detectionReasons: detectionReasons,
          pageTitle: document.title,
          pageContent: bodyText.substring(0, 200), // 最初の200文字だけ送信
        },
      });

      // リキャプチャ回避を試みる
      attemptRecaptchaBypass();
      return true;
    }
    return false;
  }

  // リキャプチャ回避を試みる関数
  function attemptRecaptchaBypass() {
    // 1. ページの動作を一時停止（自動化検出を避けるため）
    setTimeout(() => {
      // 2. 人間らしい動きをシミュレート
      simulateHumanBehavior();

      // 3. リキャプチャフォームがあれば、それを検出
      const captchaForm = document.querySelector("form#captcha-form");
      const recaptchaFrame = document.querySelector('iframe[src*="recaptcha"]');

      if (captchaForm) {
        // 4. フォームがある場合は、ユーザーに通知
        chrome.runtime.sendMessage({
          type: "RECAPTCHA_FORM_DETECTED",
          payload: {
            message:
              "リキャプチャフォームが検出されました。手動での対応が必要です。",
            url: window.location.href,
          },
        });
      } else if (recaptchaFrame) {
        // 5. フレームがある場合も、ユーザーに通知
        chrome.runtime.sendMessage({
          type: "RECAPTCHA_FRAME_DETECTED",
          payload: {
            message:
              "リキャプチャフレームが検出されました。手動での対応が必要です。",
            url: window.location.href,
          },
        });
      } else {
        // 6. それ以外の場合は、ページをリロード
        setTimeout(() => {
          // 50%の確率でリロード、50%の確率で前のページに戻る
          if (Math.random() > 0.5) {
            window.location.reload();
          } else {
            history.back();
          }
        }, getRandomDelay(3000, 8000));
      }
    }, getRandomDelay(2000, 5000));
  }

  // 人間らしい行動をシミュレートする関数
  function simulateHumanBehavior() {
    // ランダムなスクロール
    const scrollAmount = Math.floor(Math.random() * window.innerHeight * 0.7);
    window.scrollTo({
      top: scrollAmount,
      behavior: "smooth",
    });

    // ランダムなマウス移動をシミュレート（実際には動きませんが、イベントは発生）
    for (let i = 0; i < 5; i++) {
      setTimeout(() => {
        const x = Math.floor(Math.random() * window.innerWidth);
        const y = Math.floor(Math.random() * window.innerHeight);

        const mouseEvent = new MouseEvent("mousemove", {
          bubbles: true,
          cancelable: true,
          view: window,
          clientX: x,
          clientY: y,
        });

        document.dispatchEvent(mouseEvent);
      }, getRandomDelay(300, 1500));
    }

    // ランダムな要素をクリック（実際のクリックではなく、イベントのみ）
    setTimeout(() => {
      const allElements = document.querySelectorAll("a, button, input, div");
      if (allElements.length > 0) {
        const randomElement =
          allElements[Math.floor(Math.random() * allElements.length)];

        // クリックイベントを発生させるが、実際のアクションは起こさない
        const clickEvent = new MouseEvent("mouseover", {
          bubbles: true,
          cancelable: true,
          view: window,
        });

        randomElement.dispatchEvent(clickEvent);
      }
    }, getRandomDelay(2000, 4000));
  }

  // ランダムな待機時間を取得する関数
  function getRandomDelay(min, max) {
    // より自然な分布のランダム値を生成
    const gaussian = () => {
      let u = 0,
        v = 0;
      while (u === 0) u = Math.random();
      while (v === 0) v = Math.random();
      return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    };

    // ガウス分布を使用して、より自然な待機時間を生成
    const mean = (min + max) / 2;
    const stdDev = (max - min) / 6; // 6シグマルール
    let result;

    do {
      result = Math.round(gaussian() * stdDev + mean);
    } while (result < min || result > max);

    return result;
  }

  // 検索結果を解析する関数を修正
  function analyzeSearchResults() {
    try {
      // 検索結果の総ヒット数を取得
      let totalHitCount = 0;
      const resultStats = document.getElementById("result-stats");
      if (resultStats) {
        const match = resultStats.textContent
          .replace(/\s/g, "")
          .match(/約?([\d,]+)/);
        if (match && match[1]) {
          totalHitCount = parseInt(match[1].replace(/,/g, ""), 10);
        }
      }

      // 各種カウンターの初期化
      let QA_count = 0;
      let QA_highestRank = null;
      let Blog_count = 0;
      let Blog_highestRank = null;
      let SNS_count = 0;
      let SNS_highestRank = null;
      let sns_details = {
        Tiktok: 0,
        Instagram: 0,
        X: 0,
        Facebook: 0,
        Youtube: 0,
        Twitch: 0,
      };

      // 検索結果の各アイテムを解析
      const searchItems = document.querySelectorAll("div.g");
      let rank = 1;

      searchItems.forEach((item) => {
        const link = item.querySelector("a");
        if (!link || !link.href) return;

        try {
          // URLの妥当性をチェック
          const url = new URL(link.href);
          const domain = url.hostname.toLowerCase();

          // Q&Aサイトのチェック
          if (QA_SITES.some((site) => domain.includes(site))) {
            QA_count++;
            if (!QA_highestRank || rank < QA_highestRank) {
              QA_highestRank = rank;
            }
          }

          // ブログサイトのチェック
          if (BLOG_SITES.some((site) => domain.includes(site))) {
            Blog_count++;
            if (!Blog_highestRank || rank < Blog_highestRank) {
              Blog_highestRank = rank;
            }
          }

          // SNSサイトのチェック
          Object.entries(SNS_SITES).forEach(([platform, domains]) => {
            if (domains.some((site) => domain.includes(site))) {
              SNS_count++;
              sns_details[platform]++;
              if (!SNS_highestRank || rank < SNS_highestRank) {
                SNS_highestRank = rank;
              }
            }
          });

          rank++;
        } catch (urlError) {
          console.warn("無効なURL:", link.href, urlError);
          // 無効なURLの場合はスキップして次の結果へ
          return;
        }
      });

      return {
        totalHitCount,
        QA_count,
        QA_highestRank,
        Blog_count,
        Blog_highestRank,
        SNS_count,
        SNS_highestRank,
        sns_details,
      };
    } catch (error) {
      console.error("解析エラー:", error);
      // エラー情報を詳細化
      const enhancedError = new Error(`解析エラー: ${error.message}`);
      enhancedError.originalError = error;
      enhancedError.url = window.location.href;
      enhancedError.timestamp = new Date().toISOString();
      throw enhancedError;
    }
  }

  // スクロール処理を行う関数
  function performScroll() {
    // ランダムなスクロールパターンを追加
    const scrollPatterns = [
      { delay: 1000, duration: 2000 }, // 1秒待機後、2秒かけてスクロール
      { delay: 500, duration: 1500 }, // 0.5秒待機後、1.5秒かけてスクロール
      { delay: 1500, duration: 2500 }, // 1.5秒待機後、2.5秒かけてスクロール
    ];

    const pattern =
      scrollPatterns[Math.floor(Math.random() * scrollPatterns.length)];

    setTimeout(() => {
      window.scrollTo({
        top: document.body.scrollHeight,
        behavior: "smooth",
        duration: pattern.duration,
      });
    }, pattern.delay);
  }

  // メイン処理
  function main() {
    try {
      // Googleの検索結果ページかどうかを確認
      const isSearchResultPage =
        window.location.href.includes("/search?") &&
        document.querySelector("#search") !== null;

      // 検索結果ページでない場合は処理を終了
      if (!isSearchResultPage) {
        console.log("検索結果ページではないため、分析をスキップします");
        return;
      }

      // リキャプチャチェック
      if (detectRecaptcha()) {
        chrome.runtime.sendMessage({
          type: "RECAPTCHA_DETECTED",
          message: "リキャプチャが検出されました",
          url: window.location.href,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // 検索結果を解析
      const results = analyzeSearchResults();
      console.log("解析結果:", results);

      // 検索処理が実行中かどうかを確認してからスクロール処理を実行
      chrome.storage.local.get(["isAnalyzing"], function (result) {
        console.log("isAnalyzing状態:", result);

        // isAnalyzingがtrueの場合のみスクロール処理を実行
        if (result && result.isAnalyzing === true) {
          console.log("検索処理実行中のため、スクロールを実行します");
          performScroll();
        } else {
          console.log("検索処理実行中ではないため、スクロールをスキップします");
        }

        // 結果をbackground.jsに送信
        chrome.runtime.sendMessage({
          type: "DOM_PARSED",
          payload: results,
        });
      });
    } catch (error) {
      console.error("メイン処理エラー:", error);
      chrome.runtime.sendMessage({
        type: "ANALYSIS_ERROR",
        payload: {
          error: error.message,
        },
      });
    }
  }

  // ページ読み込み完了時に実行
  if (document.readyState === "complete") {
    // タブが更新されたときにisAnalyzingの状態を再確認
    chrome.storage.local.get(["isAnalyzing"], function (result) {
      console.log("ページ読み込み完了時のisAnalyzing状態:", result);
      // isAnalyzingがfalseまたは未定義の場合は、念のため明示的にfalseに設定
      if (!result || result.isAnalyzing !== true) {
        chrome.storage.local.set({ isAnalyzing: false }, () => {
          console.log("isAnalyzingをfalseに再設定しました");
          main();
        });
      } else {
        main();
      }
    });
  } else {
    window.addEventListener("load", function () {
      // タブが読み込まれたときにisAnalyzingの状態を再確認
      chrome.storage.local.get(["isAnalyzing"], function (result) {
        console.log("ページ読み込み完了時のisAnalyzing状態:", result);
        // isAnalyzingがfalseまたは未定義の場合は、念のため明示的にfalseに設定
        if (!result || result.isAnalyzing !== true) {
          chrome.storage.local.set({ isAnalyzing: false }, () => {
            console.log("isAnalyzingをfalseに再設定しました");
            main();
          });
        } else {
          main();
        }
      });
    });
  }

  chrome.runtime.onMessage.addListener(function (
    request,
    sender,
    sendResponse
  ) {
    if (request.action === "startSolving") {
      startSolving();
    }
  });

  function startSolving() {
    solve();
  }

  // 検索キーワードを入力して検索を実行する関数を追加
  function executeSearch(keyword) {
    try {
      const searchInput = document.querySelector('textarea[name="q"]');
      const searchForm = document.querySelector("form");

      if (searchInput && searchForm) {
        // キーワードを1文字ずつ入力（人間らしい動作を模倣）
        const inputDelay = 50; // 50msごとに1文字入力（100msから短縮）
        const inputValue = keyword.split("");

        const typeCharacter = (index) => {
          if (index < inputValue.length) {
            searchInput.value += inputValue[index];
            setTimeout(() => typeCharacter(index + 1), inputDelay);
          } else {
            // ランダムな待機時間後にフォームを送信（1-2秒に短縮）
            const submitDelay = Math.floor(Math.random() * 1000) + 1000;
            setTimeout(() => searchForm.submit(), submitDelay);
          }
        };

        typeCharacter(0);
      }
    } catch (error) {
      console.error("検索実行エラー:", error);
      throw error;
    }
  }

  // メッセージリスナーを追加
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "searchKeyword") {
      executeSearch(message.keyword);
      return true;
    }
  });
})();
