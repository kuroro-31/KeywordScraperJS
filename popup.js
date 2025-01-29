// popup.js
document.addEventListener("DOMContentLoaded", () => {
  const keywordInput = document.getElementById("keywordInput");
  const startBtn = document.getElementById("startBtn");
  const statusEl = document.getElementById("status");
  const resultsContainer = document.getElementById("results-container");

  // 分析結果を蓄積して表示する
  let collectedResults = [];

  // background.js からのメッセージを受け取って結果表示を更新
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "ANALYSIS_UPDATE") {
      const { currentKeyword, progressText } = message.payload;
      statusEl.textContent = `${currentKeyword}\n${progressText}`;
    } else if (message.type === "ANALYSIS_RESULT") {
      const { keywordResult, progressInfo } = message.payload;
      // 結果を保存
      collectedResults.push(keywordResult);

      // 結果を簡易表示
      const line = `${keywordResult.Keyword} (処理時間: ${keywordResult.処理時間})`;
      const p = document.createElement("p");
      p.textContent = line;
      resultsContainer.appendChild(p);

      // CSV形式で結果を表示
      updateCsvPreview(collectedResults);

      // 進捗状況を更新
      statusEl.textContent = `処理完了: ${progressInfo.current}/${progressInfo.total}キーワード\n処理時間: ${progressInfo.processingTime}秒`;
    } else if (message.type === "ANALYSIS_FINISHED") {
      statusEl.textContent = "全キーワードの分析が完了しました。";
    } else if (message.type === "RECAPTCHA_INTERRUPT") {
      // リキャプチャによる中断時の処理
      const { lastKeyword, currentCount, totalCount } = message.payload;

      statusEl.textContent = `⚠️ リキャプチャにより中断されました。\n処理済み: ${currentCount}/${totalCount}キーワード\n最後のキーワード: ${lastKeyword}`;

      // 中断時用のダウンロードボタンを追加
      const downloadButton = document.createElement("button");
      downloadButton.textContent = "途中結果をダウンロード";
      downloadButton.style.backgroundColor = "#ff9800"; // 警告色
      downloadButton.addEventListener("click", () => {
        const csvContent = convertToCSV(collectedResults);
        const blob = new Blob([csvContent], {
          type: "text/csv;charset=utf-8;",
        });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `keyword_analysis_interrupted_${new Date()
          .toISOString()
          .slice(0, 10)}.csv`;
        link.click();
        URL.revokeObjectURL(link.href);
      });
      resultsContainer.appendChild(downloadButton);

      // 再開ボタンを追加
      const restartButton = document.createElement("button");
      restartButton.textContent = "最初から再開";
      restartButton.style.marginLeft = "10px";
      restartButton.addEventListener("click", () => {
        location.reload(); // ページをリロード
      });
      resultsContainer.appendChild(restartButton);
    } else if (message.type === "ANALYSIS_ERROR") {
      // 一般エラー時の処理
      const { error, lastKeyword, currentCount, totalCount } = message.payload;

      statusEl.textContent = `⚠️ エラーが発生しました。\n${error}\n処理済み: ${currentCount}/${totalCount}キーワード\n最後のキーワード: ${lastKeyword}`;

      // エラー時用のダウンロードボタンを追加
      const downloadButton = document.createElement("button");
      downloadButton.textContent = "途中結果をダウンロード";
      downloadButton.style.backgroundColor = "#f44336"; // エラー色
      downloadButton.addEventListener("click", () => {
        const csvContent = convertToCSV(collectedResults);
        const blob = new Blob([csvContent], {
          type: "text/csv;charset=utf-8;",
        });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `keyword_analysis_error_${new Date()
          .toISOString()
          .slice(0, 10)}.csv`;
        link.click();
        URL.revokeObjectURL(link.href);
      });
      resultsContainer.appendChild(downloadButton);

      // 再開ボタンを追加
      const restartButton = document.createElement("button");
      restartButton.textContent = "最初から再開";
      restartButton.style.marginLeft = "10px";
      restartButton.addEventListener("click", () => {
        location.reload();
      });
      resultsContainer.appendChild(restartButton);
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

    // 事前に表示リセット
    collectedResults = [];
    resultsContainer.innerHTML = "";
    statusEl.textContent = "キーワード分析を開始します...";

    if (keywords.length > 5) {
      // 5個以上の場合は新しい分割処理を使用
      chrome.runtime.sendMessage({
        type: "START_ANALYSIS",
        payload: { keywords: keywords },
      });
    } else {
      // 5個以下の場合も同じメッセージタイプを使用
      chrome.runtime.sendMessage({
        type: "START_ANALYSIS",
        payload: { keywords: keywords },
      });
    }
  });
});

function downloadCSV(data) {
  const csvContent = convertToCSV(data);
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `analysis_result_${new Date()
    .toISOString()
    .slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

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

  // ヘッダーとデータを結合してCSV形式に変換
  return [headers, ...rows]
    .map((row) => row.map((cell) => `"${cell}"`).join(","))
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

  // ダウンロードボタンを追加
  const downloadButton = document.createElement("button");
  downloadButton.textContent = "CSVダウンロード";
  downloadButton.addEventListener("click", () => downloadCSV(results));
  resultsDiv.appendChild(downloadButton);
}

// CSV形式のプレビューを更新する関数
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

  // ヘッダー行を追加（最初の結果の時のみ）
  if (results.length === 1) {
    csvPreview.textContent = headers.join(",") + "\n";
  }

  // 最新の結果を追加
  const latestResult = results[results.length - 1];
  const row = [
    latestResult.Keyword,
    latestResult.allintitle件数,
    latestResult.intitle件数,
    latestResult["Q&A件数"],
    latestResult["Q&A最高順位"],
    latestResult.無料ブログ件数,
    latestResult.ブログ最高順位,
    latestResult.SNS件数,
    latestResult.SNS最高順位,
  ]
    .map((cell) => `"${cell || ""}"`)
    .join(",");

  csvPreview.textContent += row + "\n";
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
