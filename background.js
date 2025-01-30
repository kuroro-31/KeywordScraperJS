// background.js

// 分析対象のキーワードリスト
let keywordQueue = [];
let currentIndex = 0;

// キーワードを順番に処理するフロー
async function processKeywords(keywords) {
  // 保存された結果を取得して、処理済みのキーワードを特定
  const stored = await chrome.storage.local.get("analysisResults");
  const processedKeywords = new Set(
    (stored.analysisResults || []).map((result) => result.Keyword)
  );

  // 未処理のキーワードのみをフィルタリング
  const remainingKeywords = keywords.filter(
    (keyword) => !processedKeywords.has(keyword)
  );

  const chunks = [];
  for (let i = 0; i < remainingKeywords.length; i += 5) {
    chunks.push(remainingKeywords.slice(i, i + 5));
  }

  const totalKeywords = keywords.length;
  let processedCount = processedKeywords.size;

  try {
    for (let i = 0; i < chunks.length; i++) {
      if (i > 0) {
        // インターバル待機中のメッセージを表示
        for (let waitTime = 1; waitTime > 0; waitTime--) {
          chrome.runtime.sendMessage({
            type: "ANALYSIS_UPDATE",
            payload: {
              currentKeyword: "インターバル待機中",
              progressText: `次のバッチまで残り${waitTime}秒 (${processedCount}/${totalKeywords}キーワード完了)`,
            },
          });
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
      try {
        processedCount = await searchKeywords(
          chunks[i],
          processedCount,
          totalKeywords
        );
      } catch (error) {
        // エラーが発生した場合は処理を中断
        console.error("検索処理エラー:", error);

        // エラー通知を送信
        chrome.runtime.sendMessage({
          type: "ANALYSIS_ERROR",
          payload: {
            error: error.message,
            lastKeyword: chunks[i][0],
            currentCount: processedCount,
            totalCount: totalKeywords,
          },
        });

        // Slack通知
        await notifySlack(
          `処理中にエラーが発生しました: ${error.message}`,
          chunks[i][0],
          processedCount,
          totalKeywords,
          error.url ||
            `https://www.google.com/search?q=${encodeURIComponent(
              chunks[i][0]
            )}`
        );

        // エラー通知を表示
        chrome.notifications.create({
          type: "basic",
          iconUrl: "icon48.png",
          title: "エラーが発生しました",
          message: `処理中にエラーが発生しました: ${error.message}`,
        });

        // 処理を中断
        return;
      }
    }

    // 全ての処理が完了したら完了メッセージを送信
    chrome.runtime.sendMessage({
      type: "ANALYSIS_FINISHED",
    });

    // 完了通知を表示
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icon48.png",
      title: "キーワード分析が完了しました",
      message: `${totalKeywords}件のキーワードの分析が完了しました。`,
    });
  } catch (error) {
    console.error("処理エラー:", error);
    // 上位のエラーハンドリングも追加
    chrome.runtime.sendMessage({
      type: "ANALYSIS_ERROR",
      payload: {
        error: error.message,
        currentCount: processedCount,
        totalCount: totalKeywords,
      },
    });
  }
}

// 検索結果を解析する関数を削除（contentScript.jsに移動）
// searchKeywords関数を修正
async function searchKeywords(keywordChunk, processedCount, totalKeywords) {
  console.log("検索開始:", keywordChunk);
  let localProcessedCount = processedCount;

  for (const keyword of keywordChunk) {
    try {
      console.log("現在の検索キーワード:", keyword);

      // searchSingleKeywordの結果を待つ
      const result = await searchSingleKeyword(
        keyword,
        localProcessedCount,
        totalKeywords
      );

      // 結果を保存
      const stored = await chrome.storage.local.get("analysisResults");
      const results = stored.analysisResults || [];
      results.push(result);
      await chrome.storage.local.set({ analysisResults: results });

      console.log("キーワード検索完了:", keyword, result);

      // カウンターをインクリメント
      localProcessedCount++;

      // 次のキーワードの前に待機時間を延長
      await new Promise((resolve) => setTimeout(resolve, 2000)); // 2秒待機に変更
    } catch (error) {
      console.error("検索エラー:", error);

      if (error.message === "RECAPTCHA_DETECTED") {
        // リキャプチャ検出時の処理を改善
        await handleRecaptchaError(
          keyword,
          localProcessedCount,
          totalKeywords,
          error.url || "URL不明"
        );

        // 現在までの結果を保存
        chrome.runtime.sendMessage({
          type: "SAVE_PARTIAL_RESULTS",
          payload: {
            lastKeyword: keyword,
            processedCount: localProcessedCount,
          },
        });

        // エラーを投げる前に一時停止
        await new Promise((resolve) => setTimeout(resolve, 5000));
        throw error;
      }
      // その他のエラーの場合も上位に伝播
      throw error;
    }
  }
  return localProcessedCount;
}

