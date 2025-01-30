// popup.js
// グローバル変数として定義
let collectedResults = [];

document.addEventListener("DOMContentLoaded", async () => {
  const keywordInput = document.getElementById("keywordInput");
  const startBtn = document.getElementById("startBtn");
  const clearKeywordsBtn = document.getElementById("clearKeywordsBtn");
  const statusEl = document.getElementById("status");
  const resultsContainer = document.getElementById("results-container");
  const csvPreview = document.getElementById("csv-preview");
  const copyCsvBtn = document.getElementById("copy-csv-btn");
  const clearResultsBtn = document.getElementById("clear-results-btn");

  // 初期状態で非表示にする
  csvPreview.style.display = "none";
  copyCsvBtn.style.display = "none";
  clearResultsBtn.style.display = "none";

  // 保存された結果とキーワードを復元
  const stored = await chrome.storage.local.get([
    "analysisResults",
    "savedKeywords",
  ]);
  if (stored.analysisResults && stored.analysisResults.length > 0) {
    // 結果がある場合は表示する
    resultsContainer.style.display = "block";
    csvPreview.style.display = "block";
    copyCsvBtn.style.display = "block";
    clearResultsBtn.style.display = "block";

    collectedResults = stored.analysisResults;
    updateCsvPreview(collectedResults);
  }
  if (stored.savedKeywords) {
    keywordInput.value = stored.savedKeywords;
  }

  // キーワード入力の変更を監視して保存
  keywordInput.addEventListener("input", () => {
    chrome.storage.local.set({ savedKeywords: keywordInput.value });
  });

  // キーワードクリアボタンの処理
  clearKeywordsBtn.addEventListener("click", () => {
    if (confirm("入力されたキーワードをクリアしますか？")) {
      keywordInput.value = "";
      chrome.storage.local.remove("savedKeywords");
    }
  });

  // background.js からのメッセージを受け取って結果表示を更新
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "ANALYSIS_UPDATE") {
      const { currentKeyword, progressText } = message.payload;
      statusEl.textContent = `${currentKeyword}\n${progressText}`;
    } else if (message.type === "ANALYSIS_RESULT") {
      // 結果表示要素を表示
      csvPreview.style.display = "block";
      copyCsvBtn.style.display = "block";
      clearResultsBtn.style.display = "block";

      const { keywordResult, progressInfo } = message.payload;
      collectedResults.push(keywordResult);

      // 結果とキーワードの状態を保存
      chrome.storage.local.set({
        analysisResults: collectedResults,
        savedKeywords: keywordInput.value,
      });

      // 処理済みのキーワードをtextareaから削除（実際に処理されたキーワードを削除）
      const lines = keywordInput.value.split("\n");
      const updatedLines = lines.filter((line) => {
        const trimmedLine = line.trim();
        return trimmedLine !== keywordResult.Keyword && trimmedLine.length > 0;
      });
      keywordInput.value = updatedLines.join("\n");

      // CSV形式で結果を表示
      updateCsvPreview(collectedResults);

      // 進捗状況を更新
      statusEl.textContent = `処理完了: ${progressInfo.current}/${progressInfo.total}キーワード\n処理時間: ${progressInfo.processingTime}秒`;
    } else if (message.type === "ANALYSIS_FINISHED") {
      statusEl.textContent = "全キーワードの分析が完了しました。";
    } else if (message.type === "RECAPTCHA_INTERRUPT") {
      const { lastKeyword, currentCount, totalCount } = message.payload;
      statusEl.textContent = `⚠️ リキャプチャにより中断されました。\n処理済み: ${currentCount}/${totalCount}キーワード\n最後のキーワード: ${lastKeyword}`;
    } else if (message.type === "ANALYSIS_ERROR") {
      const { error, lastKeyword, currentCount, totalCount } = message.payload;
      statusEl.textContent = `⚠️ エラーが発生しました。\n${error}\n処理済み: ${currentCount}/${totalCount}キーワード\n最後のキーワード: ${lastKeyword}`;
    } else if (message.type === "RECAPTCHA_DETECTED") {
      showError(message.message);
    }
  });

  // 「分析開始」ボタン押下でキーワードを background.js に送信
  startBtn.addEventListener("click", async () => {
    const rawText = keywordInput.value.trim();
    if (!rawText) {
      statusEl.textContent = "キーワードが入力されていません。";
      return;
    }
    // 1行ずつ分割し、空行などは除去
    let keywords = rawText
      .split("\n")
      .map((k) => k.trim())
      .filter((k) => k.length > 1);

    // 新規分析開始時に結果をクリアするかどうかを確認
    if (collectedResults.length > 0) {
      if (confirm("新しい分析を開始します。これまでの結果をクリアしますか？")) {
        collectedResults = [];
        chrome.storage.local.remove("analysisResults");
        document.getElementById("csv-preview").textContent = "";
      }
    }

    // キーワードを保存
    window.originalKeywords = [...keywords];

    // 最初のキーワードから順番に処理するため、配列を逆順にはしない
    chrome.runtime.sendMessage({
      type: "START_ANALYSIS",
      payload: { keywords: keywords },
    });
  });

  // Slack Webhook URL設定の処理を追加
  const slackSettingsSection = document.querySelector(".settings-section");
  const slackUrlInput = document.getElementById("slackWebhookUrl");
  const saveSlackUrlBtn = document.getElementById("saveSlackUrl");

  // 保存されているWebhook URLを読み込む
  chrome.storage.local.get("slackWebhookUrl", (result) => {
    if (result.slackWebhookUrl) {
      slackUrlInput.value = result.slackWebhookUrl;
      // Webhook URLが存在する場合は設定セクションを非表示
      slackSettingsSection.style.display = "none";
    }
  });

  // 設定を表示するためのリンクを追加
  const toggleSettingsLink = document.getElementById("toggleSettings");

  toggleSettingsLink.addEventListener("click", (e) => {
    e.preventDefault();
    if (slackSettingsSection.style.display === "none") {
      slackSettingsSection.style.display = "block";
      toggleSettingsLink.textContent = "Slack設定を隠す";
    } else {
      slackSettingsSection.style.display = "none";
      toggleSettingsLink.textContent = "Slack設定を表示";
    }
  });

  // Webhook URLを保存
  saveSlackUrlBtn.addEventListener("click", () => {
    const webhookUrl = slackUrlInput.value.trim();
    if (webhookUrl) {
      chrome.storage.local.set({ slackWebhookUrl: webhookUrl }, () => {
        saveSlackUrlBtn.textContent = "保存しました！";
        setTimeout(() => {
          saveSlackUrlBtn.textContent = "保存";
          // 保存成功後に設定セクションを非表示
          slackSettingsSection.style.display = "none";
          toggleSettingsLink.textContent = "Slack設定を表示";
        }, 2000);
      });
    }
  });

  // 結果をクリアするボタンを追加
  document.getElementById("clear-results-btn").addEventListener("click", () => {
    if (confirm("保存された結果をすべてクリアしますか？")) {
      collectedResults = [];
      chrome.storage.local.remove("analysisResults");
      document.getElementById("csv-preview").textContent = "";

      // 結果表示要素を非表示
      csvPreview.style.display = "none";
      copyCsvBtn.style.display = "none";
      clearResultsBtn.style.display = "none";
    }
  });
});

