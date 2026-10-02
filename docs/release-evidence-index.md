# 驗收與事故歷史索引

整理日期：2026-10-02。程式基準為已發布的`ff64705d9315b65f0b38b7b435997ec46030feb1`，公開信箱為`csfishy@gmail.com`。本索引保存原本留在工作區的驗收證據；各報告的SHA、deployment ID、測試數量、PASS／FAIL與舊信箱都只屬於當時版本。

2026-10-01新信箱版的typecheck、lint、474tests、production build與GitHub Backend CI通過；Vercel部署成功，正式首頁及Privacy匿名HTTP200，新地址及mailto可見，舊地址未出現。Google表單新信箱未重驗。

## 2026-09-29至09-30原始紀錄

| 原始報告 | 當次重點與限制 |
| --- | --- |
| [Production Privacy／Feedback正式非AI驗收](production-privacy-feedback-final-acceptance-2026-09-29.md) | `2b6e652`的fresh 338tests／20E2E、Privacy／Feedback PASS，Provider=0；歷史iPhone整體USER-MANUAL PASS，無受測版本明細 |
| [AI品質驗收](production-ai-quality-gate-2026-09-29.md) | 限定的六張合成素材PASS；當時PUBLIC_BETA NOT_OPEN，不代表後續revision已通過 |
| [Public Beta開放嘗試及緊急暫停](public-beta-launch-2026-09-29.md) | launch smoke HTTP500，依停止條件關閉AI，最終PAUSED |
| [Provider文字結構殘留修補](provider-text-debris-regression-2026-09-29.md) | 兩例合法200、使用者人工PASS；後續其他revision仍有失敗，需合併閱讀 |
| [Schema failure diagnostics](schema-failure-diagnostics-2026-09-29.md) | 安全錯誤階段定位，Public Beta PAUSED，Production AI OFF |
| [結構文字可靠性回歸](structured-text-reliability-regression-2026-09-29.md) | 唯一請求在Provider前被日額度拒絕，NOT_RUN；未更換IP或重送 |
| [自然跨日與文字回歸](structured-text-reliability-regression-2026-09-30.md) | 日額度自然重置PASS，文字結構殘留回歸FAIL，第二例未執行 |
| [Schema constraint回歸](structured-schema-constraint-regression-2026-09-30.md) | 固定案例未產生有效結果，停止，Public Beta PAUSED |
| [Provider timeout回歸](provider-timeout-regression-2026-09-30.md) | timeout改動及安全恢復有證據；live可靠性FAIL，恢復NOT_READY |
| [Incomplete response定位](incomplete-response-diagnostics-2026-09-30.md) | `6357aed`單次診斷辨識max_output_tokens，可靠性FAIL，恢復BLOCKED |
| [Structured Outputs pattern A/B](structured-output-pattern-ab-2026-09-30.md) | 結果CONFOUNDED_BY_LATENCY；B被後端拒絕，恢復A及雙層AI OFF，最終PAUSED |

最新實測紀錄包含可靠性失敗與暫停，不能用較早的品質PASS宣布重新開放。當前說明見[Public Beta Readiness](public-beta-readiness.md)，部署版本與實際runtime仍需操作前核對。

## Git與本機交付物整理

原主目錄停在`codex/production-rate-limit-resilience@786db74`；兩項功能已有main對應版本（limits：`3412f99`；homepage demo chrome：`fbdcd6d`）。整理基於最新main套用有用文件，保留各報告原始正文，另更新六份操作／狀態文件，避免舊SHA或信箱覆蓋目前資訊。

原始六份修改、11份未追蹤報告及77份影片相關檔案共94檔，已複製到本機ignored `.tools/repository-cleanup-2026-10-02/original/`並逐檔SHA256確認一致；六份原始修改另存`repository-cleanup-2026-10-02-original-docs` stash。本地舊分支改名為`codex/archive-production-rate-limit-resilience-2026-10-02`保留復原，遠端舊分支未刪除。備份只在本機，沒有提交secrets或環境設定。

影片腳本、旁白JSON、字幕、逐字稿及小海報可追蹤；約96MB的MP4／WAV及中間檔保留在原位置並由`.gitignore`排除。`.vercelignore`排除`deliverables/`。本次不刪除影片、不上傳Release，也不更動AI／Redis／Google設定。

整理驗證：typecheck、lint、442項其餘測試及32項HTTP整合測試、production build、bundle檢查（37檔／0 server-only markers）通過。第一次完整test在沙箱內因Next未啟動而使32項HTTP測試跳過；單獨在沙箱外以本機Provider替身重跑32項全部PASS，保留這項執行差異。Python／PowerShell來源語法有效，91個本機文件連結有效，11份原始報告正文一致（只移除一個結尾空行），75個未修改影片檔案與備份逐檔一致，27個提交檔案共約353KB。沒有修改app、components、lib、tests或dependency lockfile。