// searchSingleKeyword関数を修正
async function searchSingleKeyword(keyword, processedCount, totalKeywords) {
  try {
    // URLエンコードを確実に行う
    const encodedKeyword = encodeURIComponent(keyword || "");
    if (!encodedKeyword) {
      throw new Error("無効なキーワードです");
    }

    // 最初にURLを定義
    const normalUrl = `https://www.google.com/search?q=${encodedKeyword}`;
    const intitleUrl = `https://www.google.com/search?q=intitle%3A${encodedKeyword}`;
    const allintitleUrl = `https://www.google.com/search?q=allintitle%3A${encodedKeyword}`;

    // URLの妥当性チェック
    try {
      new URL(normalUrl);
      new URL(intitleUrl);
      new URL(allintitleUrl);
    } catch (urlError) {
      throw new Error(`無効なURL: ${urlError.message}`);
    }

    const startTime = Date.now();

    // 進捗状況の更新
    chrome.runtime.sendMessage({
      type: "ANALYSIS_UPDATE",
      payload: {
        currentKeyword: keyword,
        progressText: `処理中: ${
          processedCount + 1
        }/${totalKeywords}キーワード目`,
      },
    });

    // --- 1. 通常検索 ---
    let normalResults = await getSearchResults(
      normalUrl,
      keyword,
      processedCount,
      totalKeywords
    );

    // 各検索の間に十分な待機時間を設定
    await new Promise((resolve) => setTimeout(resolve, 50));

    // --- 2. intitle検索 ---
    let intitleResults = await getSearchResults(
      intitleUrl,
      keyword,
      processedCount,
      totalKeywords
    );

    await new Promise((resolve) => setTimeout(resolve, 50));

    // --- 3. allintitle検索 ---
    let allintitleResults = await getSearchResults(
      allintitleUrl,
      keyword,
      processedCount,
      totalKeywords
    );

    const endTime = Date.now();
    const processingTime = ((endTime - startTime) / 1000).toFixed(1);

    // 結果のnull/undefinedチェック
    return {
      Keyword: keyword || "",
      allintitle件数: allintitleResults?.totalHitCount || 0,
      intitle件数: intitleResults?.totalHitCount || 0,
      "Q&A件数": normalResults?.QA_count || 0,
      "Q&A最高順位": normalResults?.QA_highestRank || null,
      無料ブログ件数: normalResults?.Blog_count || 0,
      ブログ最高順位: normalResults?.Blog_highestRank || null,
      SNS件数: normalResults?.SNS_count || 0,
      SNS最高順位: normalResults?.SNS_highestRank || null,
      sns_details: normalResults?.sns_details || {},
      処理時間: `${processingTime}秒`,
    };
  } catch (error) {
    console.error("検索エラー:", error, {
      keyword,
      processedCount,
      totalKeywords,
    });

    // エラーメッセージを改善
    const errorMessage = error.message || "不明なエラーが発生しました";
    const enhancedError = new Error(errorMessage);
    enhancedError.url =
      error.url ||
      `https://www.google.com/search?q=${encodeURIComponent(keyword || "")}`;
    enhancedError.details = {
      keyword,
      processedCount,
      totalKeywords,
      timestamp: new Date().toISOString(),
    };

    throw enhancedError;
  }
}

// リキャプチャ検出時のSlack通知関数
async function notifySlack(
  message,
  keyword = "",
  processedCount = 0,
  totalKeywords = 0,
  errorUrl = ""
) {
  console.log("Slack通知開始:", {
    message,
    keyword,
    processedCount,
    totalKeywords,
    errorUrl,
  });

  try {
    const result = await chrome.storage.local.get("slackWebhookUrl");
    const SLACK_WEBHOOK_URL = result.slackWebhookUrl;

    if (!SLACK_WEBHOOK_URL) {
      console.error("Slack Webhook URLが設定されていません");
      return;
    }

    const response = await fetch(SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: "🚨 キーワード分析アラート",
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `*${message}*`,
            },
          },
          {
            type: "section",
            fields: [
              {
                type: "mrkdwn",
                text: `*キーワード:*\n${keyword || "不明"}`,
              },
              {
                type: "mrkdwn",
                text: `*進捗状況:*\n${processedCount}/${totalKeywords} キーワード完了`,
              },
              {
                type: "mrkdwn",
                text: `*発生時刻:*\n${new Date().toLocaleString("ja-JP")}`,
              },
              {
                type: "mrkdwn",
                text: `*URL:*\n${errorUrl || "不明"}`,
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`Slack通知エラー: ${response.status}`);
    }

    console.log("Slack通知成功:", await response.text());
  } catch (error) {
    console.error("Slack通知エラー:", error);
  }
}