function convertToCSV(results) {
  // ヘッダー行を作成
  const headers = [
    "キーワード",
    "allintitle件数",
    "intitle件数",
    "Q&A件数",
    "Q&A最高順位",
    "無料ブログ件数",
    "ブログ最高順位",
    "SNS件数",
    "SNS最高順位",
  ];

  // データ行を作成
  const rows = results.map((result) => [
    result.Keyword,
    result.allintitle件数,
    result.intitle件数,
    result["Q&A件数"],
    result["Q&A最高順位"],
    result.無料ブログ件数,
    result.ブログ最高順位,
    result.SNS件数,
    result.SNS最高順位,
  ]);

  // ヘッダーとデータを結合してTSV形式に変換
  return [headers, ...rows]
    .map((row) => row.map((cell) => String(cell || "")).join("\t"))
    .join("\n");
}

// 分析結果を表示する関数を更新
function displayResults(results) {
  const resultsDiv = document.getElementById("results");
  resultsDiv.innerHTML = "";

  results.forEach((result) => {
    const resultItem = document.createElement("div");
    resultItem.textContent = `${result.url}: ${result.result}`;
    resultsDiv.appendChild(resultItem);
  });
}

// CSV形式のプレビューを更新する関数を修正
function updateCsvPreview(results) {
  const csvPreview = document.getElementById("csv-preview");
  const headers = [
    "キーワード",
    "allintitle件数",
    "intitle件数",
    "Q&A件数",
    "Q&A最高順位",
    "無料ブログ件数",
    "ブログ最高順位",
    "SNS件数",
    "SNS最高順位",
  ];

  // 全ての結果を表示するように変更
  let csvContent = headers.join("\t") + "\n";

  // 全ての結果をループで処理
  results.forEach((result) => {
    const row = [
      result.Keyword,
      result.allintitle件数,
      result.intitle件数,
      result["Q&A件数"],
      result["Q&A最高順位"],
      result.無料ブログ件数,
      result.ブログ最高順位,
      result.SNS件数,
      result.SNS最高順位,
    ]
      .map((cell) => String(cell || "")) // nullやundefinedを空文字に変換
      .join("\t");

    csvContent += row + "\n";
  });

  csvPreview.textContent = csvContent;
  csvPreview.scrollTop = csvPreview.scrollHeight; // 自動スクロール
}

// コピーボタンの処理を追加
document.getElementById("copy-csv-btn").addEventListener("click", () => {
  const csvPreview = document.getElementById("csv-preview");
  navigator.clipboard.writeText(csvPreview.textContent).then(() => {
    // コピー成功時の視覚的フィードバック
    const originalText = csvPreview.style.backgroundColor;
    csvPreview.style.backgroundColor = "#e6ffe6";
    setTimeout(() => {
      csvPreview.style.backgroundColor = originalText;
    }, 200);
  });
});

function showError(message) {
  const errorDiv = document.getElementById("error-message");
  if (errorDiv) {
    errorDiv.textContent = message;
    errorDiv.style.display = "block";
  }
}