// Google検索URLを開き、contentScriptからDOM解析結果を受け取る
function getSearchResults(searchUrl, keyword, processedCount, totalKeywords) {
  return new Promise((resolve, reject) => {
    let isResolved = false;

    chrome.tabs.create({ url: searchUrl, active: false }, (tab) => {
      const onMessageListener = (message, sender, sendResponse) => {
        if (isResolved) return;
        if (message.type === "DOM_PARSED" && sender.tab.id === tab.id) {
          isResolved = true;
          let data = message.payload;
          chrome.tabs.remove(tab.id);
          chrome.runtime.onMessage.removeListener(onMessageListener);
          resolve(data);
        } else if (
          message.type === "RECAPTCHA_DETECTED" &&
          sender.tab.id === tab.id
        ) {
          isResolved = true;
          chrome.tabs.remove(tab.id);
          chrome.runtime.onMessage.removeListener(onMessageListener);
          reject(new Error("RECAPTCHA_DETECTED"));
        }
      };

      // タブの読み込み完了を監視
      chrome.tabs.onUpdated.addListener(function onUpdated(tabId, changeInfo) {
        if (tabId === tab.id && changeInfo.status === "complete") {
          chrome.tabs.onUpdated.removeListener(onUpdated);

          // DOM解析のための待機時間
          setTimeout(() => {
            if (!isResolved) {
              // タイムアウト処理
              setTimeout(() => {
                if (!isResolved) {
                  isResolved = true;
                  chrome.tabs.remove(tab.id);
                  chrome.runtime.onMessage.removeListener(onMessageListener);
                  reject(new Error("TIMEOUT"));
                }
              }, 30000); // 30秒のタイムアウト
            }
          }, 3000); // 3秒の初期待機
        }
      });

      chrome.runtime.onMessage.addListener(onMessageListener);
    });
  });
}

// reCAPTCHAページを検出する関数を修正
function isRecaptchaPage(url, html) {
  return (
    url.includes("google.com/sorry/") || // Google sorry ページの検出を追加
    html.includes("g-recaptcha") ||
    html.includes("recaptcha") ||
    (html.includes("このページについて") &&
      html.includes("通常と異なるトラフィックが検出されました"))
  );
}

// manifest.json で webRequest 権限が必要
chrome.webRequest?.onCompleted?.addListener(
  function (details) {
    if (details.type === "main_frame") {
      chrome.tabs.get(details.tabId, function (tab) {
        if (
          tab &&
          (tab.url.includes("google.com/sorry/") ||
            tab.url.includes("/recaptcha/") ||
            (tab.url.includes("google.com/search") &&
              details.statusCode === 429))
        ) {
          chrome.notifications.create({
            type: "basic",
            iconUrl: "icon48.png",
            title: "reCAPTCHA検出",
            message:
              "Googleの検索でreCAPTCHAが表示されています。手動での対応が必要です。",
          });

          try {
            chrome.tabs.sendMessage(details.tabId, {
              type: "RECAPTCHA_DETECTED",
              message: "リキャプチャが検出されました",
            });
          } catch (error) {
            console.error("タブへのメッセージ送信エラー:", error);
          }

          chrome.runtime.sendMessage({
            type: "RECAPTCHA_INTERRUPT",
          });

          // Slackに通知（URLを追加）
          notifySlack(
            "Googleの検索でreCAPTCHAが表示されています。手動での対応が必要です。",
            keywordQueue[currentIndex],
            currentIndex,
            keywordQueue.length,
            tab.url // URLを追加
          );
        }
      });
    }
  },
  { urls: ["*://*.google.com/*"] }
);

// popup.js からの分析開始指示を受け取る
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "START_ANALYSIS") {
    keywordQueue = msg.payload.keywords;
    currentIndex = 0;
    processKeywords(keywordQueue);
  }
});

// リキャプチャ検出時のメッセージ処理を修正
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "RECAPTCHA_DETECTED") {
    // Slackに通知
    notifySlack(
      "リキャプチャが検出されました。手動での対応が必要です。",
      message.keyword || "不明",
      message.currentCount || 0,
      message.totalCount || 0,
      message.errorUrl || ""
    );

    // ポップアップに通知
    chrome.runtime.sendMessage({
      type: "RECAPTCHA_INTERRUPT",
      payload: {
        lastKeyword: message.keyword,
        currentCount: message.currentCount,
        totalCount: message.totalCount,
        errorUrl: message.errorUrl,
      },
    });
  }
  // 他のメッセージ処理...
});

// handleRecaptchaError関数を改善
async function handleRecaptchaError(
  keyword,
  processedCount,
  totalKeywords,
  url
) {
  try {
    // Slack通知
    await notifySlack(
      "検索が一時停止されました。reCAPTCHAによる確認が必要です。",
      keyword,
      processedCount,
      totalKeywords,
      url
    );

    // 通知を表示
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icon48.png",
      title: "検索が一時停止されました",
      message: "reCAPTCHAによる確認が必要です。手動で対応してください。",
      priority: 2,
      requireInteraction: true,
    });

    // ポップアップに通知
    chrome.runtime.sendMessage({
      type: "RECAPTCHA_INTERRUPT",
      payload: {
        lastKeyword: keyword,
        currentCount: processedCount,
        totalCount: totalKeywords,
        url: url,
        timestamp: new Date().toISOString(),
      },
    });

    // 一時停止状態を保存
    await chrome.storage.local.set({
      pausedState: {
        lastKeyword: keyword,
        processedCount: processedCount,
        totalKeywords: totalKeywords,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("reCAPTCHAエラーハンドリング中のエラー:", error);
  }
}

// 既存のコードの最後に追加
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url?.startsWith('https://www.google.com/search?')) {
    chrome.action.openPopup();
  }
});
